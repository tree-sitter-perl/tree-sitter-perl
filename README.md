# tree-sitter-perl

A tree-sitter grammar for Perl. Maintained at https://github.com/tree-sitter-perl/tree-sitter-perl

## Installation

### Package managers

```bash
# npm
npm install tree-sitter-perl

# cargo
cargo add ts-parser-perl

# pip
pip install tree-sitter-perl
```

### Neovim

A version of this parser is part of the nvim-treesitter plugin.

To use a version that has not yet made it into nvim-treesitter:
```lua
local parser_config = require "nvim-treesitter.parsers".get_parser_configs()
parser_config.perl = {
  install_info = {
    url = 'https://github.com/tree-sitter-perl/tree-sitter-perl',
    revision = 'release',
    files = { "src/parser.c", "src/scanner.c" },
  }
}
```

Then `:TSInstall perl`. Copy the queries from the `queries` directory into
`queries/perl` somewhere in your `runtimepath`.

### Emacs

As of Emacs 29.1, if you have the tree-sitter library installed:

```emacs-lisp
(setq treesit-language-source-alist
  '((perl . ("https://github.com/tree-sitter-perl/tree-sitter-perl" "release"))))
(treesit-install-language-grammar 'perl)
```

### From source

Pre-built files are on the `release` branch. We don't store generated files on
master because the 18MB `parser.c` makes branch switching painful.

## Developing

### Prerequisites

Install the [tree-sitter CLI](https://tree-sitter.github.io/tree-sitter/creating-parsers#installation).
Node.js v20+ is needed for `tree-sitter generate` (the grammar uses advanced
regex features for unicode support).

### Building

```bash
tree-sitter generate   # generates src/parser.c from grammar.js
tree-sitter test       # runs the test corpus
cargo test             # runs the Rust binding tests
```

If you aren't changing `grammar.js`, you can generate from the checked-in
`src/grammar.json` with just the tree-sitter CLI (no Node needed):

```bash
tree-sitter generate src/grammar.json
```

### Releasing

Releases are cut by CI. Merging a version bump to `master` releases it.

```bash
script/schema-diff                 # what changed in the public node schema, and the bump it implies
script/bump-version 2.0.5          # syncs version across all four manifests
```

Then add a `## v2.0.5 — <date>` section to `CHANGELOG.md`, the release notes,
and open a pull request with both. When it merges, `release.yml` sees a
version with no tag, creates the `v2.0.5` tag and starts `publish.yml` on it,
which publishes to npm, crates.io, PyPI and GitHub with that CHANGELOG
section as the release body (`script/release-notes v2.0.5` previews it).

`script/bump-version --check` verifies every manifest agrees; CI runs it on
each pull request. `release.yml` adds `--release`, which also requires the
CHANGELOG section, so a bump without notes is never tagged. Pushing a tag by
hand still publishes it, through the same CHANGELOG section.

### Tests

Tests are in `test/corpus/`. Reference:
https://tree-sitter.github.io/tree-sitter/creating-parsers#command-test

### Contributing

Pull requests welcome! The grammar is in `grammar.js`. For subtle points,
please leave comments — the extra bytes go a long way.

### Supporting scripts

`unicode_ranges.pl` generates unicode ranges for the C and JS sides of the
parser. Dependencies are in the `cpanfile`. Only needed if working on unicode
identifiers.
