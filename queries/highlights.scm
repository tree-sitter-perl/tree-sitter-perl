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
(interpolated_string_literal) @string
(quoted_word_list) @string
[(escape_sequence) (escaped_delimiter)] @string.special

[(scalar) (array) (hash)] @variable
(scalar_deref_expression ["->" "$" "*"] @variable)
(array_deref_expression ["->" "@" "*"] @variable)
(hash_deref_expression ["->" "%" "*"] @variable)
(array_element_expression [array:(_) "->" "[" "]"] @variable)
(hash_element_expression [hash:(_) "->" "{" "}"] @variable)

(use_statement (package) @type)
(package_statement (package) @type)
(require_expression (bareword) @type)

(goto_expression (bareword) @label)
(loopex_expression (bareword) @label)

(statement_label label: (bareword) @label)
