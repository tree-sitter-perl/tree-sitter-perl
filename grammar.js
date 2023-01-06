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
      /* TODO: for */
      seq($.expression_statement, ';'),
      seq(';'),
    ),
    if_statement: $ =>
      seq('if', '(', field('condition', $.expression), ')',
        field('block', $.block),
        optional($._else)
      ),
    unless_statement: $ =>
      seq('unless', '(', field('condition', $.expression), ')',
        field('block', $.block),
        optional($._else)
      ),
    while_statement: $ =>
      seq('while', '(', field('condition', $.expression), ')',
        field('block', $.block),
      ),
    until_statement: $ =>
      seq('until', '(', field('condition', $.expression), ')',
        field('block', $.block),
      ),

    // perly.y calls this `sideff`
    expression_statement: $ => choice(
      $.expression,
      $.postfix_if_expression,
      $.postfix_unless_expression,
      $.postfix_while_expression,
      $.postfix_until_expression,
      $.postfix_for_expression,
    ),
    postfix_if_expression:     $ => seq($.expression, 'if',     field('condition', $.expression)),
    postfix_unless_expression: $ => seq($.expression, 'unless', field('condition', $.expression)),
    postfix_while_expression:  $ => seq($.expression, 'while',  field('condition', $.expression)),
    postfix_until_expression:  $ => seq($.expression, 'until',  field('condition', $.expression)),
    postfix_for_expression:    $ => seq($.expression, $._for,   field('list', $.expression)),

    _else: $ => choice($.else, $.elsif),
    else: $ => seq('else', field('block', $.block)),
    elsif: $ =>
      seq('elsif', '(', field('condition', $.expression), ')',
        field('block', $.block),
        optional($._else)
      ),

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
