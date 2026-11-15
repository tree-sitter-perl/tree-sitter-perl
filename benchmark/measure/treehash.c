// treehash: two hashes per file, for diffing every tree in a corpus between
// two builds of the parser.
//
//   treehash <listfile>   prints "<hash of the s-expression> <hash of every
//                         node's type, span and field, anonymous ones too> <file>"
//
// Type names are hashed, not symbol ids, so builds of different grammars
// compare.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <tree_sitter/api.h>
const TSLanguage *tree_sitter_perl(void);
static char *slurp(const char *p, size_t *n) {
  FILE *f = fopen(p, "rb");
  if (!f) return 0;
  fseek(f, 0, SEEK_END);
  long l = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *b = malloc(l + 1);
  *n = fread(b, 1, l, f);
  b[*n] = 0;
  fclose(f);
  return b;
}
int main(int argc, char **argv) {
  FILE *lf = fopen(argv[1], "r");
  char line[4096];
  TSParser *p = ts_parser_new();
  ts_parser_set_language(p, tree_sitter_perl());
  while (fgets(line, sizeof line, lf)) {
    line[strcspn(line, "\n")] = 0;
    size_t n;
    char *b = slurp(line, &n);
    if (!b) continue;
    TSTree *t = ts_parser_parse_string(p, NULL, b, n);
    TSNode r = ts_tree_root_node(t);
    char *s = ts_node_string(r);
    unsigned long long hs = 1469598103934665603ULL;
    for (char *q = s; *q; q++) {
      hs ^= (unsigned char)*q;
      hs *= 1099511628211ULL;
    }
    free(s);
    TSTreeCursor c = ts_tree_cursor_new(r);
    unsigned long long hb = 0;  // spans incl. anonymous
    for (;;) {
      TSNode x = ts_tree_cursor_current_node(&c);
      hb = hb * 1099511628211ULL ^ ts_node_start_byte(x) ^
           ((unsigned long long)ts_node_end_byte(x) << 24);
      const char *ty = ts_node_type(x);
      for (const char *q = ty; *q; q++) {
        hb ^= (unsigned char)*q;
        hb *= 1099511628211ULL;
      }
      const char *fn = ts_tree_cursor_current_field_name(&c);
      if (fn)
        for (const char *q = fn; *q; q++) {
          hb ^= (unsigned char)*q;
          hb *= 31;
        }
      if (ts_tree_cursor_goto_first_child(&c)) continue;
      while (!ts_tree_cursor_goto_next_sibling(&c)) {
        if (!ts_tree_cursor_goto_parent(&c)) goto done;
      }
    }
  done:
    printf("%016llx %016llx %s\n", hs, hb, line);
    ts_tree_cursor_delete(&c);
    ts_tree_delete(t);
    free(b);
  }
  return 0;
}
