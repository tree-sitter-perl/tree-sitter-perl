const primitives = require('./lib/primitives.js')
const operators = require('./lib/operators.js')

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.statement,
    $.expression,
    $.primitive
  ],
  precedences: $ => [
    operators.precedenceLevels
    // TODO - implement precendence from
    // https://perldoc.perl.org/perlop#Operator-Precedence-and-Associativity
    // syntax is array of arrays, where each one is a partial precendence list, for
    // resolving conflicts w/in their own class
  ],
  rules: {
    source_file: $ => repeat(
      choice(
        $.comment,
        $.statement
      )
    ),
    comment: $ => token(/#.*/),
    statement: $ => choice(
      $.expression_statement
    ),
    expression_statement: $ => seq($.expression, ';'),
    expression: $ => choice(
      $.primitive,
      $.binary_expression,
      $.unary_expression,
    ),
    ...primitives,
    binary_expression: $ => choice(...operators.binops($)),
    unary_expression: $ => choice(...operators.unops($))
  }
})
