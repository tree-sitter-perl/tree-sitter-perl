const primitives = require('./lib/primitives.js')

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.statement,
    $.expression,
    $.primitive
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
    ...primitives,
  }
})
