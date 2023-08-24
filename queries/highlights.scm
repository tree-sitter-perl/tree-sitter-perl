((source_file . (comment) @preproc)
  (#lua-match? @preproc "^#!/"))

[ "use" "no" "require" ] @include

[ "if" "elsif" "unless" "else" ] @conditional

(conditional_expression [ "?" ":" ] @conditional.ternary) 

[ "while" "until" "for" "foreach" ] @repeat

"return" @keyword.return

"sub" @keyword.function

[ "map" "grep" ] @function.builtin

[
  "package"
  "do"
  "my" "our" "local"
  "last" "next" "redo" "goto"
  "undef"
] @keyword

(_ operator: _ @operator)
(yadayada) @exception

(phaser_statement phase: _ @keyword.phaser)

[
  "or" "and"
  "eq" "ne" "cmp" "lt" "le" "ge" "gt"
  "isa"
] @keyword.operator

(eof_marker) @preproc
(data_section) @comment

(pod) @text

(number) @number
(version) @number

[
 (string_literal) 
 (interpolated_string_literal) 
 (quoted_word_list) 
 (command_string) 
] @string

[(heredoc_token) (command_heredoc_token)] @label
(heredoc_content) @string
(heredoc_end) @label

[(escape_sequence) (escaped_delimiter)] @string.escape

[(quoted_regexp) (match_regexp)] @string.regex

(autoquoted_bareword _?) @string.special

(hash_element_expression key: (bareword) @string.special)

(use_statement (package) @type)
(package_statement (package) @type)
(require_expression (bareword) @type)

(subroutine_declaration_statement name: (_) @function)
(attribute_name) @attribute
(attribute_value) @string

(goto_expression (label) @label)
(loopex_expression (label) @label)

(statement_label label: _ @label)

(relational_expression operator: "isa" right: (bareword) @type)

(function_call_expression (function) @function.call)
(method_call_expression (method) @method.call)
(method_call_expression invocant: (bareword) @type)

(func0op_call_expression function: _ @function.builtin)
(func1op_call_expression function: _ @function.builtin)

(function) @function

(ERROR) @error

[(scalar) (arraylen)] @variable.scalar
(scalar_deref_expression ["->" "$" "*"] @variable.scalar)
(array) @variable.array
(array_deref_expression ["->" "@" "*"] @variable.array)
(hash) @variable.hash
(hash_deref_expression ["->" "%" "*"] @variable.hash)

(array_element_expression [array:(_) "->" "[" "]"] @variable.array)
(slice_expression [array:(_) "->" "[" "]"] @variable.array)
(keyval_expression [array:(_) "->" "[" "]"] @variable.array)

(hash_element_expression [hash:(_) "->" "{" "}"] @variable.hash)
(slice_expression [hash:(_) "->" "[" "]"] @variable.hash)
(keyval_expression [hash:(_) "->" "[" "]"] @variable.hash)

(comment) @comment

(
  [ "=>" "," ";" "->" ] @punctuation.delimiter
  ; this helps patch over the difference between query precedence in TS + nvim
  (#set! "priority" 90)
)
