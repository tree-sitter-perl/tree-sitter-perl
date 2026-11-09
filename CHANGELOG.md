# Changelog

All notable changes to tree-sitter-perl are documented here. Versions are the
published package versions (npm `tree-sitter-perl`, crates.io
`ts-parser-perl`, PyPI). A release's section here is its GitHub release
notes. Releases before 2.0.0 are described on the
[GitHub releases page](https://github.com/tree-sitter-perl/tree-sitter-perl/releases).

## v2.0.5 — 2026-11-09

A fixes-only release: no node type, child or field was added or removed
since 2.0.4, so no query needs to change. These fixes come from parsing
every `.pl` and `.pm` file in about 30 large open-source repos (Linux,
OpenSSL, PostgreSQL, curl, Emacs, po4a and others). Each one either broke a
whole file or left MISSING nodes.

### Fixed: patterns and strings

- A `$` used as the pattern delimiter closes the pattern. In `m$...$`,
  `qr$...$` and `s$...$...$` the closing `$` was read as the start of a
  variable, so the pattern never ended; Linux's
  `scripts/get_maintainer.pl` parsed as one ERROR node. (#279)
- A sigil before `#` in a string or pattern stays literal. In `"a@#b"` or
  `/[~!@#%&*]/` the `#` was taken as a comment, which ate the rest of the
  line, closing quote and all. `#`-delimited quotes (`qq#a@#`,
  `s#a@#b#`) still close on their `#`. (#283)

### Fixed: statements and subs

- A label may stand right before a closing brace or the end of the file:
  `if ($x) { ...; DONE: }`. perl reads the `}` as an implied `;`, so the
  label marks an empty statement, the same tree as `DONE: ;`. (#280)
- `while () { ... }`, perl's infinite loop, parses as a `loop_statement`
  with no `condition` field, where it used to error with a MISSING
  condition. `until ()` stays an error, as in perl. (#281)
- A prototype may come before a sub's attributes:
  `sub f ($) :lvalue { ... }`, the order perl uses without the signatures
  feature. This works for named, forward-declared and anonymous subs.
  (#282)

### Fixed: highlighting

- An empty prototype, as in `sub test() { ... }`, is highlighted as
  punctuation. (#278)

Thanks to @gx089 for a contribution to this release.

## v2.0.4 — 2026-11-03

A fixes-only release: the node schema (node types and fields) is
byte-identical to 2.0.3, so no query needs to change.

### Fixed: interpolation

- A subscript inside a string quoted with the same bracket now parses as
  a subscript. In `qq{$h{k}}`, `qq[$a[0]]` and `qq{@h{qw(a b)}}` the
  scanner counted the subscript's opener as a nested delimiter of the
  string, so the subscript came out as plain string content. Other
  quotes (`"$o->g->{h}"`) parse as before. (#277)

## v2.0.3 — 2026-10-27

A fixes-only release: the node schema (node types and fields) is
byte-identical to 2.0.2, so no query needs to change.

### Fixed: interpolation

- A `->` that does not start a subscript after an interpolated element
  stays literal text. `"a $x->"` (arrow at the end of the string),
  `"$h{K}->Word"` and `qq($c{E}->new)` (arrow after a subscripted
  element) parsed as ERROR, and the ERROR swallowed the code around
  them. `"$x->\n"` also kept its escape sequence, which it used to lose.
  Found by parsing Znuny and Foswiki. (#276)

## v2.0.2 — 2026-10-26

A fixes-only release: the node schema (node types and fields) is
byte-identical to 2.0.1, so no query needs to change.

### Fixed: POD

- A line-initial `=` inside a string or quote-like is content, not POD.
  When a string's content started at column 0 (`print "\n` followed by a
  `====` or `=head1` line), `=letter` swallowed the rest of the file as
  POD and any other `=` ended in an ERROR. This hit every quote kind:
  `"..."`, `q{}`, `qw()`, backticks, `m{}x`, `s{}{}` and `tr{}{}`. Found
  by parsing Foswiki. (#275)

## v2.0.1 — 2026-10-26

A fixes-only release: the node schema (node types and fields) is
byte-identical to 2.0.0, so no query needs to change. Most of these fixes
stop one bad token from turning the rest of a file into ERROR. Many were
found by parsing OpenSSL's perl sources.

### Fixed: error blowups

- An unterminated quote no longer swallows the rest of the file. A quote
  opener without a closer anywhere before EOF is rejected, and the usual
  recovery limits the damage. (#264)
- A NUL byte is no longer treated as EOF in the scanner. Ending a string
  on a NUL used to dump error recovery into a quadratic slowdown: one
  0.9 ms parse took 622 ms. (#265)

### Fixed: calls

- `foo($h{x}, 1)` is a plain call again, not `foo` with indirect object
  `$h` and a `{x}` hashref. 2.0.0 regressed this common shape. perl
  rejects the indirect-object form for user subs (`myfunc($fh "x")`), so
  that reading never accepted valid code. (#267)

### Fixed: strings and regexes

- `\"` inside code interpolated into a `""` string now opens a nested
  string, as perl reads it: `"@{[ f($i, \"%rsp\") ]}"`. (#270)
- A lone `@` before an escape no longer eats the backslash, which closed
  the quote early: `"\"@\""`, `m/[@\/]/`, and the same in `tr///`.
  (#268)
- Braced regex escapes such as `\g{-1}`, `\k{name}`, `\p{L}` and
  `\N{U+41}` lex as one token, so their `}` no longer ends a `qr{...}`.
  Outside a regex, `\b`, `\B`, `\p`, `\P`, `\g` and `\k` don't take a
  braced argument: `"\b{foo}"` is a backspace followed by `{foo}`.
  (#269, #273)

### Fixed: autoquoting and punctuation variables

- `$h{-field}`, `$h{-my}`, `$h{-q}` and other `{-word}` keys autoquote as
  perl does, even when the word is a keyword, a quote-like, or starts
  with a filetest letter. `$h{-e $f}` is still a filetest, and so is
  `$h{-e<newline>}`, matching toke.c. (#271, #272)
- `${-}` names `$-`. Comments before the closing brace of a punctuation
  variable are skipped: `${- # why\n}`, `@{! #c\n}`. (#271, #272)

### Fixed: POD

- POD starts only on a line-initial `=` followed by a letter. Before this,
  a line starting with `=>`, `==`, `=~` or `= 5` was taken as POD. Some of
  those errored and some lost code without any error
  (`my $x\n= 5;`). (#272)
- A line-initial `=` that is a quote-like delimiter is no longer read as
  POD: `print q\n=head1 x=`, `s=a\n=b=`. (#272)

Thanks to Alexander Egorov (@aegoroff) and @davenonymous for contributions
to this release.

## v2.0.0 — 2026-09-06

Parentheses now have their own node, `parenthesized_expression`. That is a
breaking change to the node schema, hence the major bump -- but the audit
below found no shipped editor query that needs updating, and for most
consumers this release only fixes queries that were silently broken.

### Breaking

- `(EXPR)` in a term position now parses as `(parenthesized_expression
  (EXPR))` instead of splicing EXPR directly into its parent. 57 existing
  node types change their child/field sets as a result.

  A query naming a specific child *without* a field stops matching when
  that child is parenthesized:

      (map_grep_expression (list_expression))        no longer matches
      (map_grep_expression (parenthesized_expression (list_expression)))
      (map_grep_expression (_))                      still matches

  A `(_)` wildcard matches the wrapper itself, so its capture simply
  widens to span the parens.

- Queries matching the paren tokens of an *expression* must move to the
  wrapper:

      (binary_expression "(" @d)                     no longer matches
      (parenthesized_expression "(" @d ")" @d)

  A construct's *own* parens are unaffected: conditional_statement,
  loop_statement, function_call_expression, signature and stub_expression
  all keep their parens as direct children.

### Not affected

- Fielded patterns naming a specific child -- `left: (binary_expression)`,
  `condition: (lowprec_logical_expression)` -- missed on parenthesized
  operands in 1.x as well, so there is nothing to migrate. See Fixed.
- `list_expression` is retained. It still distinguishes `($a, $b)` from
  `($x)`, now one level in.
- Call and method `arguments:`, subscripts, blocks and anonymous
  array/hash brackets are all unchanged.
- Parser ABI is unchanged (15).

### Fixed

- Fields on parenthesized terms now resolve in the query engine at all.
  A field applied to an inlined rule (upstream tree-sitter#1526) survives
  into `tree-sitter parse` output but never reaches `query` -- so `parse`
  would print `left:` on a node that `query` could not match by that
  field. Every fielded term position was affected: binop `left:`/`right:`,
  unary `operand:`, ternary `condition:`, map/grep `list:`, and others.
  45 field positions in total stop yielding a bare `(` or `)`.
- `variable_declaration`: the `variables:` field was declared on a hidden
  rule wrapping `seq('(', body, ')')`, so it landed on the `(`, `,` and
  `)` tokens too. `my ($a, $b)` now yields `$a` and `$b`.
- `for my ($a, $b) (@list)`: the same shape in the for-initializer, fixed
  the same way.

### Downstream audit

Every `.scm` consumer of our node names found by code search was executed
against both a 1.2.1 and a 2.0.0 parser: nvim-treesitter,
nvim-treesitter-textobjects, helix, vim-matchup, rainbow-delimiters.nvim
and rhi-zone/normalize. None is in the breaking class. In particular
rainbow-delimiters' `(conditional_statement "(" ")")` matches identically
before and after, since those are the `if` header's own parens.

Our own textobjects.scm *gains* matches it was silently missing:
`assignment.rhs` on `my $y = ($a)` previously matched nothing at all.

### Packaging

- The npm package declared `peerDependencies: {"tree-sitter": "^0.22.0"}`
  while shipping an ABI 15 parser, which that runtime cannot load:
  node-tree-sitter 0.22.x vendors core ABI 14 (min compatible 13), and
  ABI 15 needs 0.25.0 or newer. Corrected to `>=0.25.0`. This can change
  resolution for npm consumers, and is part of why this release is major.
- `tree-sitter.json` metadata.version had never been bumped and reported
  1.0.0 through every release up to 1.2.1. It now tracks the real version.
