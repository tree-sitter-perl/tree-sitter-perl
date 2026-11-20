/* tsp_quote_closer.h
 *
 * Is the closer of a ' or " string really a closer?
 *
 * A quote that is never closed still finds a closer further down the file: the
 * opener of the next string.  Taking it turns every later string inside out,
 * which is what one half-typed quote does to an editor's tree.  So the closer
 * the scanner's lookahead found is asked whether it reads as one.
 *
 * tsp_closer_opens_next_string(rest, len, quote, crossed_line, before)
 * returns TRUE when the quote character just before `rest` is the next
 * string's opener.
 *
 *   rest, len     the codepoints after that quote, up to the end of its line
 *                 (the line terminator excluded) or TSP_CLOSER_WINDOW of them
 *   quote         ' or "
 *   crossed_line  the string's opener is on an earlier line
 *   before        the two codepoints before that quote, nearest first; 0 for
 *                 one that is not on the quote's line or not known.  An
 *                 escape counts as a word character: it is string content
 *
 * It is the next string's opener when
 *
 *   1. the next token on the line cannot follow a term.  What follows a string
 *      is an operator, a statement modifier or a closing bracket; never a word,
 *      a sigil, an opening bracket or another quote; or
 *   2. it is glued to an operator (not one of , ) ; ] } . = and not followed
 *      by whitespace), it sits where a term may start, and
 *      a. the opener is on an earlier line.  A named operator glued to the
 *         quote counts: in `(name => "x", ...)` under an unclosed string, x
 *         is the next string's content, not the repetition operator; or
 *      b. the opener is on this line and the rest of the line reads better
 *         that way.  The line is walked twice, once starting in code and once
 *         starting inside a string, and rule 1 is asked of every closer each
 *         reading meets; the reading that gets further wins.  When they get
 *         equally far, the one that ends outside a string wins, and when both
 *         or neither do, an odd number of that quote left on the line says
 *         opener.
 *
 * "Where a term may start" is rule 1 mirrored: a quote glued to the end of a
 * word, to a closing bracket or to a `>` that is not `=>` is not an opener,
 * whatever follows it.  That is what the closer of a string that runs over
 * several lines looks like when an operator is glued to it:
 *
 *   $de ? "<pre>
 *   Falsche Eingabe</pre>":"<pre>
 *   Wrong input</pre>";
 *
 * Without it, 2a takes such a closer for an opener.  A string that runs over
 * several lines and ends in a space or punctuation with an operator glued on
 * is still refused.
 *
 * This is a guess, and its evidence is measured, not proved: on the benchmark
 * corpus it refuses no closer of a string that parses without it.  Before
 * changing it, diff every corpus tree (a closer wrongly refused breaks valid
 * code) and rerun the mid-edit census.
 *
 * The caller is the scanner, and only for a bare string: after m, s, qr and
 * friends the closer is followed by flags or a second part, which rule 1
 * would refuse.
 *
 * Pure: no lexer, no state.  Tested directly in test/c/test_quote_closer.c.
 */

#ifndef TSP_QUOTE_CLOSER_H
#define TSP_QUOTE_CLOSER_H

#include <stdbool.h>
#include <stdint.h>

#include "tsp_unicode.h"

#define TSP_CLOSER_WINDOW 512

/* Every named infix operator and statement modifier.  One missing from here
 * breaks a valid string that it follows. */
static const char *const tsp_follows_a_term[] = {
    "x",   "lt",  "gt", "le",     "ge",    "eq",    "ne",  "cmp",     "and",  "or",
    "xor", "isa", "if", "unless", "while", "until", "for", "foreach", "when", NULL};

/* The punctuation that starts an operator, closes a bracket or starts a
 * comment. */
#define TSP_FOLLOWS_A_TERM_PUNCT ",;)]}=?:<>!~+-*/%|&^.#"
/* What a closer on a later line than its opener has to be glued to, when it
 * is not followed by whitespace. */
#define TSP_CLOSER_TIGHT_PUNCT ",);]}.="

static inline bool tsp_qc_in(const char *set, int32_t c) {
  if (c <= 0 || c >= 128) return false;
  for (; *set; set++)
    if (*set == (char)c) return true;
  return false;
}

static inline bool tsp_qc_idfirst(int32_t c) { return c == '_' || is_tsp_id_start(c); }
static inline bool tsp_qc_idcont(int32_t c) { return c == '_' || is_tsp_id_continue(c); }

/* rest[0..len) is one identifier: is it a named operator or modifier? */
static bool tsp_word_follows_a_term(const int32_t *word, int len) {
  for (int i = 0; tsp_follows_a_term[i]; i++) {
    const char *name = tsp_follows_a_term[i];
    int j = 0;
    while (j < len && name[j] && word[j] == (int32_t)name[j]) j++;
    if (j == len && !name[j]) return true;
  }
  // "-" x80
  if (len > 1 && word[0] == 'x') {
    for (int i = 1; i < len; i++)
      if (word[i] < '0' || word[i] > '9') return false;
    return true;
  }
  return false;
}

/* Walk a line that starts in code (in == 0) or inside a string delimited by
 * `in`, taking ' and " strings with their escapes and a # comment.  Does it
 * end in code?  Not a lexer: a quote in a regex or after a sigil misleads it,
 * which is why it only ever breaks a tie. */
static bool tsp_line_ends_in_code(const int32_t *rest, int len, int32_t in) {
  for (int i = 0; i < len; i++) {
    int32_t c = rest[i];
    if (in) {
      if (c == '\\')
        i++;
      else if (c == in)
        in = 0;
    } else if (c == '\'' || c == '"') {
      in = c;
    } else if (c == '#' && (i == 0 || is_tsp_whitespace(rest[i - 1]))) {
      return true;
    }
  }
  return !in;
}

/* Rule 1 on what follows a closer, up to the end of its line: can the next
 * token follow a term?  *glued_word is set when that token is a named operator
 * glued to the quote. */
static bool tsp_can_follow_a_term(const int32_t *rest, int len, bool *glued_word) {
  if (glued_word) *glued_word = false;
  int i = 0;
  while (i < len && is_tsp_whitespace(rest[i])) i++;
  if (i == len) return true;
  if (tsp_qc_idfirst(rest[i])) {
    int end = i;
    while (end < len && tsp_qc_idcont(rest[end])) end++;
    if (!tsp_word_follows_a_term(rest + i, end - i)) return false;
    if (glued_word) *glued_word = i == 0;
    return true;
  }
  return tsp_qc_in(TSP_FOLLOWS_A_TERM_PUNCT, rest[i]);
}

static int tsp_line_end(const int32_t *buf, int len) {
  int i = 0;
  while (i < len && buf[i] != '\n' && buf[i] != '\r') i++;
  return i;
}

/* Walk a line starting in code (in == 0) or inside a string, and ask rule 1
 * of every closer met.  How far does the reading get before one fails?  A
 * line cut short by the window does not fail on the cut. */
static int tsp_reading_holds(const int32_t *line, int len, int32_t in) {
  for (int i = 0; i < len; i++) {
    int32_t c = line[i];
    if (in) {
      if (c == '\\')
        i++;
      else if (c == in) {
        in = 0;
        if (len < TSP_CLOSER_WINDOW && !tsp_can_follow_a_term(line + i + 1, len - (i + 1), NULL))
          return i;
      }
    } else if (c == '\'' || c == '"') {
      in = c;
    } else if (c == '#' && (i == 0 || is_tsp_whitespace(line[i - 1]))) {
      break;
    }
  }
  return len;
}

/* An opener sits where a term may start; see the header comment. */
static bool tsp_cannot_open_here(const int32_t before[2]) {
  int32_t c = before[0];
  if (tsp_qc_idcont(c)) return true;
  if (c == ')' || c == ']' || c == '}') return true;
  return c == '>' && before[1] != '=';
}

static bool tsp_closer_opens_next_string(const int32_t *rest, int len, int32_t quote,
                                         bool crossed_line, const int32_t before[2]) {
  int line = tsp_line_end(rest, len);
  if (line == 0) return false;
  bool tight = is_tsp_whitespace(rest[0]) || tsp_qc_in(TSP_CLOSER_TIGHT_PUNCT, rest[0]);

  bool glued_word;
  if (!tsp_can_follow_a_term(rest, line, &glued_word)) return true;
  int i = 0;
  while (i < line && is_tsp_whitespace(rest[i])) i++;
  if (i == line) return false;
  if (tsp_qc_idfirst(rest[i])) {
    if (!glued_word) return false;
  } else if (tight) {
    return false;
  }

  if (tsp_cannot_open_here(before)) return false;

  if (crossed_line) return true;

  int as_closer_holds = tsp_reading_holds(rest, line, 0);
  int as_opener_holds = tsp_reading_holds(rest, line, quote);
  if (as_closer_holds != as_opener_holds) return as_opener_holds > as_closer_holds;

  bool as_closer = tsp_line_ends_in_code(rest, line, 0);
  bool as_opener = tsp_line_ends_in_code(rest, line, quote);
  if (as_closer != as_opener) return as_opener;

  bool odd = false;
  for (; i < line; i++) {
    if (rest[i] == '\\')
      i++;
    else if (rest[i] == quote)
      odd = !odd;
  }
  return odd;
}

#endif /* TSP_QUOTE_CLOSER_H */
