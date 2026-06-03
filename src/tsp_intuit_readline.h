/* tsp_intuit_readline.h
 *
 * A tree-sitter-specific content heuristic for the fileglob-vs-relational
 * disambiguation.  This is NOT a port of perl: perl decides `<...>` purely by
 * parser state (PL_expect -- is a value or a list-op sitting in front of the
 * `<`?), information the external scanner does not have.  So we fall back to
 * looking at the *content* between `<` and the closing `>`.
 *
 * The scanner reaches this only after an ambiguous bareword, where both
 * readings are syntactically live:
 *   - fileglob / readline:   `<*.c>`, `<$dir/*.txt>`, `<STDIN>`, `<$fh>`
 *   - relational less-than:  `CONST < 7 > $x`, `CONST < $a > $b`
 * Pure filehandle names (`<STDIN>`, `<$fh>`) are recognised by the scanner
 * before it gets here; this function also accepts them defensively.
 *
 * GLOB-SHAPE POSITIVE RECOGNITION
 * --------------------------------
 * Rather than assume `<...>` is a glob and look for reasons to bail, we invert
 * the burden of proof: commit to a fileglob ONLY if the content POSITIVELY
 * looks like a glob/readline target.  Anything that does not is read as the
 * relational operator.  Concretely tsp_is_fileglob(buf, len) returns TRUE iff
 * the bytes between `<` and `>` (exclusive) are one of:
 *
 *   - empty -- `<>` (the readline-from-ARGV form; usually handled elsewhere,
 *     but harmless to accept here), OR
 *   - a pure filehandle name: an optional leading `$`, then word characters
 *     with `::` or `'` package separators (e.g. `$fh`, `Foo::BAR`) and nothing
 *     else, OR
 *   - a glob pattern: it contains at least one glob metacharacter
 *     (`*` `?` `[` `]` `{` `}` `~`) or a path separator `/`, or a `.` that is
 *     part of a filename-looking token (a `.` flanked by word characters, e.g.
 *     `foo.c`).
 *
 * Everything else -- a bare number (`< 7 >`), a lone scalar with trailing junk
 * (`$a > $b`), a sub-expression with operators -- is NOT glob-shaped, so we
 * return FALSE and let the grammar lex `<` as relational less-than.
 *
 * KNOWN LIMITATION (irreducible)
 * ------------------------------
 * This is fundamentally ambiguous against perl's PL_expect.  `print <$x>` is a
 * genuine glob/readline in real perl, but its content (`$x`) is also a valid
 * pure-scalar relational operand; only the parser state in front of the `<`
 * disambiguates, and the scanner cannot see it.  Pure filehandle/scalar names
 * are accepted as readline (the common case) -- so an isolated `<$ident>` is
 * read as readline; in practice the relational chains that mislead us carry a
 * trailing operand or operator (`CONST < $a > $b`) whose extra content the
 * filehandle test rejects, falling through to the relational reading.
 */

#ifndef TSP_INTUIT_READLINE_H
#define TSP_INTUIT_READLINE_H

#include <stdbool.h>
#include <stddef.h>

/* --- ASCII classification (never reads past the caller-supplied buffer) ---- */
static inline bool tsp_rl_isdigit(int c) { return c >= '0' && c <= '9'; }
static inline bool tsp_rl_isalpha(int c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}
static inline bool tsp_rl_isword(int c) {
  return tsp_rl_isalpha(c) || tsp_rl_isdigit(c) || c == '_';
}
static inline bool tsp_rl_isspace(int c) {
  return c == ' ' || c == '\t' || c == '\r' || c == '\f' || c == '\v';
}

/* A glob metacharacter: presence of any of these is decisive evidence that
 * `<...>` is a glob pattern, not a relational expression. */
static inline bool tsp_rl_is_glob_meta(int c) {
  return c == '*' || c == '?' || c == '[' || c == ']' ||
         c == '{' || c == '}' || c == '~';
}

/* Is buf[0..len) a pure filehandle name?  Optional leading '$', then one or
 * more word chars, allowing `::` and `'` package separators between word runs,
 * and tolerating TRAILING whitespace (real globs are written `<$fh >`).
 * Examples: `$fh`, `fh`, `STDIN`, `Foo::BAR`, `Foo'BAR`, `$sner `.
 *
 * Crucially it rejects LEADING whitespace: `< $a >` (a space after `<`) is the
 * relational-operator shape, never a filehandle.  This is the load-bearing
 * distinction between the glob `<$sner >` and the relational `CONST < $a > $b`,
 * whose `<...>` content is the same name modulo that leading space. */
static inline bool tsp_rl_is_filehandle(const char *buf, size_t len) {
  size_t i = 0;
  if (i >= len || tsp_rl_isspace((unsigned char)buf[i]))
    return false;                        /* empty or leading space => not a name */
  if (buf[i] == '$') i++;
  if (i >= len) return false;            /* bare `$`: not a name */

  bool last_was_word = false;
  while (i < len) {
    if (tsp_rl_isword((unsigned char)buf[i])) {
      last_was_word = true;
      i++;
    } else if (buf[i] == ':') {
      /* require a `::` pair after a word run */
      if (!last_was_word) return false;
      if (i + 1 >= len || buf[i + 1] != ':') return false;
      last_was_word = false;
      i += 2;
    } else if (buf[i] == '\'') {
      /* `'` package separator after a word run */
      if (!last_was_word) return false;
      last_was_word = false;
      i++;
    } else if (tsp_rl_isspace((unsigned char)buf[i])) {
      /* trailing whitespace: allowed only after a complete name, and nothing
       * but whitespace may follow */
      if (!last_was_word) return false;
      for (i++; i < len; i++)
        if (!tsp_rl_isspace((unsigned char)buf[i])) return false;
      return true;
    } else {
      return false;                      /* any other char => not a pure name */
    }
  }
  return last_was_word;                  /* must end on a word, not a separator */
}

/* tsp_is_fileglob -- TRUE => emit a fileglob open token; FALSE => bail so the
 * grammar lexes `<` as the relational less-than operator.
 *
 * buf points at the content between `<` and `>` (the delimiters excluded) and
 * spans `len` bytes.  Reads only buf[0 .. len-1]. */
static inline bool tsp_is_fileglob(const char *buf, size_t len) {
  /* `<>` -- the empty diamond; accept (usually handled before we get here). */
  if (len == 0) return true;

  /* A glob pattern: any glob metacharacter, a path separator, or a
   * filename-looking `.` (a dot flanked by word characters, e.g. `foo.c`) is
   * decisive evidence of a glob -- even with surrounding whitespace, e.g.
   * `< *.c >`.  Checked first so leading whitespace doesn't mask it. */
  for (size_t i = 0; i < len; i++) {
    char c = buf[i];
    if (tsp_rl_is_glob_meta((unsigned char)c)) return true;
    if (c == '/') return true;
    if (c == '.') {
      bool prev_word = (i > 0) && tsp_rl_isword((unsigned char)buf[i - 1]);
      bool next_word = (i + 1 < len) && tsp_rl_isword((unsigned char)buf[i + 1]);
      if (prev_word && next_word) return true;
    }
  }

  /* A pure filehandle / scalar name (no leading whitespace) => readline target,
   * e.g. `$fh`, `STDIN`, `$sner `. */
  if (tsp_rl_is_filehandle(buf, len)) return true;

  /* No positive glob evidence and not a pure name => relational operator. */
  return false;
}

#endif /* TSP_INTUIT_READLINE_H */
