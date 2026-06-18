#!/usr/bin/env bash
#
# Materialise the benchmark corpus by cloning the repos listed in
# corpus-sources.tsv into ./corpus/, so the benchmark can be reproduced on a
# machine that doesn't already have these checkouts.
#
# Usage:
#   benchmark/fetch-corpus.sh [target-dir]      # shallow-clone latest (fast)
#   PINNED=1 benchmark/fetch-corpus.sh [dir]     # check out the exact commits
#                                                # recorded in the manifest
#
# Then:
#   benchmark/run.sh <target-dir>
#
# Latest-clone numbers will drift slightly as upstreams change; PINNED=1
# reproduces the exact corpus the committed results were measured on.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${1:-$HERE/corpus}"
PINNED="${PINNED:-0}"
mkdir -p "$DEST"

grep -v '^#' "$HERE/corpus-sources.tsv" | while IFS=$'\t' read -r name files commit url; do
  [ -n "${url:-}" ] || continue
  dir="$DEST/$name"
  if [ -d "$dir/.git" ]; then echo "have $name"; continue; fi
  if [ "$PINNED" = "1" ]; then
    echo "fetch (pinned) $name @ ${commit:0:10}"
    git init -q "$dir"
    git -C "$dir" remote add origin "$url"
    git -C "$dir" fetch -q --depth=1 origin "$commit" && git -C "$dir" checkout -q FETCH_HEAD \
      || { echo "  pinned commit unavailable, falling back to default branch"; \
           git -C "$dir" fetch -q --depth=1 origin && git -C "$dir" checkout -q FETCH_HEAD; }
  else
    echo "clone $name"
    git clone -q --depth=1 "$url" "$dir" || echo "  WARN: clone failed for $name"
  fi
done

echo
echo "corpus ready at: $DEST"
echo "perl files: $(find "$DEST" \( -name '*.pl' -o -name '*.pm' -o -name '*.t' \) -type f | wc -l)"
echo "now run:  benchmark/run.sh \"$DEST\""
