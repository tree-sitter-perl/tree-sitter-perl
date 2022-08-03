import primitives from './lib/primitives.js'

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.statement,
    $.expression,
    $.primitive
  ],
  precedences: [
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
