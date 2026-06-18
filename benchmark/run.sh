#!/usr/bin/env bash
#
# Benchmark this grammar against another tree-sitter-perl grammar on a corpus
# of real Perl files, reporting clean-parse rate and a head-to-head breakdown.
#
# Usage:
#   benchmark/run.sh <corpus-dir|paths-file> [theirs-git-url-or-dir]
#
#   <corpus-dir|paths-file>  A directory to glob for *.pl/*.pm/*.t, OR a file
#                            listing one absolute path per line.
#   [theirs]                 Git URL or local dir of the grammar to compare
#                            against. Default: ganezdragon/tree-sitter-perl.
#
# Notes:
#   * Both grammars are compiled to SEPARATE .so files and loaded via
#     `--lib-path`. Do NOT use `tree-sitter parse -p <dir>`: it caches the
#     compiled parser by language NAME, so the second grammar silently reuses
#     the first's library and you benchmark one grammar against itself.
#   * A parse "fails" if the resulting tree contains any ERROR or MISSING node.
#   * A generous per-file timeout (30s) guards against pathological hangs;
#     no normal file approaches it, so timeouts don't skew the counts.
set -euo pipefail

OURS_DIR="${OURS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CORPUS="${1:?usage: run.sh <corpus-dir|paths-file> [theirs-git-url-or-dir]}"
THEIRS="${2:-https://github.com/ganezdragon/tree-sitter-perl}"

command -v tree-sitter >/dev/null || { echo "tree-sitter CLI not found on PATH" >&2; exit 1; }
command -v cc >/dev/null         || { echo "a C compiler (cc) is required"   >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# --- resolve "theirs" to a directory -----------------------------------------
if [ -d "$THEIRS" ]; then
  THEIRS_DIR="$THEIRS"
else
  echo "cloning $THEIRS ..."
  THEIRS_DIR="$WORK/theirs"
  git clone --depth=1 -q "$THEIRS" "$THEIRS_DIR"
fi

# --- make sure generated sources exist ---------------------------------------
[ -f "$OURS_DIR/src/parser.c" ]   || ( cd "$OURS_DIR"   && tree-sitter generate >/dev/null )
[ -f "$THEIRS_DIR/src/parser.c" ] || ( cd "$THEIRS_DIR" && tree-sitter generate >/dev/null )

# --- compile each grammar to its own shared library --------------------------
build() { # <grammar-dir> <output.so>
  local d="$1" so="$2" scanner="" compiler=cc
  if   [ -f "$d/src/scanner.c"  ]; then scanner="$d/src/scanner.c"
  elif [ -f "$d/src/scanner.cc" ]; then scanner="$d/src/scanner.cc"; compiler=c++
  fi
  "$compiler" -O2 -shared -fPIC -I "$d/src" "$d/src/parser.c" $scanner -o "$so"
}
echo "compiling parsers ..."
build "$OURS_DIR"   "$WORK/ours.so"
build "$THEIRS_DIR" "$WORK/theirs.so"

# --- assemble the corpus path list -------------------------------------------
if [ -d "$CORPUS" ]; then
  find "$CORPUS" \( -name '*.pl' -o -name '*.pm' -o -name '*.t' \) -type f | sort > "$WORK/paths.txt"
else
  grep -v '^\s*$' "$CORPUS" | sort > "$WORK/paths.txt"
fi
N=$(wc -l < "$WORK/paths.txt")
[ "$N" -gt 0 ] || { echo "no files found in corpus: $CORPUS" >&2; exit 1; }

# --- parse with each grammar -------------------------------------------------
parse() { # <so> <outfile>
  tree-sitter parse --lib-path "$1" --lang-name perl -q --stat \
    --timeout 30000000 --paths "$WORK/paths.txt" > "$2" 2>&1 || true
}
echo "parsing $N files with ours ..."
parse "$WORK/ours.so"   "$WORK/ours.out"
echo "parsing $N files with theirs ..."
parse "$WORK/theirs.so" "$WORK/theirs.out"

# --- crunch the numbers ------------------------------------------------------
fails() { sed -E 's/[[:space:]]*Parse:.*$//' "$1" | { grep '^/' || true; } | sort -u; }
fails "$WORK/ours.out"   > "$WORK/ours.fail"
fails "$WORK/theirs.out" > "$WORK/theirs.fail"

of=$(wc -l < "$WORK/ours.fail"); tf=$(wc -l < "$WORK/theirs.fail")
oss=$((N - of));               tss=$((N - tf))
both=$(comm -12 "$WORK/ours.fail" "$WORK/theirs.fail" | wc -l)
only_ours=$(comm -23 "$WORK/ours.fail" "$WORK/theirs.fail" | wc -l)
only_theirs=$(comm -13 "$WORK/ours.fail" "$WORK/theirs.fail" | wc -l)
pct() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f", (a*100.0)/b}'; }

printf '\n'
printf '  corpus files: %d\n\n' "$N"
printf '  %-10s %12s %12s\n' "grammar"  "clean"           "failed"
printf '  %-10s %9s%%   %12d\n' "ours"   "$(pct $oss $N)"  "$of"
printf '  %-10s %9s%%   %12d\n' "theirs" "$(pct $tss $N)"  "$tf"
printf '\n  head-to-head:\n'
printf '    only ours fails (theirs parses): %d\n' "$only_ours"
printf '    only theirs fails (ours parses): %d\n' "$only_theirs"
printf '    both fail:                       %d\n' "$both"

# leave the failing-file lists for inspection
cp "$WORK/ours.fail"   "$OURS_DIR/benchmark/last-ours.fail"   2>/dev/null || true
cp "$WORK/theirs.fail" "$OURS_DIR/benchmark/last-theirs.fail" 2>/dev/null || true
printf '\n  (failing-file lists written to benchmark/last-{ours,theirs}.fail)\n'
