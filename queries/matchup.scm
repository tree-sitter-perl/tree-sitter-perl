(conditional_statement
    ["if" "unless"] @open.if
    "elsif"? @mid.if.1
    "else"? @mid.if.2
    (block "}" @close.if) .
) @scope.if

(conditional_expression
  "?" @open.ternary
  ":" @mid.ternary.1
  ) @scope.ternary

(subroutine_declaration_statement
    "sub" @open.fun
    (block "}" @close.fun) .
) @scope.fun
(anonymous_subroutine_expression
    "sub" @open.fun
    (block "}" @close.fun) .
) @scope.fun
(return_expression "return" @mid.fun.1)

(_
  (quotelike_begin) @open.quotelike
  (quotelike_end) @close.quotelike
  ) @scope.quotelike
