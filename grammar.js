const primitives = require('./lib/primitives.js')

/* perl.y's precedence list */
const TERMPREC = {
  LOW: 0,
  LOOPEX: 1,
  OROP: 2,
  ANDOP: 3,
  LSTOP: 4,
  COMMA: 5,
  ASSIGNOP: 6,
  QUESTION_MARK: 7,
  DOTDOT: 8,
  OROR: 9,
  ANDAND: 10,
  BITOROP: 11,
  BITANDOP: 12,
  CHEQOP: 13,
  CHRELOP: 14,
  UNOP: 15,
  REQUIRE: 16,
  SHIFTOP: 17,
  ADDOP: 18,
  MULOP: 19,
  MATCHOP: 20,
  UMINUS: 21,
  POWOP: 22,
  ARROW: 23,
  PAREN: 24,
};

/* perl.y defines a `stmtseq` rule, which can match empty. tree-sitter does
 * not allow this normally, so we'll have to be slightly more complex about it
 */
const stmtseq = $ => repeat($._fullstmt);

const unop_pre = (op, term) =>
  seq(field('operator', op), field('operand', term));
const unop_post = (op, term) =>
  seq(field('operand', term), field('operator', op));

const binop = (op, term) =>
  seq(field('left', term), field('operator', op), field('right', term));

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.primitive
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
      $.use_version_statement,
      $.use_statement,
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
    use_version_statement: $ => seq($._KW_USE, field('version', $.version), ';'),
    use_statement: $ => seq($._KW_USE, field('module', $.package), optional($._listexpr), ';'),
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
          seq('my', field('my_var', $.scalar)),
          field('var', $.scalar)
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
      $.assignment_expression,
      $.binary_expression,
      $.unary_expression,
      $.anonymous_array_expression,
      $.anonymous_hash_expression,
      /* TODO:
       * anonymous sub
       */
      $.do_expression,
      $.conditional_expression,
      /* REFGEN term
       * KW_LOCAL
       */
      seq('(', $._expr, ')'),
      /* QWLIST
       * '(' ')'
       */
      $.scalar,
      $.glob,
      $.hash,
      $.array,
      $.arraylen,
      /* subscripted
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
      $.primitive,
    ),

    assignment_expression: $ =>
      prec.right(TERMPREC.ASSIGNOP, binop($._ASSIGNOP, $._term)),

    // perly.y calls this `termbinop`
    binary_expression: $ => choice(
      // prec(2, DOTDOT,
      prec.left(TERMPREC.OROR,     binop($._OROR_DORDOR, $._term)),
      prec.left(TERMPREC.ANDAND,   binop($._ANDAND, $._term)),
      prec.left(TERMPREC.BITOROP,  binop($._BITOROP, $._term)),
      prec.left(TERMPREC.BITANDOP, binop($._BITANDOP, $._term)),
      prec.left(TERMPREC.SHIFTOP,  binop($._SHIFTOP, $._term)),
      prec.left(TERMPREC.ADDOP,    binop($._ADDOP, $._term)),
      prec.left(TERMPREC.MULOP,    binop($._MULOP, $._term)),
      // prec.left(10, MATCHOP,
      prec.right(TERMPREC.POWOP,   binop($._POWOP, $._term)),
      /* TODO: termrelop, termeqop */
    ),

    // perly.y calls this `termunop`
    unary_expression: $ => choice(
      unop_pre('-', $._term),
      unop_pre('+', $._term),
      unop_pre('~', $._term), // TODO: also ~. when enabled
      unop_pre('!', $._term),
      // TODO: prefix and postfix ++ and --
    ),

    conditional_expression: $ => prec.right(TERMPREC.QUESTION_MARK, seq(
      field('condition', $._term), '?', field('consequent', $._term), ':', field('alternative', $._term)
    )),

    anonymous_array_expression: $ => seq(
      '[', optional($._expr), ']'
    ),

    anonymous_hash_expression: $ => seq(
      '{', optional($._expr), '}'
    ),

    do_expression: $ => choice(
      /* TODO: do FILENAME */
      seq('do', $.block),
    ),

    scalar:   $ => seq('$',  $._indirob),
    array:    $ => seq('@',  $._indirob),
    hash:     $ => seq('%',  $._indirob),
    arraylen: $ => seq('$#', $._indirob),
    // perly.y calls this `star`
    glob:     $ => seq('*',  $._indirob),

    _indirob: $ => choice(
      $._bareword,
      $.scalar,
      $.block,
      /* TODO: privateref */
    ),

    _bareword: $ => /[a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*/,  // TODO: unicode

    /****
     * Token types defined by toke.c
     */
    _ASSIGNOP: $ => choice('='), // TODO: +=, -=, etc...
    _OROR_DORDOR: $ => choice('||', '//'),
    _ANDAND: $ => '&&',
    _BITOROP: $ => '|', // TODO also |. when enabled
    _BITANDOP: $ => '&', // TODO: also &. when enabled
    _SHIFTOP: $ => choice('<<', '>>'),
    _ADDOP: $ => choice('+', '-', '.'),
    _MULOP: $ => choice('*', '/', '%', 'x'),
    _POWOP: $ => '**',

    _KW_USE: $ => choice('use', 'no'),

    /****
     * Misc bits
     */
    comment: $ => token(/#.*/),
    ...primitives,
    _identifier: $ => /[a-zA-Z_]\w*/,

    _for: $ => choice('for', 'foreach'),

    package: $ => $._bareword,
    version: $ => /v[0-9]+(?:\.[0-9]+)*/,
  }
})
