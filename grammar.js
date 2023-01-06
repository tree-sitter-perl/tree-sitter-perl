const primitives = require('./lib/primitives.js')
const operators = require('./lib/operators.js')

/* perl.y defines a `stmtseq` rule, which can match empty. tree-sitter does
 * not allow this normally, so we'll have to be slightly more complex about it
 */
const stmtseq = $ => repeat($._fullstmt);

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
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
    source_file: $ => stmtseq($),
    /****
     * Main grammar rules taken from perly.y.
     ****/
    block: $ => seq('{', stmtseq($), '}'),

    _fullstmt: $ => choice($._barestmt, /* TODO $._labfullstmt */),
    // TODO: labfullstmt

    _barestmt: $ => choice(
      /* TODO: sub */
      /* TODO: package */
      /* TODO: use-or-no */
      $.if_statement,
      $.unless_statement,
      /* TODO: given/when/default */
      $.while_statement,
      $.until_statement,
      /* TODO: C-style  for(_expr;_expr;_expr) {BLOCK} */
      $.for_statement,
      seq($.expression_statement, ';'),
      seq(';'),
    ),
    if_statement: $ =>
      seq('if', '(', field('condition', $._expr), ')',
        field('block', $.block),
        optional($._else)
      ),
    unless_statement: $ =>
      seq('unless', '(', field('condition', $._expr), ')',
        field('block', $.block),
        optional($._else)
      ),
    while_statement: $ =>
      seq('while', '(', field('condition', $._expr), ')',
        field('block', $.block),
      ),
    until_statement: $ =>
      seq('until', '(', field('condition', $._expr), ')',
        field('block', $.block),
      ),
    for_statement: $ =>
      seq($._for,
        optional(choice(
          seq('my', field('my_var', $.scalar_var)),
          field('var', $.scalar_var)
        )),
        '(', field('list', $._expr), ')',
        field('block', $.block),
      ),

    // perly.y calls this `sideff`
    expression_statement: $ => choice(
      $._expr,
      $.postfix_if_expression,
      $.postfix_unless_expression,
      $.postfix_while_expression,
      $.postfix_until_expression,
      $.postfix_for_expression,
    ),
    postfix_if_expression:     $ => seq($._expr, 'if',     field('condition', $._expr)),
    postfix_unless_expression: $ => seq($._expr, 'unless', field('condition', $._expr)),
    postfix_while_expression:  $ => seq($._expr, 'while',  field('condition', $._expr)),
    postfix_until_expression:  $ => seq($._expr, 'until',  field('condition', $._expr)),
    postfix_for_expression:    $ => seq($._expr, $._for,   field('list', $._expr)),

    _else: $ => choice($.else, $.elsif),
    else: $ => seq('else', field('block', $.block)),
    elsif: $ =>
      seq('elsif', '(', field('condition', $._expr), ')',
        field('block', $.block),
        optional($._else)
      ),

    _expr: $ => choice($.lowprec_logical_expression, $._listexpr),
    lowprec_logical_expression: $ => choice(
      prec.left(2, seq(field('left', $._expr), field('operator', 'and'), field('right', $._expr))),
      prec.left(1, seq(field('left', $._expr), field('operator', 'or'),  field('right', $._expr))),
    ),

    _listexpr: $ => choice(
      $.list_expression,
      $._term
    ),
    /* ensure that an entire list expression's contents appear in one big flat
    * list, while permitting multiple internal commas and an optional trailing one */
    list_expression: $ => seq($._term, ',', repeat(seq(optional($._term), ',')), optional($._term)),

    _term: $ => $.expression,

    /****
     * Misc bits
     */
    comment: $ => token(/#.*/),
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
    _identifier: $ => /[a-zA-Z_]\w*/,
    _for: $ => choice('for', 'foreach')
  }
})
