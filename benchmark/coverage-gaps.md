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

### Slow parses — diagnosed and fixed (2026-09-07)

One file blew the "everything parses fast" claim: `perl5/t/re/bigfuzzy_not_utf8.t`
took **622 ms** on 36 KB (0.058 MB/s, ~100x off our clean-path 5–7 MB/s; a 9.6 MB
`TestProp.pl` parses in 1.81 s). It was an **error-path** cost, not a size cost.
Root-caused; it now parses **clean in 0.9 ms**.

The chain, in order:

1. **A literal NUL byte was read as end-of-input.** `lexer->lookahead` is `0`
   both at real EOF and on a `0x00` byte in the source, so the scanner's
   `while (c)` string-content loop ended the string at the NUL. Despite the
   filename, invalid UTF-8 had nothing to do with it — replacing the NULs with
   `X` gave a clean 1.07 ms parse, replacing every high byte but keeping the
   NULs still took 620 ms.
2. **That dumped 35 KB of fuzz into the expression parser.** Line 37 is a single
   35,726-byte line, `fresh_perl_is('qr/…fuzz…/', …)`. With the string broken 47
   bytes in, the rest lexes as Perl code — and **32,218 of its 35,727 bytes are
   `|`**.
3. **A long run of `|` binary operators makes error recovery quadratic**, and
   that part is **upstream, not ours**. Instrumented counters show external
   scanner calls and lexer advances scaling exactly linearly (4,011 / 8,011 /
   16,011 calls and 2,008 / 4,008 / 8,008 advances for n = 2,000 / 4,000 / 8,000
   pipes) while parse time goes 14 / 62 / 252 ms. The `parse -d` trace agrees:
   `skip_token`, `recover_to_previous` and `condense` counts are all linear and
   only four GLR versions ever exist — so it is neither version forking nor a
   scan-to-EOL in our scanner, but libtree-sitter's per-skipped-token error-node
   accumulation. It reproduces with no NUL and no fuzz: `my $x = ` + `'|' x n` +
   `;` is n² (n = 40,000 → 5.7 s), and spreading the pipes over separate lines
   does not help.

So the lever available to us is step 1: don't enter a 35 KB error region in the
first place. Steps 2–3 stay latent — any input that error-recovers across tens of
thousands of tokens will still be quadratic until upstream changes.

Among the remaining ERROR-bearing files p50 is 1.4 ms and p99 is 33 ms, so the
heavy tail lives entirely on error paths. Next-slowest are `perl5/lib/B/Deparse.pm`
(34 ms) and `perl5/lib/overload.t` (18 ms) — both fine.

### NUL-is-not-EOF sweep (2026-09-07)

Chasing the above turned up a family of the same bug. `perl -c` accepts a `0x00`
byte as ordinary content in **every** construct tested, so each of these was a
real defect:

| site | symptom | status |
| --- | --- | --- |
| `while (c)` in the q/qq content loop | `'a\0b'`, `q(a\0b)` end at the NUL | fixed |
| `tsp_strchr` matching its own terminator | NUL reads as an interpolation escape *and* as a filetest letter — broke `"…"`, `qq()`, `qx()`, `m//`, `s///`, `tr///` | fixed |
| `skip_braced`'s `while (c && c != '}')` | `"\x{4\0 1}"` braced escape truncated | fixed |
| `intuit_more` lookahead buffer's `c != 0` | charclass/quantifier heuristic buffer truncated at a NUL | fixed |

`tsp_strchr` was the big one — as with libc `strchr`, a `0` needle matched the
string terminator, so every caller feeding it a lookahead got a false positive.
Fixing that one primitive cleared seven of the nine failing constructs at once.

Regression cover: `test/corpus/nul_bytes` (real 0x00 bytes; see `.gitattributes`).
Seven of its eight cases fail without the fix.

**Still broken, and upstream:** a NUL in a *comment* (`# a\0b`) or standing bare
between statements truncates the token, because tree-sitter's generated lexer
emits `lookahead != 0 && …` for a negated character class — it reserves `0` as
its EOF sentinel, so no grammar-level regex can match a NUL. perl treats a NUL in
code as whitespace (`$h{a\0b}` parses as the indirect call `a b`); we do not.
All three degrade gracefully to a one-character ERROR node with the surrounding
code parsed normally, so this is a curiosity, not a gap worth chasing.

Corpus delta from the fix: re-parsing the 382-file known-failing list, **+2 files
now parse clean** (`bigfuzzy_not_utf8.t`, `t/re/reg_mesg.t`) with **zero
regressions**.

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
- **non-UTF-8 / binary** inputs (UTF-16BE BOM, ISO-8859, raw blobs). Was 5;
  the two whose only problem was an embedded NUL byte (`t/re/bigfuzzy_not_utf8.t`,
  `t/re/reg_mesg.t`) were real bugs and are now fixed — see the **NUL-is-not-EOF
  sweep** above. Do not file a file here just because it holds a `0x00`.
- (No timeouts, and as of 2026-09-07 no slow parses either: the 622 ms
  `bigfuzzy_not_utf8.t` outlier is fixed and now parses clean in 0.9 ms.)

## Recently addressed

class/role/method barewords · prefix `++`/`--` in parenless list-ops · phaser
labels · `our`/`state sub` · unicode **package** identifiers · `format … .` ·
`async { }` + `try(...)` · typed lexicals (`my Dog $spot`) · bare `eval` ·
**literal NUL bytes in strings, regexes, quote-likes and braced escapes**
(which also removed the 622 ms `bigfuzzy_not_utf8.t` outlier).

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
