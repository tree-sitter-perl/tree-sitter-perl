/* tsp_intuit_readline.h
 *
 * A tree-sitter-specific *content heuristic* for disambiguating, after an
 * ambiguous leading bareword, whether `<...>` is a fileglob/readline operator
 * (`<*.c>`, `<$dir/*.txt>`, `<STDIN>`, `<$fh>`) or the relational less-than
 * operator misread as one (`CONST < 0`, `CONST < 7 > $x`, `$a < $b and ...`).
 *
 * This is NOT a port of perl's logic.  Perl itself decides purely by parser
 * state (PL_expect: is a term or an operator expected here?), which the
 * external scanner does not have access to.  So we inspect the bytes between
 * `<` and the candidate closing `>` and guess.
 *
 * tsp_is_fileglob(buf, len) returns:
 *   true  => emit the fileglob/glob open token (`buf` looks like a glob body),
 *   false => bail and let `<` lex as the relational `<` operator.
 *
 * `buf` holds the content bytes *between* the opening `<` and the terminator
 * (the closing `>`, a `<`, `;`, newline, or EOF); it does NOT include `<`/`>`.
 * The caller has already handled the pure readline cases (`<FH>`, `<$fh>`,
 * `<>`) where ident-chars run straight into `>`, and only calls this when a
 * fileglob token is valid.  The caller also guarantees a terminator was the
 * reason scanning stopped, but this function never reads past buf[len-1].
 *
 * Heuristic (operand-negative, extending the operator-word detector):
 *   - A whitespace-delimited bareword that is a Perl infix word-operator
 *     (and/or/xor/not/cmp/eq/ne/lt/gt/le/ge/x) => relational, bail.
 *   - A whitespace-delimited token that begins with a digit (a number such as
 *     7, 42, 0x1f, 3.14) => relational operand, bail.  Glob patterns and
 *     filehandles never start a whitespace-delimited token with a digit.
 *   - A standalone scalar `$x` (a `$` + ident-chars token, nothing attached)
 *     that is preceded by whitespace inside the bracket => relational, bail.
 *     This catches `CONST < $a > $b` (content `" $a "`).  We are conservative:
 *     the pure readline `<$fh>` never reaches us (its ident-chars run straight
 *     into `>`, handled by the caller), and a `$`-token with non-ident
 *     punctuation attached (`<$dir/*.txt>`) is not a plain scalar, so globs
 *     keep working.
 *
 * Known limitation: this can only ever be a heuristic.  `print <$x and $y>`
 * is a genuine glob in real perl yet has byte-identical content to the
 * relational `CONST < $x and $y`; the two differ only by whether the leading
 * bareword is a value or a list operator -- parser state the scanner lacks.
 * We bias toward the relational reading for such (contrived) inputs.
 */

#ifndef TSP_INTUIT_READLINE_H
#define TSP_INTUIT_READLINE_H

#include <stdbool.h>
#include <stddef.h>

/* --- ASCII classification (never reads past the given byte) --------------- */
static inline bool tsp_rl_isdigit(int c) { return c >= '0' && c <= '9'; }
static inline bool tsp_rl_isalpha(int c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
static inline bool tsp_rl_isidcont(int c) {
  return tsp_rl_isalpha(c) || tsp_rl_isdigit(c) || c == '_';
}
static inline bool tsp_rl_isspace(int c) {
  return c == ' ' || c == '\t' || c == '\r' || c == '\f' || c == '\v';
}

/* Compare buf[start..end) against a NUL-terminated ASCII word. */
static inline bool tsp_rl_word_eq(const char *buf, size_t start, size_t end,
                                  const char *word) {
  size_t i = start;
  for (; i < end && *word; i++, word++)
    if (buf[i] != *word) return false;
  return i == end && *word == '\0';
}

/* Is buf[start..end) one of the Perl infix word-operators? */
static inline bool tsp_rl_is_op_word(const char *buf, size_t start,
                                     size_t end) {
  return tsp_rl_word_eq(buf, start, end, "and") ||
         tsp_rl_word_eq(buf, start, end, "or") ||
         tsp_rl_word_eq(buf, start, end, "xor") ||
         tsp_rl_word_eq(buf, start, end, "not") ||
         tsp_rl_word_eq(buf, start, end, "cmp") ||
         tsp_rl_word_eq(buf, start, end, "eq") ||
         tsp_rl_word_eq(buf, start, end, "ne") ||
         tsp_rl_word_eq(buf, start, end, "lt") ||
         tsp_rl_word_eq(buf, start, end, "gt") ||
         tsp_rl_word_eq(buf, start, end, "le") ||
         tsp_rl_word_eq(buf, start, end, "ge") ||
         tsp_rl_word_eq(buf, start, end, "x");
}

/* Is buf[start..end) a clean `$ident` scalar token (sigil + >=1 ident char,
 * nothing else attached)? */
static inline bool tsp_rl_is_plain_scalar(const char *buf, size_t start,
                                          size_t end) {
  if (end - start < 2) return false;     /* need `$` + at least one ident char */
  if (buf[start] != '$') return false;
  for (size_t i = start + 1; i < end; i++)
    if (!tsp_rl_isidcont((unsigned char)buf[i])) return false;
  return true;
}

/* The decision.  true => fileglob, false => bail to the `<` operator. */
static inline bool tsp_is_fileglob(const char *buf, size_t len) {
  /* Walk whitespace-delimited tokens.  We need, per token, where it starts and
   * ends, plus whether whitespace preceded it inside the bracket. */
  size_t i = 0;
  while (i < len) {
    /* skip leading whitespace */
    size_t ws_start = i;
    while (i < len && tsp_rl_isspace((unsigned char)buf[i])) i++;
    if (i >= len) break;

    bool had_leading_ws = (i > ws_start);   /* whitespace seen before token */

    size_t tok_start = i;
    while (i < len && !tsp_rl_isspace((unsigned char)buf[i])) i++;
    size_t tok_end = i;     /* [tok_start, tok_end) is one token */

    unsigned char first = (unsigned char)buf[tok_start];

    /* (1) infix word-operator => relational. */
    if (tsp_rl_isalpha(first) && tsp_rl_is_op_word(buf, tok_start, tok_end))
      return false;

    /* (2) token beginning with a digit => numeric operand => relational. */
    if (tsp_rl_isdigit(first))
      return false;

    /* (3) a plain scalar `$x` preceded by whitespace inside the bracket =>
     * comparison like `< $a > $b` (content `" $a "`).  The pure readline
     * `<$fh>` never reaches here, and a `$`-token with attached punctuation
     * (`<$dir/*.txt>`) is not a plain scalar, so globs keep working. */
    if (first == '$' && had_leading_ws &&
        tsp_rl_is_plain_scalar(buf, tok_start, tok_end))
      return false;
  }

  return true;   /* nothing betrayed a comparison: treat as a glob */
}

#endif /* TSP_INTUIT_READLINE_H */
