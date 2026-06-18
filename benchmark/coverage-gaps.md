# Known coverage gaps

Constructs the grammar does not yet handle, surfaced by running it over the
real-world corpus (see `README.md`). A living checklist — tick items as they
land, and re-run the triage to refresh counts.

Counts are approximate, from the triage of the broad corpus. They drift as
fixes land; to refresh, re-run `benchmark/run.sh`, then re-triage the
`last-ours.fail` set (extract each file's first ERROR/MISSING node + construct,
cluster by root cause).

Current standing: broad **126 / 8,334** fail (98.5%), gold **4 / 3,386** (99.9%).

## Open clusters (grammar additions)

- [ ] **`:prototype()` + sub-prototype sigils** (~11) — `sub f :prototype($$){}`,
      `sub rad2deg ($;$)`. Prototype sigils (`$ ; \ & * +`) are parsed as a
      signature; need a real prototype form + the `:prototype(...)` attribute.
- [ ] **Test2 bareword-block builders** (~6) — `hash { … }`, `array { }`,
      `field x => hash {…}`, bare `etc`. Generic bareword-takes-block-then-list.
- [ ] **`x`-repeat glued to its count** (~4) — `$notcomp x10`, `${$x x2}`. There's
      already an `_x_op` scanner token; extend it.
- [ ] **v-strings with `_`** (~4) — `v1.2.3_0`, `v1.2_3`. Allow underscores
      between version parts (plain `v1.2.3` already works).
- [ ] **`continue { }` block** (~4) — `…} continue {…}` after a loop/bare block.
      Today only the MISSING-`;` recovery fires; make it a real node.
- [ ] **hex float literals** (~3) — `0x1p60`, `0x0.b17217f7d1cf78p0`.
- [ ] **comma-before-`=>` in anon-hash** (~3) — `{ '-and', => [...] }`. Overlaps
      the fat-comma autoquote work.
- [ ] **apostrophe package separator** (~3) — `$main'a`, `sub CORE'print'foo`
      (old `'` as `::`).
- [ ] **given/when/default** (~2) — `given(){ when(){} }`. Shape-1 recovery only.

## Gold-corpus singletons (the stubborn 4)

- [ ] **C** — `s/ … /x` multiline substitution (Date::Format::Generic).
- [ ] **E** — `return true() if /\Gtrue/gc` — `\G` match after a bareword (Mojo::JSON).
- [ ] **F** — `->()` deref-call deep in a nested ternary (DateTime).
- [ ] **H** — YAML::Tiny: an early construct errors the whole file ([0,0] wrapper).

## Long tail

~62 exotic one-file constructs (`$#[0]`, `@{-}` in regex, `0x_1234`, `&.`/`|.`
string-bitwise ops, `0o100` new octal, `CORE::my`, `my($x => $y)`, glob with
apostrophes, …). Low ROI individually.

## Not grammar bugs (excluded from the above)

- ~6 **intentional syntax-error test fixtures** (e.g. `DBICTest/SyntaxErrorComponent*.pm`,
  Mojo loader-exception fixtures). These *should* fail to parse.
(No timeouts: the entire corpus parses within the benchmark's per-file limit.
The slowest parse is ~2.2s on a 9.8 MB file (`unicore/TestProp.pl`); everything
else is well under 500ms. The grammar has no pathological slow-parse cases.)

## Recently addressed

class/role/method barewords · prefix `++`/`--` in parenless list-ops · phaser
labels · `our`/`state sub` · unicode package identifiers · `format … .` ·
`async { }` + `try(...)` · typed lexicals (`my Dog $spot`) · bare `eval`
(which is what the mis-clustered "`map {…} <READLINE>`" failures actually were).
