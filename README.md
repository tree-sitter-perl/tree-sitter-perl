# tree-sitter-perl

A tree-sitter grammar for Perl. Maintained at https://github.com/tree-sitter-perl/tree-sitter-perl

## Installation

### Package managers

```bash
# npm
npm install tree-sitter-perl

# cargo
cargo add tree-sitter-perl

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

```bash
script/bump-version 0.2.0          # syncs version across package.json, Cargo.toml, pyproject.toml
git add -A && git commit -m 'chore: bump version to 0.2.0'
git tag v0.2.0
git push origin master v0.2.0      # tag push triggers publish to npm, crates.io, PyPI, GitHub
```

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
