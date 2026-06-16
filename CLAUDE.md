# CLAUDE.md

Working notes for developing this grammar. Perl is famously context-sensitive
("only `perl` can parse Perl"), so a lot of the real work lives in the external
scanner, and there are several homegrown tricks worth knowing before you touch
things.

## Toolchain / local dev

- **Use `./tree-sitter`** instead of the tree-sitter CLI. it handles scoping your commands
  correctly via TREE_SITTER_LIBDIR so as not to poison the build cache for anyone working
  in a parallel worktree
- Regenerate + test: `./tree-sitter generate && ./tree-sitter test`.
- **Scanner-recompile gotcha:** `./tree-sitter parse`/`test` do **not** reliably
  recompile the external scanner when only `src/scanner.c` changes (they check
  `grammar.js`/`parser.c` freshness, not `scanner.c`). Pass `-r`/`--rebuild` to
  force it, or you'll chase ghosts from a stale cache (check the `./tree-sitter` script
  for the location)
- **Debugging block-vs-hash & other ambiguity with `parse -d`:** when a
  construct errors and you can't tell *why* the parser chose the branch it did,
  dump the GLR trace: `./tree-sitter parse -d normal FILE` (values: `quiet`,
  `normal`, `pretty`; `-D` writes a `log.html` graph). The decisive signal is
  **`process version:N`** lines — a second `version` appearing means GLR
  *forked* into parallel stacks; if you only ever see `version:0`, the parser
  committed to a single reading and there's no competing parse to win. That's
  how the `bless({…})`-vs-hashref bug was cracked: `foo({%$arg})` forked at
  `reduce sym:function` (so a hashref stack survived) while `bless(` never
  forked, leaving only the block-indirob stack to error-recover. Grep the trace
  for `reduce sym:`, `detect_error`, `recover`, `process version` and strip the
  noisy `[row,col]` spans. Pairs well with a `perl -ce '…'` oracle to confirm
  whether the input is even valid Perl before chasing a "bug."

## Parser size

- The meaningful size/complexity metric is **`LARGE_STATE_COUNT`** (and
  `STATE_COUNT`) at the top of `src/parser.c` — *not* `parser.c` byte size, which
  is dominated by large embedded unicode tables. Large states each carry a full
  lookahead-table row; small states use a compact representation, so
  `LARGE_STATE_COUNT` is what drives table size.
- Per-rule breakdown: `./tree-sitter generate --report-states-for-rule -`. Caveat:
  those per-rule counts are *overlapping participation* counts (rules sharing the
  same left-recursive machinery all "cost" similar large numbers), not separable
  piles. Only genuinely *duplicated structure* is worth factoring — and you factor
  it via `alias()` over a shared hidden rule so the emitted node names/fields stay
  identical.
- **`supertypes:` are schema-only.** They affect `node-types.json` (the public
  node taxonomy) but have **zero** effect on the parse table / state count. Don't
  reach for them as a size lever.

## Scanner overview (`src/scanner.c`)

The external scanner handles the lexing the LR grammar can't do context-free:
quote-likes, heredocs, regex/interpolation, readline/fileglob, and error recovery.
State is serialized/deserialized on every incremental edit — keep `serialize`
and `deserialize` in lockstep and within the buffer size, or incremental parsing
silently corrupts.

`LexerState` holds:

- **A quote stack** — `Array(TSPQuote)`, each `{open, close, count}`. Handles
  nested/paired quote-likes (`q()`, `qq{}`, `m[]`, `s{}{}`, …). `close_for_open`
  maps the four bracket pairs; `count` tracks nesting depth so balanced inner
  delimiters don't close the quote early. The stack is searched from the top so
  nested same-type quotes escape top-down.
  - Multi-part quotes (`s///`, `tr///`) use `_quotelike_middle` = close-first-part,
    then either `_quotelike_middle_skip` (non-paired delimiter: the one delimiter
    is reused) or `_quotelike_begin` (paired: the replacement opens a *fresh*,
    possibly different delimiter, and the finished first pair is popped off the
    stack so its closer can't leak into the replacement).
- **A FIFO heredoc queue** (cap 4) — multiple heredocs introduced on one line
  (`print <<A, <<B;`) are consumed in order, each entry carrying its own
  delimiter + interpolate + indent flags.

Other scanner responsibilities:

- **Readline vs. fileglob vs. less-than:** `<...>` after a term is intuited as a
  readline (`<FH>`, `<$fh>`, `<>`) or fileglob (`<*.c>`). Before committing to the
  fileglob token the scanner looks ahead for a closing `>` before a statement
  boundary; if there isn't one, it bails so a bare `<` lexes as the less-than
  operator (this is why `CONST < 0` works).
- **Error recovery:** synthetic close tokens (`_RECOVER_PAREN/BRACKET/BRACE_CLOSE`)
  let the scanner inject a missing closer when a statement keyword shows up on the
  next line, and it can insert semicolons — so an unterminated line still yields a
  usable tree instead of one giant ERROR.

## Homegrown grammar tricks (`grammar.js`)

- **`TERMPREC`** — an integer precedence ladder mirroring perl's `perly.y`. Each
  tier maps to a `prec`/`prec.left`/`prec.right` level. (this is strictly simpler than
  tree-sitter's builtin and supported partial ordering - we tried)
- **Non-associative operators** (`binop.nonassoc`): a zero-width external
  `_NONASSOC` followed by an `_ERROR` token forces tree-sitter down an error branch
  for illegal chains (e.g. `1 <=> 2 <=> 3`). The duplicated operator in the tail is
  load-bearing — don't "simplify" it away.
- **Recover-aware closers** (`recoverParen` / `recoverBracket` / `recoverBrace`):
  helper functions so every subscript/call site shares one grammar node (no extra
  states) and plugs into the scanner's recovery closers above.
- **Zero-width lookahead externals** (`_brace_end_zw`, `_dollar_ident_zw`,
  `_no_interp_whitespace_zw`, `_NONASSOC`): disambiguation markers that consume no
  input — e.g. `$hash{q}` (brace-end vs. a `q//` quote) and interpolation
  boundaries.
- **Autoquote tokens** (`_fat_comma_autoquoted`, `_brace_autoquoted`): barewords
  that auto-stringify before `=>` or inside hash subscripts.
- **List-op gobbling is forced statically, not GLR-arbitrated:** a parenless
  list-op consumes everything to its right (`return bless {}, $class` ≡
  `return bless({}, $class)`), i.e. at a comma the parser must *always*
  continue the innermost open list. This is encoded as `prec.right` on the
  `_term` production of `_listexpr`: in the equal-precedence shift/reduce
  against `_term_rightward`'s comma, a right-associative reduce means "prefer
  the shift", so the close-the-call-and-escape reading is never even forked.
  Which consumer owns the finished flat list is then deterministic — it
  reduces into whatever sits below it on the stack (the innermost list-taker).
  Two dead ends, both tried: (1) a `[$._listexpr, $._term_rightward]` GLR
  conflict + dynamic precedence can't arbitrate this — the competing readings
  have *identical node multisets* (the `list_expression` just lands elsewhere),
  per-position `prec.dynamic` rewards land only when the gobbling stack finally
  reduces at `;`, and under self-nested chains (`print join ",", print join
  ",", …` ≥4 deep) the version cap prunes the late-banking gobble stack before
  payday. (2) raising `_term_rightward` to `prec.right(1)` makes *completing*
  a list beat *continuing* its own repeat1, so lists close after their second
  element (stacked-heredoc tests catch it). The static fix removed that GLR
  conflict entirely: −300 large states, ~2× faster on comma-heavy input, zero
  stack versions spent, correct at any nesting depth.
- **State golfing via `alias()`:** the cheapest real state reductions come from
  factoring a repeated shape (subscript bodies `[..]`/`{..}`/`(..)`, the shared
  sub/method attribute+signature+body tail) into one hidden rule, then `alias()`-ing
  it back to each distinct output node name. This shares parser states while keeping
  every emitted node type/field byte-identical. The expression precedence tower and
  the postfix-deref cluster, by contrast, are already at their behavior-preserving
  floor — their large-state cost is intrinsic to Perl's precedence + the nonassoc
  trick.
