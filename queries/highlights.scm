[
  "use" "no"
  "package"
  "if" "elsif" "else" "unless"
  "while" "until"
  "for" "foreach"
  "do"
  "my"
  "require"
  "last" "next" "redo" "goto"
] @keyword

[
  "or" "and"
  "eq" "ne" "cmp" "lt" "le" "ge" "gt"
  "isa"
] @operator

(comment) @comment

(number) @number
(version) @number

(string_literal) @string
(escape_sequence) @string.special

[(scalar) (array) (hash)] @variable
(scalar_deref_expression ["->" "$" "*"] @variable)
(array_deref_expression ["->" "@" "*"] @variable)
(hash_deref_expression ["->" "%" "*"] @variable)

(use_statement (package) @type)
(package_statement (package) @type)
(require_expression (bareword) @type)
