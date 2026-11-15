# Measuring a parser change

Tools for answering, about a change to `grammar.js` or `src/scanner.c`:

- how big is the parser now (states, large states, object size)?
- which trees changed, and were any of them valid code?
- did parsing get slower?
- what does a half-typed quote do to the rest of the tree?

`../run.sh` answers a different question (how much real Perl parses clean,
against another grammar).

Needs a C compiler, `curl`, `python3`, and `valgrind` for instruction counts.
The corpus is the one `../fetch-corpus.sh` clones into `../corpus`.

## Comparing two builds

```sh
git stash                     # or check out the base somewhere else
./tree-sitter generate && benchmark/measure/build.sh base
git stash pop
./tree-sitter generate && benchmark/measure/build.sh new
benchmark/measure/compare.sh base new
```

`build.sh <tag> [grammar-dir]` compiles `src/parser.c` and `src/scanner.c`
into `out/<tag>/` with four tools linked against them, and prints the state
counts and the size of `parser.o`. `compare.sh <base> <new> [corpus ...]` then
reports three things.

**Tree diff.** `treehash` hashes every node's type, span and field for every
file; any file whose hash moved is listed, marked `CLEAN-BEFORE` when the base
build parsed it without `ERROR` or `MISSING`. Those are changes to valid code
and each one wants a look:

```sh
diff <(benchmark/measure/out/base/sexp FILE) <(benchmark/measure/out/new/sexp FILE)
```

Pass more corpora (directories or files of paths) after the tags. A heuristic
in the scanner is only as good as the code it was diffed against.

**Instructions.** `instr` parses `lists/sample.list` (250 corpus files) under
callgrind. Instruction counts repeat to a few parts in a million; wall time on
a shared machine does not. One file in the sample, `perl5/t/base/lex.t`, does
not parse clean, and error recovery is expensive: a change that recovers
differently can move the total on that file alone. `instr <list> 1 x` prints
per-file times to find it.

**Mid-edit census.** `census` takes the 500 files of `lists/census.list`,
makes two simulated edits of each of 14 kinds in every one (a line with an
unclosed quote typed in front of a statement; the closer or opener of an
existing string deleted), reparses, and counts how many named nodes of the
original tree survive at the same place. `census-summary.py` prints mean
survival and the number of bad edits (under 90% surviving) per kind. The
header of `census.c` documents the raw columns. `SKIP_CENSUS=1` skips it.

The two lists are fixed samples, so numbers compare across machines and over
time as long as `../corpus-sources.tsv` pins the same commits.

## Why does the parser have this many states? (`states/`)

`./tree-sitter generate --report-states-for-rule -` says which rules take part
in many states. It does not say why two states with the same items were not
merged, which is where most of this grammar's states come from: the generator
will not merge two copies of a state when one accepts an external token the
other lacks, or a token that conflicts lexically with one of the other's.

`states/generator-probes.patch` adds environment switches to
tree-sitter-generate 0.26.3 for asking that question, and `states/setup.sh`
fetches the crate, applies the patch and builds a small driver:

```sh
benchmark/measure/states/setup.sh
run=benchmark/measure/out/states/run/target/release/run

$run src/grammar.json /tmp/parser.c                      # same table as the CLI
TSX_NOEXT=1 $run src/grammar.json /tmp/parser.c          # what if no external token blocked a merge?
TSX_EXTOK=_RECOVER_PAREN_CLOSE,_PERLY_SEMICOLON $run ... # what if these externals did not?
grep 'define STATE_COUNT' /tmp/parser.c
```

| switch | pretends that |
| --- | --- |
| `TSX_NOEXT=1` | no external token blocks a merge |
| `TSX_NOLEX=1` | no internal token blocks a merge |
| `TSX_NOKW=1` | no keyword blocks a merge |
| `TSX_ALL=1` | nothing does (the floor) |
| `TSX_EXTOK=a,b` | the named external tokens do not |
| `TSX_TOKOK=a,b` | the named internal tokens do not |

The parser written under any switch but none is **wrong** (states were merged
that must not be); only its state count means anything. It is a way to learn
what a grammar change would buy before making it. Each run takes about 4 GB;
do not run many at once.

`TSX_DUMP=1` prints every state before merging and every merged group on
stderr. `groups.py` lists the cores left in the most copies and `contexts.py`
names the contexts those copies come from:

```sh
TSX_DUMP=1 $run src/grammar.json /tmp/parser.c 2> /tmp/dump.txt
benchmark/measure/states/groups.py /tmp/dump.txt top 5
benchmark/measure/states/contexts.py /tmp/dump.txt 30
```

The dump's four lookahead columns are hard-coded probes in the patch (`'=='`,
`'abs'`, `_RECOVER_END`, `'and'`); edit them there for a different question.
