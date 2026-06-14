; textobjects.scm — for nvim-treesitter-textobjects
; standard @*.outer / @*.inner captures

; ---- functions: named subs, methods, and anonymous subs ----
(subroutine_declaration_statement
  body: (block) @function.inner) @function.outer

(method_declaration_statement
  body: (block) @function.inner) @function.outer

(anonymous_subroutine_expression
  body: (block) @function.inner) @function.outer

; ---- sub/method attributes ----
(attribute) @attribute.inner @attribute.outer

; ---- classes: packages, classes, and roles (block form) ----
(package_statement
  (block) @class.inner) @class.outer

(class_statement
  (block) @class.inner) @class.outer

(role_statement
  (block) @class.inner) @class.outer

; ---- parameters: signature params and call arguments ----
(signature
  (_) @parameter.inner @parameter.outer)

(function_call_expression
  arguments: (list_expression (_) @parameter.inner @parameter.outer))
(method_call_expression
  arguments: (list_expression (_) @parameter.inner @parameter.outer))
(ambiguous_function_call_expression
  arguments: (list_expression (_) @parameter.inner @parameter.outer))

; ---- conditionals: if / elsif / else ----
(conditional_statement
  block: (block) @conditional.inner) @conditional.outer
(elsif
  block: (block) @conditional.inner) @conditional.outer
(else
  block: (block) @conditional.inner) @conditional.outer

; ---- loops: while/until, foreach, and C-style for ----
(loop_statement
  block: (block) @loop.inner) @loop.outer
(for_statement
  block: (block) @loop.inner) @loop.outer
(cstyle_for_statement
  block: (block) @loop.inner) @loop.outer

; ---- calls (outer always matches; inner is the argument list when present) ----
(function_call_expression) @call.outer
(method_call_expression) @call.outer
(ambiguous_function_call_expression) @call.outer
(coderef_call_expression) @call.outer

(function_call_expression
  arguments: (list_expression) @call.inner)
(method_call_expression
  arguments: (list_expression) @call.inner)
(ambiguous_function_call_expression
  arguments: (list_expression) @call.inner)

; ---- assignments ----
(assignment_expression
  left: (_) @assignment.lhs
  right: (_) @assignment.inner @assignment.rhs) @assignment.outer

; ---- returns ----
(return_expression) @return.outer
(return_expression
  (_) @return.inner)

; ---- blocks, comments, regexes ----
(block) @block.outer
(comment) @comment.outer
(quoted_regexp) @regex.outer
(match_regexp) @regex.outer
