const primitives = require('./lib/primitives.js')
const operators = require('./lib/operators.js')

/* perl.y defines a `stmtseq` rule, which can match empty. tree-sitter does
 * not allow this normally, so we'll have to be slightly more complex about it
 */
const stmtseq = $ => repeat($._fullstmt);

const binop = (op, term) =>
  seq(field('left', term), field('operator', op), field('right', term));

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
      prec.left(2, binop('and', $._expr)),
      prec.left(1, binop('or', $._expr)),
    ),

    _listexpr: $ => choice(
      $.list_expression,
      $._term
    ),
    /* ensure that an entire list expression's contents appear in one big flat
    * list, while permitting multiple internal commas and an optional trailing one */
    list_expression: $ => seq($._term, ',', repeat(seq(optional($._term), ',')), optional($._term)),

    _term: $ => choice(
      $.binary_expression,
      /* TODO:
       * termunop
       * anonymous
       * termdo
       * term '?' term ':' term
       * REFGEN term
       * KW_LOCAL
       * '(' expr ')'
       * QWLIST
       * '(' ')'
       * scalar
       * star
       * hash
       * array
       * arraylen
       * subscripted
       * sliceme '[' expr ']'
       * kvslice '[' expr ']'
       * sliceme '{' expr '}'
       * kvslice '{' expr '}'
       * THING
       * amper
       * amper '(' ')'
       * amper '(' expr ')'
       * NOAMP -- wtf even is this thing?
       * term '->' '$' '*'
       * term '->' '@' '*'
       * term '->' '%' '*'
       * term '->' '&' '*'
       * term '->' '*' '*'
       * LOOPEX (term?)
       * NOTOP listexpr
       * UNIOP
       * UNIOP block
       * UNIOP term
       * KW_REQUIRE
       * KW_REQUIRE term
       * UNIOPSUB
       * UNIOPSUB term
       * FUNC0
       * FUNC0 '(' ')'
       * FUNC0OP
       * FUNC0OP '(' ')'
       * FUNC1 '(' ')'
       * FUNC1 '(' expr ')'
       * PMFUNC
       * BAREWORD
       * listop
       */

      // legacy
      $.expression,
    ),

    // perly.y calls this `termbinop`
    binary_expression: $ => choice(
      // prec.right(1, ASSIGNOP,
      // prec(2, DOTDOT,
      prec.left(3, binop($._OROR_DORDOR, $._term)),
      prec.left(4, binop($._ANDAND, $._term)),
      prec.left(5, binop($._BITOROP, $._term)),
      prec.left(6, binop($._BITANDOP, $._term)),
      prec.left(7, binop($._SHIFTOP, $._term)),
      prec.left(8, binop($._ADDOP, $._term)),
      prec.left(9, binop($._MULOP, $._term)),
      // prec.left(10, MATCHOP,
      prec.right(11, binop($._POWOP, $._term)),
      /* TODO: termrelop, termeqop */
    ),

    /****
     * Token types defined by toke.c
     */
    _OROR_DORDOR: $ => choice('||', '//'),
    _ANDAND: $ => '&&',
    _BITOROP: $ => '|', // TODO also |. when enabled
    _BITANDOP: $ => '&', // TODO: also &. when enabled
    _SHIFTOP: $ => choice('<<', '>>'),
    _ADDOP: $ => choice('+', '-', '.'),
    _MULOP: $ => choice('*', '/', '%', 'x'),
    _POWOP: $ => '**',

    /****
     * Misc bits
     */
    comment: $ => token(/#.*/),
    expression: $ => choice(
      $.primitive,
      $.unary_expression,
      $._variable,
    ),
    ...primitives,
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
