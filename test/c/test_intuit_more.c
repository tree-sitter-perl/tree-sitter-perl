/* Unit tests for the regex subscript-vs-charclass/quantifier heuristic.
 *
 * These headers are pure (no tree-sitter / lexer state), so we can test the
 * ported perl S_intuit_more / S_regcurly logic and the keyword recognizer
 * directly, without driving the whole parser.  Built and run in CI.
 * Returns the number of failures as the exit code.
 *
 * Build manually:
 *   cc -std=c11 -Wall -I src test/c/test_intuit_more.c -o /tmp/t && /tmp/t
 */

#include <stdio.h>
#include <string.h>

#include "tsp_intuit_more.h"
#include "tsp_intuit_keywords.h"

static int failures = 0;

/* `in` is the bracketed construct as it appears in the pattern, e.g. "[\\s$;]".
 * want_subscript=1 means "more to the expression" (subscript); 0 means it's a
 * regex character class / quantifier. */
static void check_intuit(const char *in, int want_subscript) {
  int got = tsp_intuit_more(in, (int)strlen(in)) ? 1 : 0;
  if (got != want_subscript) {
    failures++;
    printf("FAIL intuit %-12s got=%-9s want=%s\n", in,
           got ? "subscript" : "class",
           want_subscript ? "subscript" : "class");
  }
}

static void check_keyword(const char *word, int want) {
  int got = tsp_is_perl_keyword(word, (int)strlen(word)) ? 1 : 0;
  if (got != want) {
    failures++;
    printf("FAIL keyword %-16s got=%d want=%d\n", word, got, want);
  }
}

int main(void) {
  /* --- the heuristic ----------------------------------------------------- */
  /* character classes / quantifiers (FALSE = not a subscript) */
  check_intuit("[\\s$;]", 0);   /* issue #217 */
  check_intuit("[abc]", 0);     /* ascending alphas */
  check_intuit("[a-z]", 0);     /* range */
  check_intuit("[^abc]", 0);    /* negated */
  check_intuit("[]", 0);        /* empty-ish */
  check_intuit("[\\w]", 0);     /* \w */
  check_intuit("[0-9]", 0);     /* digit range */
  check_intuit("{3,5}", 0);     /* quantifier */
  check_intuit("{3}", 0);       /* quantifier */
  check_intuit("{3,}", 0);      /* open-ended quantifier */
  check_intuit("{,5}", 0);      /* low-open quantifier */

  /* subscripts (TRUE = more to the expression) */
  check_intuit("[0]", 1);       /* single digit */
  check_intuit("[12]", 1);      /* two digits */
  check_intuit("[$bar]", 1);    /* variable index */
  check_intuit("[-3]", 1);      /* negative index */
  check_intuit("[print]", 1);   /* keyword run => not a class */
  check_intuit("{foo}", 1);     /* hash key, not a quantifier */
  check_intuit("{}", 1);        /* not a valid quantifier */
  check_intuit("{$key}", 1);    /* variable hash key */

  /* --- keyword recognizer ------------------------------------------------ */
  const char *kw[] = {"print", "split", "grep", "if", "or", "sort", "m", "y",
                      "getprotobynumber", "__FILE__", "wantarray", "tr"};
  for (size_t i = 0; i < sizeof(kw) / sizeof(kw[0]); i++) check_keyword(kw[i], 1);
  const char *not_kw[] = {"abc", "zz", "xyz", "foob", "printx", ""};
  for (size_t i = 0; i < sizeof(not_kw) / sizeof(not_kw[0]); i++) check_keyword(not_kw[i], 0);

  if (failures == 0) printf("ok - all intuit_more C tests passed\n");
  else printf("not ok - %d C test failure(s)\n", failures);
  return failures;
}
