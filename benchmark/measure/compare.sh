#!/usr/bin/env bash
#
# Compare two builds made with build.sh.
#
#   benchmark/measure/compare.sh <base-tag> <new-tag> [corpus-dir|paths-file ...]
#
# Corpora default to benchmark/corpus (see ../fetch-corpus.sh).  Reports
#
#   1. every file whose tree differs between the builds, marked CLEAN-BEFORE
#      when the base build parsed it without ERROR or MISSING.  A change to a
#      clean file is a change to valid code: look at each one
#      (`diff <(out/<base>/sexp F) <(out/<new>/sexp F)`).
#   2. instructions to parse lists/sample.list, by callgrind (skipped when
#      valgrind is missing).  The sample is all valid code but one file; a
#      build that recovers differently can move this number on that file alone.
#   3. the mid-edit census over lists/census.list (see census.c).  SKIP_CENSUS=1
#      skips it; it takes a few minutes.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE="$HERE/out/${1:?usage: compare.sh <base-tag> <new-tag> [corpus ...]}"
NEW="$HERE/out/${2:?usage: compare.sh <base-tag> <new-tag> [corpus ...]}"
shift 2
[ $# -gt 0 ] || set -- "$HERE/../corpus"
CORPUS="$(cd "$HERE/../corpus" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

for c in "$@"; do
  if [ -d "$c" ]; then
    find "$(cd "$c" && pwd)" -type f \( -name '*.pm' -o -name '*.pl' -o -name '*.t' \)
  else
    cat "$c"
  fi
done | sort > "$WORK/all.list"

"$BASE/treehash" "$WORK/all.list" > "$WORK/base.txt"
"$NEW/treehash" "$WORK/all.list" > "$WORK/new.txt"
paste -d' ' <(cut -d' ' -f1,2 "$WORK/base.txt") "$WORK/new.txt" |
  awk '$1 != $3 || $2 != $4 { print $5 }' > "$WORK/diff.list"
clean=0
while read -r f; do
  if "$BASE/sexp" "$f" | grep -q 'ERROR\|MISSING'; then
    echo "broken-before: $f"
  else
    echo "CLEAN-BEFORE:  $f"
    clean=$((clean + 1))
  fi
done < "$WORK/diff.list"
echo "trees: $(wc -l < "$WORK/all.list") files, $(wc -l < "$WORK/diff.list") differ, $clean of them clean before"

sed "s|^|$CORPUS/|" "$HERE/lists/sample.list" > "$WORK/sample.list"
if command -v valgrind > /dev/null; then
  for b in "$BASE" "$NEW"; do
    ir=$(valgrind --tool=callgrind --callgrind-out-file=/dev/null "$b/instr" "$WORK/sample.list" 1 2>&1 |
      awk '/Collected/{print $NF}')
    echo "instructions ($(basename "$b")): $ir"
  done
fi

if [ -z "${SKIP_CENSUS:-}" ]; then
  sed "s|^|$CORPUS/|" "$HERE/lists/census.list" > "$WORK/census.list"
  "$BASE/census" "$WORK/census.list" 2 > "$WORK/base.tsv"
  "$NEW/census" "$WORK/census.list" 2 > "$WORK/new.tsv"
  python3 "$HERE/census-summary.py" "$WORK/base.tsv" "$WORK/new.tsv"
fi
