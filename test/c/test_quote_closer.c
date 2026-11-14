/* Unit tests for the "is this closer really a closer" rule.
 *
 * tsp_quote_closer.h is pure (no tree-sitter / lexer state), so the rule is
 * tested directly on the text that follows a candidate closer.  Built and run
 * in CI.  Returns the number of failures as the exit code.
 *
 * Build manually:
 *   cc -std=c11 -Wall -I src test/c/test_quote_closer.c -o /tmp/t && /tmp/t
 */

#include <stdio.h>
#include <string.h>

#include "tsp_unicode.h"
#include "tsp_quote_closer.h"

static int failures = 0;

enum { CLOSER = 0, OPENER = 1 };
enum { SAME_LINE = 0, LATER_LINE = 1 };

static void check_codepoints(const char *label, const int32_t *rest, int len, int quote,
                             int crossed_line, int want) {
  int got = tsp_closer_opens_next_string(rest, len, quote, crossed_line) ? OPENER : CLOSER;
  if (got != want) {
    failures++;
    printf("FAIL %c%-28s %-10s got=%-6s want=%s\n", quote, label,
           crossed_line ? "later-line" : "same-line", got ? "opener" : "closer",
           want ? "opener" : "closer");
  }
}

/* `rest` is what follows the quote on its line, ASCII. */
static void check(const char *rest, int quote, int crossed_line, int want) {
  int32_t wide[TSP_CLOSER_WINDOW];
  int len = (int)strlen(rest);
  for (int i = 0; i < len; i++) wide[i] = (unsigned char)rest[i];
  check_codepoints(rest, wide, len, quote, crossed_line, want);
}

/* the same answer wherever the opener was */
static void check_both(const char *rest, int quote, int want) {
  check(rest, quote, SAME_LINE, want);
  check(rest, quote, LATER_LINE, want);
}

int main(void) {
  /* --- nothing, or only space, is left on the line ------------------------ */
  check_both("", '"', CLOSER);
  check_both("   ", '"', CLOSER);
  check_both("\t", '\'', CLOSER);

  /* --- rule 1: the next token has to be able to follow a term ------------- */
  /* closers and separators */
  check_both(";", '"', CLOSER);
  check_both(", 1);", '"', CLOSER);
  check_both(")", '\'', CLOSER);
  check_both("]", '"', CLOSER);
  check_both("} keys %h;", '"', CLOSER);
  check_both(" => 1,", '\'', CLOSER);
  check_both(" . $x;", '"', CLOSER);
  check_both(" # comment", '"', CLOSER);
  check_both(" ? 1 : 0;", '"', CLOSER);
  check_both(" =~ /x/;", '"', CLOSER);
  check_both(" || die;", '"', CLOSER);

  /* Every named operator and modifier, spaced.  Spelled out here, not read
   * from the header's list, so that dropping one from the header fails. */
  static const char *const named[] = {
      "x",   "lt",  "gt", "le",     "ge",    "eq",    "ne",  "cmp",     "and",  "or",
      "xor", "isa", "if", "unless", "while", "until", "for", "foreach", "when", NULL};
  for (int i = 0; named[i]; i++) {
    char rest[32];
    snprintf(rest, sizeof rest, " %s $y;", named[i]);
    check_both(rest, '"', CLOSER);
    check_both(rest, '\'', CLOSER);
  }
  /* glued: 'a'x3, "a"eq$b */
  check_both("x3;", '"', CLOSER);
  check_both("x80 . $y;", '\'', CLOSER);
  check_both("x$n;", '"', CLOSER);
  check_both("eq$b;", '"', CLOSER);
  /* `when` is a modifier: 'undef' when undef; */
  check_both(" when undef;", '\'', CLOSER);

  /* a word that is not one of them is string content */
  check_both("hello", '"', OPENER);
  check_both("name\" => 1,", '"', OPENER);
  check_both("EOT\";", '"', OPENER);    /* <<"EOT" */
  check_both("xyz", '"', OPENER);       /* starts with x, is not x */
  check_both("x8a", '"', OPENER);
  check_both("ifx", '"', OPENER);
  check_both("foreachable", '"', OPENER);
  check_both(" hello", '"', OPENER);
  check_both(" AND id IN\"", '"', OPENER);
  check_both("_private", '\'', OPENER);

  /* sigils, opening brackets, quotes, a backslash */
  check_both("$x", '"', OPENER);
  check_both("@list\"", '"', OPENER);
  check_both(" $x", '"', OPENER);
  check_both("(preloaded)'", '\'', OPENER);
  check_both("[0]", '"', OPENER);
  check_both("{", '"', OPENER);
  check_both("\"", '"', OPENER); /* an empty string, not a closer then an opener */
  check_both("'", '\'', OPENER);
  check_both("\\n\"", '"', OPENER);

  /* --- rule 2: on a later line, glued to something that is not tight ------ */
  check("-", '"', LATER_LINE, OPENER);
  check("->new", '"', LATER_LINE, OPENER);
  check(":\"b\"", '"', LATER_LINE, OPENER);
  check("?1:0", '"', LATER_LINE, OPENER);
  check("/x", '\'', LATER_LINE, OPENER);
  check("<b>", '"', LATER_LINE, OPENER);
  /* tight */
  check(".$x", '"', LATER_LINE, CLOSER);
  check("=~/x/", '"', LATER_LINE, CLOSER);
  check(",", '"', LATER_LINE, CLOSER);
  /* a space first makes any operator fine */
  check(" - 1", '"', LATER_LINE, CLOSER);
  check(" : 2", '"', LATER_LINE, CLOSER);

  /* --- rule 3: on the opener's line, glued, odd quotes left --------------- */
  check("->new", '"', SAME_LINE, CLOSER);
  check("->new(\"a\")", '"', SAME_LINE, CLOSER);     /* two left */
  check(":\"b\";", '"', SAME_LINE, CLOSER);          /* $c ? "a":"b" */
  check("-foo\", 1);", '"', SAME_LINE, OPENER);      /* one left */
  check(":\"b\", \"c", '"', SAME_LINE, OPENER);      /* three left */
  check("-foo\\\", 1);", '"', SAME_LINE, CLOSER);    /* the one left is escaped */
  check("-foo', 1);", '"', SAME_LINE, CLOSER);       /* the other quote does not count */
  check("-foo', 1);", '\'', SAME_LINE, OPENER);
  /* tight or spaced: the count is not consulted */
  check(", \"b", '"', SAME_LINE, CLOSER);
  check(" - \"b", '"', SAME_LINE, CLOSER);

  /* --- beyond ASCII ------------------------------------------------------- */
  {
    /* U+2003 EM SPACE then a comma */
    const int32_t spaced[] = {0x2003, ','};
    check_codepoints("<em space>,", spaced, 2, '"', SAME_LINE, CLOSER);
    check_codepoints("<em space>,", spaced, 2, '"', LATER_LINE, CLOSER);
    /* a non-ASCII identifier is content */
    const int32_t word[] = {0xE9, 't', 0xE9};
    check_codepoints("<e-acute>t<e-acute>", word, 3, '"', SAME_LINE, OPENER);
    /* a non-ASCII symbol is content */
    const int32_t symbol[] = {0xBB};
    check_codepoints("<guillemet>", symbol, 1, '"', LATER_LINE, OPENER);
  }

  if (failures)
    printf("%d failure(s)\n", failures);
  else
    printf("ok\n");
  return failures;
}
