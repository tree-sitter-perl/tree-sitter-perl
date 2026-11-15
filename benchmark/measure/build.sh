#!/usr/bin/env bash
#
# Build the measuring tools against one build of the parser.
#
#   benchmark/measure/build.sh <tag> [grammar-dir]
#
#   <tag>          names the build: tools land in benchmark/measure/out/<tag>/
#   [grammar-dir]  a checkout whose src/parser.c and src/scanner.c to measure
#                  (default: this one).  Run `./tree-sitter generate` there
#                  first; this script does not.
#
# Prints STATE_COUNT, LARGE_STATE_COUNT and the size of parser.o.
#
# The tools link libtree-sitter built from source.  Point TS_SRC at a
# tree-sitter checkout's lib/ directory (or an unpacked `tree-sitter` crate);
# otherwise the crate is downloaded once into out/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG="${1:?usage: build.sh <tag> [grammar-dir]}"
GRAMMAR="${2:-$HERE/../..}"
TS_VERSION="${TS_VERSION:-0.25.10}"
OUT="$HERE/out/$TAG"
mkdir -p "$OUT"

if [ -z "${TS_SRC:-}" ]; then
  TS_SRC="$HERE/out/tree-sitter-$TS_VERSION"
  if [ ! -d "$TS_SRC" ]; then
    curl -sSfL "https://static.crates.io/crates/tree-sitter/tree-sitter-$TS_VERSION.crate" |
      tar xz -C "$HERE/out"
  fi
fi

LIB="$HERE/out/libtree-sitter.o"
[ -f "$LIB" ] || cc -O3 -c -I "$TS_SRC/src" -I "$TS_SRC/include" -I "$TS_SRC/src/unicode" \
  -D_POSIX_C_SOURCE=200112L -D_DEFAULT_SOURCE "$TS_SRC/src/lib.c" -o "$LIB"

cc -O2 -c -I "$GRAMMAR/src" "$GRAMMAR/src/parser.c" -o "$OUT/parser.o"
cc -O2 -c -I "$GRAMMAR/src" "$GRAMMAR/src/scanner.c" -o "$OUT/scanner.o"
for tool in treehash sexp census instr; do
  cc -O2 -I "$TS_SRC/include" "$HERE/$tool.c" "$OUT/parser.o" "$OUT/scanner.o" "$LIB" -o "$OUT/$tool"
done

awk '/^#define (STATE_COUNT|LARGE_STATE_COUNT) /{printf "%s %s  ", $2, $3}' "$GRAMMAR/src/parser.c"
echo "parser.o $(size "$OUT/parser.o" | awk 'NR==2{print $4}') bytes"
