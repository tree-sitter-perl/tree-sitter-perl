import primitives from './lib/primitives.js'
import operators from './lib/operators.js'

export default grammar({
  name: 'perl',
  supertypes: $ => [
    $.statement,
    $.expression,
    $.primitive
  ],
  precedences: [
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
      $.primitive
    ),
    ...primitives
  }
})
