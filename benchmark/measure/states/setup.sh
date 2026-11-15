#!/usr/bin/env bash
#
# Fetch tree-sitter-generate, apply generator-probes.patch and build the
# driver.  Needs cargo.  Everything lands in benchmark/measure/out/states/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=0.26.3
OUT="$HERE/../out/states"
mkdir -p "$OUT"
cd "$OUT"
if [ ! -d "tree-sitter-generate-$VERSION" ]; then
  curl -sSfL "https://static.crates.io/crates/tree-sitter-generate/tree-sitter-generate-$VERSION.crate" | tar xz
  patch -d "tree-sitter-generate-$VERSION" -p1 < "$HERE/generator-probes.patch"
fi
rm -rf run && cp -r "$HERE/run" run
cargo build --release --manifest-path run/Cargo.toml
echo "built: $OUT/run/target/release/run <grammar.json> <parser.c>"
