module.exports = grammar({
  name: 'perl',
  rules: {
    source_file: $ => repeat(
      choice(
        $._statement,
        $._declaration
      )
    ),
    _statement: $ => seq(
      repeat($._expression),
      optional($.postfix_modifier)
      ';'
    )
    _declaration: $ => choice(
      sub_declaration: $ => seq(
        'sub',
        $.identifier,
        optional(
          choice(
            seq($.sub_prototype, repeat($.sub_attribute)),
            seq(repeat($.sub_attribute), $.sub_signature)
          )
        ),
        $.code_block
      ),
      phaser_declaration: $ => seq(
        choice('BEGIN', 'CHECK', 'END', 'INIT', 'UNITCHECK'),
        $.code_block
      )
    ),
    sub_prototype: $ => seq(
      '(',
      repeat(
        choice(
          // I think this is correct?
          /[\\$+@%&*;]/,
          seq('\[', /[$@%&*]+/, ']')
        )
      ),
      ')'
    ),
    code_block: $ => seq('{', repeat($._statement), '}')
  }
})
