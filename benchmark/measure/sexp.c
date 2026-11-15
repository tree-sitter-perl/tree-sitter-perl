// sexp: the named nodes of one file's tree, one per line, with byte spans.
// For diffing a single file between two builds.
//
//   sexp <file>
#include <stdio.h>
#include <stdlib.h>
#include <tree_sitter/api.h>
const TSLanguage *tree_sitter_perl(void);
static void w(TSNode n, int d, const char *src) {
  if (!ts_node_is_named(n)) return;
  printf("%*s%s [%u-%u]\n", d * 1, "", ts_node_type(n), ts_node_start_byte(n), ts_node_end_byte(n));
  for (uint32_t i = 0; i < ts_node_child_count(n); i++) w(ts_node_child(n, i), d + 1, src);
}
int main(int c, char **v) {
  FILE *f = fopen(v[1], "rb");
  fseek(f, 0, SEEK_END);
  long l = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *b = malloc(l + 1);
  l = (long)fread(b, 1, l, f);
  TSParser *p = ts_parser_new();
  ts_parser_set_language(p, tree_sitter_perl());
  TSTree *t = ts_parser_parse_string(p, 0, b, l);
  w(ts_tree_root_node(t), 0, b);
  return 0;
}
