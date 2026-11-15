/* tsp_quote_closer.h
 *
 * Is the closer of a ' or " string really a closer?
 *
 * A quote that is never closed still finds a closer further down the file: the
 * opener of the next string.  Taking it turns every later string inside out,
 * which is what one half-typed quote does to an editor's tree.  So the closer
 * the scanner's lookahead found is asked whether it reads as one.
 *
 * tsp_closer_opens_next_string(rest, len, quote, crossed_line) returns TRUE
 * when the quote character just before `rest` is the next string's opener.
 *
 *   rest, len     the codepoints after that quote, up to the end of its line
 *                 (the line terminator excluded) or TSP_CLOSER_WINDOW of them
 *   quote         ' or "
 *   crossed_line  the string's opener is on an earlier line
 *
 * It is the next string's opener when
 *
 *   1. the next token on the line cannot follow a term.  What follows a string
 *      is an operator, a statement modifier or a closing bracket; never a word,
 *      a sigil, an opening bracket or another quote; or
 *   2. the opener is on an earlier line and the quote is not directly followed
 *      by one of , ) ; ] } . = or whitespace.  A named operator glued to the
 *      quote counts: in `(name => "x", ...)` under an unclosed string, x is
 *      the next string's content, not the repetition operator; or
 *   3. the opener is on this line, the quote is glued to an operator, and the
 *      rest of the line reads better that way.  The line is walked twice, once
 *      starting in code and once starting inside a string; the reading that
 *      ends outside a string wins.  When both or neither do, an odd number of
 *      that quote left on the line says opener.
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

static bool tsp_closer_opens_next_string(const int32_t *rest, int len, int32_t quote,
                                         bool crossed_line) {
  if (len == 0) return false;
  bool tight = is_tsp_whitespace(rest[0]) || tsp_qc_in(TSP_CLOSER_TIGHT_PUNCT, rest[0]);

  int i = 0;
  while (i < len && is_tsp_whitespace(rest[i])) i++;
  if (i == len) return false;

  if (tsp_qc_idfirst(rest[i])) {
    int end = i;
    while (end < len && tsp_qc_idcont(rest[end])) end++;
    if (!tsp_word_follows_a_term(rest + i, end - i)) return true;
    // a named operator after a space is as good a sign of a closer as a
    // comma; glued to the quote it may be the next string's first word
    if (i > 0) return false;
    if (crossed_line) return true;
    i = end;
    goto count;
  }
  if (!tsp_qc_in(TSP_FOLLOWS_A_TERM_PUNCT, rest[i])) return true;

  if (crossed_line) return !tight;
  if (tight) return false;

count:;
  // Read the rest of the line both ways.  If only one reading leaves the line
  // outside a string, that is the one.
  bool as_closer = tsp_line_ends_in_code(rest, len, 0);
  bool as_opener = tsp_line_ends_in_code(rest, len, quote);
  if (as_closer != as_opener) return as_opener;

  bool odd = false;
  for (; i < len; i++) {
    if (rest[i] == '\\')
      i++;
    else if (rest[i] == quote)
      odd = !odd;
  }
  return odd;
}

#endif /* TSP_QUOTE_CLOSER_H */
