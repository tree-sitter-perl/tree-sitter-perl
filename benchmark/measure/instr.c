// instr: parse every file in a list, N times over.
//
//   instr <listfile> [reps] [perfile]
//
// Prints files, bytes, best wall time and MB/s on stderr.  Run it under
// `valgrind --tool=callgrind` for an instruction count, which is the number
// to compare between two builds: wall time on a shared box is too noisy.
// With a third argument, prints one line per file: ms, bytes, MB/s, has-error.
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <tree_sitter/api.h>
const TSLanguage *tree_sitter_perl(void);
static double now(void) {
  struct timespec t;
  clock_gettime(CLOCK_MONOTONIC, &t);
  return t.tv_sec + t.tv_nsec * 1e-9;
}
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
  // usage: harness <listfile> [reps] [perfile]
  int reps = argc > 2 ? atoi(argv[2]) : 1;
  int perfile = argc > 3;
  FILE *lf = fopen(argv[1], "r");
  char line[4096];
  char **bufs = 0;
  size_t *lens = 0;
  char **names = 0;
  size_t nf = 0, cap = 0;
  while (fgets(line, sizeof line, lf)) {
    line[strcspn(line, "\n")] = 0;
    size_t n;
    char *b = slurp(line, &n);
    if (!b) continue;
    if (nf == cap) {
      cap = cap ? cap * 2 : 1024;
      bufs = realloc(bufs, cap * sizeof *bufs);
      lens = realloc(lens, cap * sizeof *lens);
      names = realloc(names, cap * sizeof *names);
    }
    bufs[nf] = b;
    lens[nf] = n;
    names[nf] = strdup(line);
    nf++;
  }
  TSParser *p = ts_parser_new();
  ts_parser_set_language(p, tree_sitter_perl());
  size_t total = 0;
  for (size_t i = 0; i < nf; i++) total += lens[i];
  double best = 1e99;
  unsigned long nodes = 0, errs = 0;
  for (int r = 0; r < reps; r++) {
    double t0 = now();
    for (size_t i = 0; i < nf; i++) {
      double f0 = now();
      TSTree *t = ts_parser_parse_string(p, NULL, bufs[i], lens[i]);
      double f1 = now();
      if (r == 0) {
        TSNode root = ts_tree_root_node(t);
        nodes += ts_node_descendant_count(root);
        if (ts_node_has_error(root)) errs++;
        if (perfile)
          printf("F\t%.3f\t%zu\t%.1f\t%d\t%s\n", (f1 - f0) * 1e3, lens[i],
                 lens[i] / 1e6 / (f1 - f0), ts_node_has_error(root), names[i]);
      }
      ts_tree_delete(t);
    }
    double dt = now() - t0;
    if (dt < best) best = dt;
  }
  fprintf(stderr, "files=%zu bytes=%zu best=%.3fs  %.2f MB/s  nodes=%lu err_files=%lu\n", nf, total,
          best, total / 1e6 / best, nodes, errs);
  return 0;
}
