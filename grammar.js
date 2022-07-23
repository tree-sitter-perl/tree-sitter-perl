module.exports = grammar({
  name: 'perl',
  rules: {
    source_file: $ => repeat(
      choice(
        $.comment
      )
    ),
    comment: $ => token(/#.*/)
  }
})
