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
    primitive: $ => choice(
      $.number
    ),
    number: $ => {
      const hex_literal = seq(
        choice('0x', '0X'),
        /[\da-fA-F](_?[\da-fA-F])*/
      )

      const decimal_digits = /\d(_?\d)*/
      const exponent_part = seq(choice('e', 'E'), optional(choice('-', '+')), decimal_digits)

      const binary_literal = seq(choice('0b', '0B'), /[0-1](_?[0-1])*/)

      const octal_literal = seq('0', /[0-7](_?[0-7])*/)

      const decimal_integer_literal = choice(
        '0',
        seq(/[1-9]/, optional(seq(optional('_'), decimal_digits)))
      )

      const decimal_literal = choice(
        // 111.555e99
        seq(decimal_integer_literal, '.', optional(decimal_digits), optional(exponent_part)),
        // .555e99
        seq('.', decimal_digits, optional(exponent_part)),
        // 111e99
        seq(decimal_integer_literal, exponent_part),
        // 111
        seq(decimal_digits),
      )

      return token(choice(
        decimal_literal,
        hex_literal,
        binary_literal,
        octal_literal
      ))
    }
  }
})
