# Known coverage gaps

Constructs the grammar does not yet handle, surfaced by running it over the
real-world corpus (see `README.md`). A living checklist — tick items as they
land, and re-triage to refresh.

To refresh: re-run `benchmark/run.sh`, then re-triage the `last-ours.fail` set —
parse each, **walk to the innermost** ERROR/MISSING node (skip the whole-file
`(source_file (ERROR …))` wrapper), read the line there, and cluster.

## Current standing (broad corpus, 8,334 files)

- **126 fail** (98.5% clean). Of those: **112 genuine grammar gaps**,
  **9 intentional syntax-error fixtures** (not bugs), **5 non-UTF-8/binary**
  files (not bugs). ~33 of the gaps are size-1 long-tail.
- Gold corpus: **4 / 3,386 fail** (99.9%).
- Re-measured 2026-09-06 at v2.0.0 on 8,308 files: **123 fail (98.52%)** — the
  standing above still holds. Of those 123, `perl -c` calls 8 a genuine syntax
  error (we are right to flag them) and 50 syntax OK; the remaining 65 it can't
  judge for want of dependencies. So the real gap ceiling is ~50 files.

### Slow parses

One file blows the "everything parses fast" claim, and it is an **error-path**
cost, not a size cost:

| file | size | time |
| --- | --- | --- |
| `perl5/t/re/bigfuzzy_not_utf8.t` | 36 KB | **622 ms** |
| `perl5/lib/B/Deparse.pm` | — | 34 ms |
| `perl5/lib/overload.t` | — | 18 ms |

622 ms on 36 KB is **0.058 MB/s**, about 100x slower than our own clean-path
rate — clean files hold a steady 5–7 MB/s at *any* size (a 9.6 MB `TestProp.pl`
parses in 1.81 s). The file is a regex fuzzer corpus and is itself one of the
123 ERROR files, so this looks like GLR / error-recovery thrash on malformed
regex input rather than anything about its size. Among the 122 ERROR-bearing
files p50 is 1.4 ms and p99 is 33 ms, so it is one extreme outlier on a heavy
tail, and the tail lives entirely on error paths. In an editor a 622 ms stall is
visible. Worth a `parse -d` trace to see whether it is version forking or
repeated recovery attempts.

## Open clusters (genuine gaps, ranked by file count)

- [ ] **sub prototype / signature sigils** (8) — `sub rad2deg ($;$){}`,
      `sub($$) :Attr{}`, empty-proto-with-attr `sub () :const{}`,
      `sub t($a,,, $b)`. Prototype sigils (`$ ; \ & * +`) are parsed as a
      signature.
- [ ] **Test2::V0 bareword-block builders** (7) — `field error => "…"`,
      `hash {…}`, `bag { item $_; etc }`. Generic bareword-takes-block-then-list.
- [ ] **regex / char-class quote+meta scanner mis-lex** (7) — a `/.../`  or
      `qr{…}` whose char class mixes quote chars (`'"\``) with escaped brackets
      (`\[\]`) or `{}` makes the scanner mis-pair a delimiter and swallow the
      rest of the file. **Cascade**: the innermost ERROR lands far downstream
      on an innocent line. Highest-value cluster (whole-file recovery).
- [ ] **statement label before a block close** (6) — `L2:` (or `END:`, `done:`)
      as the last thing before `}`, i.e. a label with no following statement.
- [ ] **bareword constant before `*` or `/`** (5) — `PI * $_[0]`,
      `DIV_SIZE * (@$cols-1)`. A constant bareword before `*`/`/` is read as a
      glob/regex (`+`/`-` after a bareword are fine).
- [ ] **package-name segment starting with a digit** (1+) — `package
      Encode::KR::2022_KR;`, `package Foo::9x;`, and the same in a qualified
      call `Encode::KR::2022_KR::func()`. `Foo::x9` and `Foo::Bar` are fine, so
      it is specifically a *leading* digit in a `::` segment. perl accepts all
      of these.
- [ ] **`:prototype()` attribute** (4) — `sub getgrent :prototype( ) {}`.
- [ ] **v-string with `_`** (4) — `v1.2_3`, `\v65.66.6_7`.
- [ ] **comma before `=>` in anon-hash** (3) — `{ '-and', => [...] }`.
- [ ] **`@-`/`@+`/`@{…}` punctuation-array interpolation** (3) — `"foo@{-}"`,
      `qr/A@{-}B/`.
- [ ] **hex float** (3) — `0x1p60`, `0x0.b17217f7d1cf78p0`.
- [ ] **`continue { }` block** (3) — `} continue {…}`.
- [ ] **apostrophe package separator** (3) — `$main'blurfl`, `$magic'H`.
- [ ] **`<<` left-shift glued, mis-lexed as heredoc** (2) — `1<<index($x,$_)`,
      `1<<$x` (no space); `1 << index` (spaced) is fine. Scanner heuristic.
- [ ] **POD directive inside `q{}`/`qq{}`** (2) — a `=head1` at line-start
      inside a quote enters POD mode and eats the rest of the file. **Cascade.**
- [ ] **`x`-repeat glued to a number** (2) — `$notcomp x10`, `${$x x2}` (no
      space). There's already an `_x_op` scanner token to extend.
- [ ] **custom LHS bareword-block builder** (2) — `with_vars x {…}`,
      `multicall_return {…} $g`.
- [ ] **given/when** (2) — `given($x){ when(…){} }` (shape-1 recovery only).
- [ ] **unicode in sub / variable names** (2) — `my sub φου`, `$ㄅĽuṞfⳐ`. (Package
      names were fixed; sub/var-name paths still ASCII-only in places.)
- [ ] **quote with embedded code mis-lex** (2, cascade) — `qq/ … $call(@args) … /`,
      `q~ …code… ~` where the body trips the scanner.
- [ ] **eval-STRING / indirect call in a ternary** (2, cascade) —
      `is( eval 'Foo->boogie();1' ? … )`.

## Gold-corpus singletons (the stubborn 4)

- [ ] **C** — `s/ … /x` multiline substitution (Date::Format::Generic).
- [ ] **E** — `return true() if /\Gtrue/gc` — `\G` anchor after a bareword (Mojo::JSON).
- [ ] **F** — `->()` deref-call deep in a nested ternary (DateTime).
- [ ] **H** — YAML::Tiny: a char-class regex mis-lex cascades the whole file.

## Long tail (~33 size-1 gaps)

`0o101` new octal · `0x_1234` underscore-after-radix · `s/…\K…/eggnog` (`\K` +
nonstandard modifier) · `tr` with `\` delimiter · string-bitwise `&.`/`|.` ·
`delete local @Pkg::{<a b>}` · `for CORE::my $v` · `CORE::__DATA__` ·
`require;` (no arg) · `$^]` caret var · optional-chaining `?->` + try/catch ·
`try … catch X with {}` (Error.pm) · fat-comma in `my(...)` · fileglob `<a'b'>` ·
`-f ++ $x` · `"$_->@*"` postfix-deref in string · `new Oscalar …` indirect object ·
`"$x[0]-> [0]"` arrow-space in string · `<<END` as a term · etc. Low ROI each.

## Not grammar bugs

- **9 intentional syntax-error test fixtures** (e.g. `DBICTest/SyntaxErrorComponent*.pm`,
  Mojo loader-exception stubs, EOF-error tests). These *should* fail to parse.
- **5 non-UTF-8 / binary** inputs (UTF-16BE BOM, ISO-8859, raw blobs, fuzz data).
- (No timeouts: the whole corpus parses within the per-file limit. But see
  **Slow parses** above — `bigfuzzy_not_utf8.t` takes 622 ms on 36 KB, which
  the earlier "everything else <500ms" note missed.)

## Recently addressed

class/role/method barewords · prefix `++`/`--` in parenless list-ops · phaser
labels · `our`/`state sub` · unicode **package** identifiers · `format … .` ·
`async { }` + `try(...)` · typed lexicals (`my Dog $spot`) · bare `eval`.

## Head-to-head vs the perl-lsp pure-Rust parser (2026-09-06)

`EffortlessMetrics/perl-lsp` ships a hand-written Rust parser alongside a
vendored copy of this grammar. Same 8,308 files, same criterion (tree contains
an ERROR/MISSING node):

| | ERROR-bearing | clean |
| --- | --- | --- |
| ours (v2.0.0) | **123** | **98.52%** |
| theirs (pure Rust) | 407 | 95.10% |

both fail 49 · only ours 74 · only theirs 358.

Two caveats worth keeping straight:

- **Their shipped counter is not a correctness signal.** `perl-parse --stats`
  reports `Files failed: 0` across the whole corpus, and also 0 on input perl
  rejects outright (unmatched braces, literal JSON, `my $x = ;;; = = = ;`). It
  only counts a hard `Err` return, which never happens. They *do* emit
  `(ERROR "...")` nodes — the table above greps the AST, which is why it differs
  from anything they publish.
- **Their AST is coarser** (`my $x = 1` → `(my_declaration (variable $ x)(number
  1))`); we emit 1.8x more nodes on the same sample. A parser modelling less
  structure has fewer places to detect an error, so some of the gap is that.

Of the 74 files only we flag, 6 are files `perl -c` itself rejects (the
intentional-syntax-error fixtures below) — there our ERROR is correct and their
silence is a false negative.

They are **4.2x faster** cold (2.41 s vs 10.09 s over 76 MB; ~2.3x per node).
That matters for cold whole-workspace indexing and essentially not at all for
editing — our mean is ~1.2 ms/file — and it is not what tree-sitter optimises
for, since nothing here measures incremental reparse. The one number worth
acting on is our own 622 ms outlier above.

## High-value note for the next pass

The biggest leverage is the **scanner-cascade** clusters — a single mis-lex
(char-class regex, glued `<<`, POD-in-quote, embedded-code quote) errors the
*entire file*, so each fix recovers a whole tree, not one line. The
char-class/regex mis-lex (7 files directly, plus the real trigger behind several
"cascade" long-tail entries and gold-H) is the standout.
