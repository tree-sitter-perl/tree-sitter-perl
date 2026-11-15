// census: what does one half-typed quote do to the rest of the tree?
//
//   census <listfile> <K>
//
// For every file in the list that parses clean (2 KB to 400 KB), and for each
// of 14 kinds of edit, makes K simulated edits (fixed seed) and reparses:
//
//   new-*    a line with an unclosed quote typed in front of a statement
//   drop-*   the closer or the opener of an existing string deleted
//
// then counts how many named nodes of the original tree are still there, at
// the same (shifted) span, in the edited tree.  One TSV row per edit:
//
//   1 scenario           2 unterminated_quote seen (2 = at the edit)
//   3 nodes compared     4 of which survived
//   5 nodes after edit   6 of which survived
//   7 ERROR/MISSING nodes  8 bytes inside ERROR
//   9 subs               10 of which survived
//   11 edit offset       12 file length   13 file   14 k
//
// census-summary.py turns two such files into a table.
#define _GNU_SOURCE
#include <stdint.h>
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
  char *b = malloc(l + 64);
  *n = fread(b, 1, l, f);
  b[*n] = 0;
  fclose(f);
  return b;
}
typedef struct {
  uint64_t *k;
  size_t n, cap;
} Set;
static void push(Set *s, uint64_t v) {
  if (s->n == s->cap) {
    s->cap = s->cap ? s->cap * 2 : 4096;
    s->k = realloc(s->k, s->cap * 8);
  }
  s->k[s->n++] = v;
}
static int cmp(const void *a, const void *b) {
  uint64_t x = *(uint64_t *)a, y = *(uint64_t *)b;
  return x < y ? -1 : x > y;
}
static uint64_t key(TSSymbol sym, uint32_t s, uint32_t e) {
  return ((uint64_t)sym << 48) | ((uint64_t)s << 24) | e;
}
typedef struct {
  TSNode *v;
  size_t n, cap;
} NV;
static void npush(NV *s, TSNode v) {
  if (s->n == s->cap) {
    s->cap = s->cap ? s->cap * 2 : 1024;
    s->v = realloc(s->v, s->cap * sizeof(TSNode));
  }
  s->v[s->n++] = v;
}
static TSSymbol SUB, ERR = 65535, UNT;
static void walk(TSNode r, void (*f)(TSNode, void *), void *ud) {
  TSTreeCursor c = ts_tree_cursor_new(r);
  for (;;) {
    f(ts_tree_cursor_current_node(&c), ud);
    if (ts_tree_cursor_goto_first_child(&c)) continue;
    while (!ts_tree_cursor_goto_next_sibling(&c)) {
      if (!ts_tree_cursor_goto_parent(&c)) {
        ts_tree_cursor_delete(&c);
        return;
      }
    }
  }
}
// collected from the original tree
static NV all, stmts, strs1, strs2, strsp;
static const char *src;
static void collect(TSNode n, void *ud) {
  if (!ts_node_is_named(n)) return;
  npush(&all, n);
  const char *t = ts_node_type(n);
  if (!strcmp(t, "expression_statement")) npush(&stmts, n);
  uint32_t s = ts_node_start_byte(n), e = ts_node_end_byte(n);
  if (e - s >= 3) {
    if (!strcmp(t, "string_literal") && src[s] == '\'')
      npush(&strs1, n);
    else if (!strcmp(t, "interpolated_string_literal") && src[s] == '"')
      npush(&strs2, n);
    else if ((!strcmp(t, "quoted_word_list") || !strcmp(t, "string_literal") ||
              !strcmp(t, "interpolated_string_literal")) &&
             src[s] == 'q' && strchr(")]}>", src[e - 1]))
      npush(&strsp, n);
  }
}
typedef struct {
  Set set;
  unsigned errn;
  unsigned long errb;
  int unt;
  uint32_t first_err;
  uint32_t a0, a1;
  int unt_here;
} New;
static void collect_new(TSNode n, void *ud) {
  New *w = ud;
  TSSymbol sy = ts_node_symbol(n);
  if (sy == ERR || ts_node_is_missing(n)) {
    w->errn++;
    if (sy == ERR) {
      w->errb += ts_node_end_byte(n) - ts_node_start_byte(n);
    }
    if (ts_node_start_byte(n) < w->first_err) w->first_err = ts_node_start_byte(n);
  }
  if (!ts_node_is_named(n)) return;
  if (sy == UNT) {
    w->unt = 1;
    if (ts_node_start_byte(n) >= w->a0 && ts_node_start_byte(n) < w->a1) w->unt_here = 1;
  }
  push(&w->set, key(sy, ts_node_start_byte(n), ts_node_end_byte(n)));
}
static const char *INS[] = {"my $s = \"hello",  "my $s = 'hello",   "my $s = q(hello",
                            "my @l = qw(a b",   "if ($s =~ m{^foo", "foo(\"bar",
                            "$s =~ s{foo}{bar", "my $s = \"hello;", "my @l = qw(a b;"};
static const char *NAME[] = {"new-dq",         "new-sq",         "new-q(",
                             "new-qw(",        "new-m{",         "call-dq",
                             "new-s{}{",       "new-dq;",        "new-qw(;",
                             "drop-sq-closer", "drop-dq-closer", "drop-paired-closer",
                             "drop-sq-opener", "drop-dq-opener"};
#define NINS 9
#define NSC 14
int main(int argc, char **argv) {
  FILE *lf = fopen(argv[1], "r");
  int K = atoi(argv[2]);
  char line[4096];
  srand(7);
  const TSLanguage *L = tree_sitter_perl();
  SUB = ts_language_symbol_for_name(L, "subroutine_declaration_statement", 32, true);
  UNT = ts_language_symbol_for_name(L, "unterminated_quote", 18, true);
  TSParser *p = ts_parser_new();
  ts_parser_set_language(p, L);
  while (fgets(line, sizeof line, lf)) {
    line[strcspn(line, "\n")] = 0;
    size_t len;
    char *b = slurp(line, &len);
    if (!b || len < 2000 || len > 400000) {
      free(b);
      continue;
    }
    TSTree *t = ts_parser_parse_string(p, NULL, b, len);
    TSNode root = ts_tree_root_node(t);
    if (ts_node_has_error(root)) {
      ts_tree_delete(t);
      free(b);
      continue;
    }
    src = b;
    all.n = stmts.n = strs1.n = strs2.n = strsp.n = 0;
    walk(root, collect, 0);
    for (int sc = 0; sc < NSC; sc++)
      for (int k = 0; k < K; k++) {
        uint32_t off, del = 0, a0 = 0, a1 = 0;
        char insbuf[256];
        size_t il;
        unsigned r = rand();
        if (sc < NINS) {
          if (!stmts.n) continue;
          TSNode st = stmts.v[r % stmts.n];
          off = ts_node_start_byte(st);
          uint32_t ls = off;
          while (ls > 0 && b[ls - 1] != '\n') ls--;
          int ok = 1;
          for (uint32_t i = ls; i < off; i++)
            if (b[i] != ' ' && b[i] != '\t') ok = 0;
          if (!ok) continue;  // statement must start its line
          il = snprintf(insbuf, sizeof insbuf, "%s\n%.*s", INS[sc], (int)(off - ls), b + ls);
          a0 = off;
          a1 = off + strlen(INS[sc]);
        } else {
          NV *v = (sc == 9 || sc == 12) ? &strs1 : (sc == 10 || sc == 13) ? &strs2 : &strsp;
          if (!v->n) continue;
          TSNode s = v->v[r % v->n];
          del = 1;
          il = 0;
          insbuf[0] = 0;
          a0 = ts_node_start_byte(s);
          if (sc >= 12) {
            off = a0;
            a1 = ts_node_end_byte(s);
          } else {
            off = ts_node_end_byte(s) - 1;
            a1 = off;
          }
        }
        size_t nl = len - del + il;
        char *nb = malloc(nl + 1);
        memcpy(nb, b, off);
        memcpy(nb + off, insbuf, il);
        memcpy(nb + off + il, b + off + del, len - off - del);
        nb[nl] = 0;
        TSTree *nt = ts_parser_parse_string(p, NULL, nb, nl);
        New w = {{0, 0, 0}, 0, 0, 0, (uint32_t)nl, a0, a1, 0};
        walk(ts_tree_root_node(nt), collect_new, &w);
        qsort(w.set.k, w.set.n, 8, cmp);
        unsigned tot = 0, surv = 0, subs = 0, subsurv = 0, after_tot = 0, after_surv = 0;
        for (size_t i = 0; i < all.n; i++) {
          TSNode n = all.v[i];
          uint32_t s = ts_node_start_byte(n), e = ts_node_end_byte(n);
          if ((s > off && s < off + del) || (e > off && e < off + del))
            continue;  // touches deleted bytes
          uint32_t ns = s < off ? s : (s >= off + del ? s - del + il : s),
                   ne = e <= off ? e : e - del + il;
          uint64_t kk = key(ts_node_symbol(n), ns, ne);
          int found = bsearch(&kk, w.set.k, w.set.n, 8, cmp) != 0;
          tot++;
          surv += found;
          if (s >= off + del) {
            after_tot++;
            after_surv += found;
          }
          if (ts_node_symbol(n) == SUB) {
            subs++;
            subsurv += found;
          }
        }
        printf("%s\t%d\t%u\t%u\t%u\t%u\t%u\t%lu\t%u\t%u\t%u\t%zu\t%s\t%u\n", NAME[sc],
               w.unt_here ? 2 : w.unt, tot, surv, after_tot, after_surv, w.errn, w.errb, subs,
               subsurv, off, len, line, k);
        free(w.set.k);
        ts_tree_delete(nt);
        free(nb);
      }
    ts_tree_delete(t);
    free(b);
  }
  return 0;
}
