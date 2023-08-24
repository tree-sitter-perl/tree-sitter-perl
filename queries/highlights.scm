((source_file . (comment) @preproc)
  (#lua-match? @preproc "^#!/"))

[ "use" "no" "require" ] @include

[ "if" "elsif" "unless" "else" ] @conditional

(conditional_expression [ "?" ":" ] @conditional.ternary) 

[ "while" "until" "for" "foreach" ] @repeat

"return" @keyword.return

"sub" @keyword.function

[ "map" "grep" ] @function.builtin

"package" @include

[
  "do"
  "my" "our" "local"
  "last" "next" "redo" "goto"
  "undef"
] @keyword

(_ operator: _ @operator)
"\\" @operator

(yadayada) @exception

(phaser_statement phase: _ @keyword.phaser)

[ "[" "]" "{" "}" "(" ")" ] @punctuation.bracket

[
  "or" "and"
  "eq" "ne" "cmp" "lt" "le" "ge" "gt"
  "isa"
] @keyword.operator

(eof_marker) @preproc
(data_section) @comment

(pod) @text

[
  (number)
  (version)
] @number

[
  (string_literal) 
  (interpolated_string_literal) 
  (quoted_word_list) 
  (command_string) 
  (heredoc_content)
] @string

[
  (heredoc_token)
  (command_heredoc_token)
  (heredoc_end)
] @label

[(escape_sequence) (escaped_delimiter)] @string.escape

[  
 (quoted_regexp modifiers: _? @character.special)
 (match_regexp  modifiers: _? @character.special)
] @string.regex

(autoquoted_bareword _?) @string.special

(use_statement (package) @type)
(package_statement (package) @type)
(require_expression (bareword) @type)

(subroutine_declaration_statement name: (_) @function)
(attribute_name) @attribute
(attribute_value) @string

(label) @label

(statement_label label: _ @label)

(relational_expression operator: "isa" right: (bareword) @type)

(function_call_expression (function) @function.call)
(method_call_expression (method) @method.call)
(method_call_expression invocant: (bareword) @type)

(func0op_call_expression function: _ @function.builtin)
(func1op_call_expression function: _ @function.builtin)

(function) @function

(ERROR) @error

(_
  "{" @punctuation.special
  (varname)
  "}" @punctuation.special
)
; will dis werk?
(
  (_
    (varname) @variable.builtin.name
   ) @variable.builtin
  (#match? @variable.builtin.name "^((ENV|ARGV|INC|ARGVOUT|SIG|STDIN|STDOUT|STDERR)|[_+!@#$%^&*(){}<>;:'\"0-9-]|)$")
)

[(scalar) (arraylen)] @variable.scalar
(scalar_deref_expression [ "$" "*"] @variable.scalar)
(array) @variable.array
(array_deref_expression [ "@" "*"] @variable.array)
(hash) @variable.hash
(hash_deref_expression [ "%" "*"] @variable.hash)

(array_element_expression array:(_) @variable.array)
(slice_expression array:(_) @variable.array)
(keyval_expression array:(_) @variable.array)

(hash_element_expression hash:(_) @variable.hash)
(slice_expression hash:(_) @variable.hash)
(keyval_expression hash:(_) @variable.hash)

(comment) @comment

(
  [ "=>" "," ";" "->" ] @punctuation.delimiter
)
