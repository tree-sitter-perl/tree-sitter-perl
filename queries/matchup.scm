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

(loop_statement
  ["while" "unless"] @open.loop
  (block "}" @close.loop) .
  ) @scope.loop
(cstyle_for_statement
  ["for" "foreach"] @open.loop
  (block "}" @close.loop) .
  ) @scope.loop
(for_statement
  ["for" "foreach"] @open.loop
  (block "}" @close.loop) .
  ) @scope.loop
(loopex_expression) @mid.loop.1

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
  "'" @open.quotelike
  "'" @close.quotelike
  ) @scope.quotelike
