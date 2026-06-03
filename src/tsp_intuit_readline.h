/* tsp_intuit_readline.h
 *
 * A tree-sitter-specific heuristic for the fileglob-vs-relational-operator
 * ambiguity.  This is NOT a port of any perl routine: real perl resolves it
 * purely by PL_expect (whether a value or a list operator preceded the `<`),
 * which the external scanner cannot see.  Instead we use a content + trailing
 * lookahead heuristic.
 *
 * The scanner reaches this decision only after an *ambiguous bareword*
 * (`valid_symbols[TOKEN_OPEN_FILEGLOB_BRACKET]`) followed by `<...>` whose
 * content is not a plain readline filehandle.  Both readings are syntactically
 * live:
 *
 *   print <*.c>;        # glob:       `<` opens a fileglob
 *   CONST < 7 > $x;     # relational: `<` is the less-than operator
 *
 * KEY STRUCTURAL INSIGHT ("post-`>` orphan lookahead"):
 *   A real glob/readline `<...>` is a COMPLETE term.  After its closing `>`,
 *   the surrounding `bareword <glob>` expression is itself a complete term, so
 *   what follows the `>` must be an operator, a comma, a statement modifier /
 *   low-precedence operator keyword, a closing bracket, `;`, newline, or EOF —
 *   NOT another bare term.  In `CONST < 7 > $x` there is exactly one `>`, and
 *   committing `< 7 >` as a glob would leave `$x` as an orphaned bare term with
 *   no connecting operator.  That orphan is the proof that `<` was really the
 *   relational operator (a chained comparison `CONST < 7 > $x`), so we bail.
 *
 * Decision (given the `<...>` content and the bytes following the `>`):
 *   1. If the content contains a whitespace-delimited infix word-operator
 *      (and/or/xor/not/cmp/eq/ne/lt/gt/le/ge/x) the `<...>` is a relational
 *      expression, not a glob -> bail (NOT a fileglob).
 *   2. Otherwise look at the first non-space byte AFTER the `>`:
 *        - operator / comma / `;` / `=` / `=>` / closing bracket `) ] }` /
 *          newline / EOF, or a statement-modifier / low-prec operator keyword
 *          (if unless while until for foreach and or xor not cmp eq ne lt gt
 *          le ge x)  -> the glob is a complete term -> FILEGLOB ok.
 *        - a bare-term opener: a sigil (`$ @ %`), a digit, a quote (`" '`), or
 *          an opening bracket that would start a fresh term (`( [ {`)  ->
 *          orphaned term -> bail (NOT a fileglob).
 *        - an alphabetic word that is NOT one of the keywords above: AMBIGUOUS.
 *          We lean toward NOT orphaning (treat as a fileglob) so that code like
 *          `<glob> SOMEFUNC` / `print <*.c> LIST` keeps parsing as a glob.  In
 *          practice a glob followed by a bareword is far more common (and less
 *          broken) than the relational `CONST < x > word` shape, and breaking a
 *          glob produces a cascading ERROR whereas the contrived relational
 *          chain ending in a bareword does not.
 *
 * tsp_is_fileglob(content, clen, after, alen) returns TRUE  => commit to the
 * fileglob (subject to the scanner's other checks, e.g. a closing `>` was
 * actually found); FALSE => bail so `<` lexes as the relational operator.
 *
 * Limitation: `after` is only a small buffered window (the scanner caps it at
 * ~256 bytes) of the bytes following the `>`.  If the buffer ends before any
 * non-space byte (extremely long whitespace run / EOF-in-window) we treat it as
 * EOF-like and allow the glob.  Like the whole routine, this is best-effort and
 * an LSP with full parser state can refine it.  Never reads past the buffers.
 */

#ifndef TSP_INTUIT_READLINE_H
#define TSP_INTUIT_READLINE_H

#include <stdbool.h>
#include <stddef.h>
#include <string.h>

/* --- ASCII classification (mirrors the subset used elsewhere) -------------- */
static inline bool tsp_rl_isdigit(int c) { return c >= '0' && c <= '9'; }
static inline bool tsp_rl_isalpha(int c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
static inline bool tsp_rl_isword(int c) {
  return tsp_rl_isalpha(c) || tsp_rl_isdigit(c) || c == '_';
}
static inline bool tsp_rl_isspace(int c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' ||
         c == '\v';
}

/* The low-precedence operator / statement-modifier keywords that may legally
 * FOLLOW a complete `bareword <glob>` term.  Seeing one of these after the `>`
 * means the glob is complete, not orphaning a term. */
static inline bool tsp_rl_is_trailing_keyword(const char *w, size_t n) {
  static const char *const kw[] = {
      "if", "unless", "while", "until", "for", "foreach", "and", "or", "xor",
      "not", "cmp", "eq", "ne", "lt", "gt", "le", "ge", "x"};
  for (size_t i = 0; i < sizeof(kw) / sizeof(kw[0]); i++) {
    if (strlen(kw[i]) == n && memcmp(w, kw[i], n) == 0) return true;
  }
  return false;
}

/* The infix word-operators that, when appearing INSIDE the `<...>` content as a
 * whitespace-delimited word, prove it is a relational expression rather than a
 * glob pattern (a glob never contains a bare perl operator word). */
static inline bool tsp_rl_is_infix_word(const char *w, size_t n) {
  static const char *const kw[] = {"and", "or", "xor", "not", "cmp", "eq",
                                    "ne",  "lt", "gt",  "le",  "ge",  "x"};
  for (size_t i = 0; i < sizeof(kw) / sizeof(kw[0]); i++) {
    if (strlen(kw[i]) == n && memcmp(w, kw[i], n) == 0) return true;
  }
  return false;
}

/* Scan the `<...>` content for a whitespace-delimited infix operator word.
 * Only alpha runs that start at a whitespace boundary (and are not glued to
 * sigils/digits/punctuation) count; `$x` or `*.c` never qualify. */
static inline bool tsp_rl_content_has_infix_op(const char *s, size_t len) {
  size_t i = 0;
  while (i < len) {
    /* skip leading whitespace */
    while (i < len && tsp_rl_isspace((unsigned char)s[i])) i++;
    size_t start = i;
    bool clean = true;  /* a clean bare word: only alphas */
    while (i < len && !tsp_rl_isspace((unsigned char)s[i])) {
      if (!tsp_rl_isalpha((unsigned char)s[i])) clean = false;
      i++;
    }
    if (clean && i > start && tsp_rl_is_infix_word(s + start, i - start))
      return true;
  }
  return false;
}

/* --- the decision ---------------------------------------------------------- */
static inline bool tsp_is_fileglob(const char *content, size_t clen,
                                   const char *after, size_t alen) {
  /* (1) operator-word inside the content => relational expression, not glob. */
  if (tsp_rl_content_has_infix_op(content, clen)) return false;

  /* (2) post-`>` orphan lookahead. */
  size_t i = 0;
  while (i < alen && tsp_rl_isspace((unsigned char)after[i])) i++;

  /* Window exhausted before any non-space byte: treat as EOF-like -> glob ok. */
  if (i >= alen) return true;

  unsigned char nc = (unsigned char)after[i];

  /* An alphabetic word: keyword => complete term (glob ok); otherwise an
   * ambiguous bareword, which we lean toward NOT treating as an orphan. */
  if (tsp_rl_isalpha(nc)) {
    size_t start = i;
    while (i < alen && tsp_rl_isword((unsigned char)after[i])) i++;
    if (tsp_rl_is_trailing_keyword(after + start, i - start)) return true;
    /* Unknown bareword after the glob: lean toward glob (do not orphan). */
    return true;
  }

  /* Bare-term openers with no connecting operator => orphan => bail. */
  if (nc == '$' || nc == '@' || nc == '%' || nc == '"' || nc == '\'' ||
      tsp_rl_isdigit(nc) || nc == '(' || nc == '[' || nc == '{') {
    return false;
  }

  /* Everything else — operators (`+ - * / . < > ! ~ ? : | & ^`), `=`, `=>`,
   * comma, `;`, closing brackets `) ] }` — terminates the term cleanly, so the
   * glob is complete. */
  return true;
}

#endif /* TSP_INTUIT_READLINE_H */
