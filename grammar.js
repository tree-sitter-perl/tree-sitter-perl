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
  extras: $ => [
    /\s|\\\r?\n/,
    $.comment,
  ],
  rules: {
    source_file: $ => repeat(
      choice(
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
      $._variable,
    ),
    ...primitives,
    binary_expression: $ => choice(...operators.binops($)),
    unary_expression: $ => choice(...operators.unops($)),
    // TODO: These variables don't handle ${name} or ${^THING} yet
    _variable: $ => choice($.scalar_var, $.array_var, $.hash_var),
    scalar_var: $ => seq('$', /\s*/, $._identifier),
    array_var: $ => seq('@', /\s*/, $._identifier),
    hash_var: $ => seq('%', /\s*/, $._identifier),
    _identifier: $ => /[a-zA-Z_]\w*/
  }
})
