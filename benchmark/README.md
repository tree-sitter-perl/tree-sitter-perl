# Parsing benchmark

Measures how often this grammar parses real-world Perl **without any error**,
compared against another tree-sitter-perl grammar.

A file counts as a *clean parse* if its syntax tree contains no `ERROR` or
`MISSING` node. The headline metric is the percentage of files that parse
cleanly.

## Running it

```sh
# against a corpus you already have on disk (a dir, or a file of paths):
benchmark/run.sh /path/to/some/perl/checkouts

# reproduce the published corpus from scratch (clones the repos in
# corpus-sources.tsv), then benchmark it:
benchmark/fetch-corpus.sh
benchmark/run.sh benchmark/corpus

# compare against a specific grammar (default: ganezdragon/tree-sitter-perl):
benchmark/run.sh benchmark/corpus https://github.com/ganezdragon/tree-sitter-perl
```

Requirements: the `tree-sitter` CLI and a C compiler on `PATH`.

`run.sh` writes the lists of failing files to `benchmark/last-ours.fail` and
`benchmark/last-theirs.fail` for inspection.

## Why it compiles the parsers by hand

`run.sh` compiles each grammar to its **own** `.so` and loads it with
`tree-sitter parse --lib-path`. This is deliberate: `tree-sitter parse -p <dir>`
caches the compiled parser keyed by language *name*, so pointing it at two
different grammars that both call themselves `perl` makes the second silently
reuse the first's library — you end up benchmarking one grammar against itself
(identical results, identical `.so` checksum). `--lib-path` sidesteps the cache
entirely.

A 30s per-file timeout guards against pathological hangs; no normal file comes
close, so it doesn't affect the counts. Confirm by re-running with a different
timeout — the failure count should not move.

## Latest results

Known remaining grammar gaps are tracked in [`coverage-gaps.md`](coverage-gaps.md).

Measured with `tree-sitter` 0.26.x against `ganezdragon/tree-sitter-perl`.

**Broad corpus** — 8,334 files, perl5 core + major CPAN distributions
(see `corpus-sources.tsv`):

| grammar | clean parse | failures |
| --- | --- | --- |
| this grammar | **95.4%** | 382 |
| ganezdragon | 40.2% | 4,983 |

Head-to-head: we cleanly parse 4,748 files the other grammar fails on; it
parses 147 we fail on; 235 fail for both.

**Gold corpus** — 3,386 curated CPAN release modules:

| grammar | clean parse | failures |
| --- | --- | --- |
| this grammar | **99.6%** | 14 |
| ganezdragon | 73.9% | 885 |

Head-to-head: we uniquely parse 873 files it fails; it uniquely parses 2 we
fail.

(Numbers from a latest-`HEAD` clone drift slightly as upstreams change; use
`PINNED=1 benchmark/fetch-corpus.sh` to reproduce the exact corpus. The
file counts in `corpus-sources.tsv` are as observed locally; a small number
were untracked working-copy files and won't appear in a fresh clone, so a
reproduced corpus may be a few dozen files smaller. The clean-parse
percentages are stable regardless.)
