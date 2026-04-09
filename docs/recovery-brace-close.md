# RECOVER_BRACE_CLOSE — punted

## What it would do

`_RECOVER_BRACE_CLOSE` would close unclosed `{` in hash contexts
(anonymous_hash_expression, hash_element_expression, etc.) when the
scanner detects a statement keyword on a new line, similar to how
`_RECOVER_BRACKET_CLOSE` handles unclosed `[`.

## Why it was punted

Braces in Perl are deeply ambiguous: `{ }` can be a block, a hash
constructor, or a hash subscript. Adding `_RECOVER_BRACE_CLOSE` as
an alternative to `}` in hash contexts caused the parser to match
blocks (like `do { STMT; }` and bare `{ 1 }`) as anonymous hash
expressions closed by the recovery token.

The 2 test failures:
- `do { STMT; }` → parsed as `eval_expression(filename(anonymous_hash_expression(...)))`
- bare `{ 1 }` → parsed as `anonymous_hash_expression` instead of `block_statement`

## How to fix it (future)

The recovery token is in the externals array and scanner enum (slot
reserved) but not referenced in any grammar rule. To enable it:

1. Find a way to make `_RECOVER_BRACE_CLOSE` only match in hash contexts,
   not block contexts. This might require the scanner to track brace
   nesting and distinguish hash-`{` from block-`{`.

2. Or: use `_PERLY_BRACE_OPEN` (already an external token for hash
   disambiguation) as a signal — only emit `_RECOVER_BRACE_CLOSE` when
   the opening `{` was a `_PERLY_BRACE_OPEN` (hash), not a regular `{`
   (block).

3. Or: solve at the LSP layer with input preprocessing.
