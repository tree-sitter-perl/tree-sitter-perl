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
  PREINC: 23, POSTINC: 23,
  ARROW: 24,
  PAREN: 25,
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

const optseq = (...terms) => optional(seq(...terms));

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.primitive
  ],
  externals: $ => [
    /* ident-alikes */
    $._q_string_begin,
    $._qq_string_begin,
    $._qw_list_begin,
    /* non-ident tokens */
    $._PERLY_SEMICOLON,
    /* immediates */
    $._quotelike_end,
    $._q_string_content,
    $._qq_string_content,
    $._qw_list_content,
    $.escape_sequence,
    $.escaped_delimiter,
  ],
  extras: $ => [
    /\s|\\\r?\n/,
    $.comment,
  ],
  conflicts: $ => [
    [ $.preinc_expression, $.postinc_expression ],
  ],
  rules: {
    source_file: $ => stmtseq($),
    /****
     * Main grammar rules taken from perly.y.
     ****/
    block: $ => seq('{', stmtseq($), '}'),

    _fullstmt: $ => choice($._barestmt, $.statement_label),

    // perly.y calls this labfullstmt
    statement_label: $ => seq(field('label', $.bareword), ':', field('statement', $._fullstmt)),

    _barestmt: $ => choice(
      /* TODO: sub */
      $.package_statement,
      $.use_version_statement,
      $.use_statement,
      $.if_statement,
      $.unless_statement,
      /* TODO: given/when/default */
      $.while_statement,
      $.until_statement,
      $.cstyle_for_statement,
      $.for_statement,
      seq($.expression_statement, $._PERLY_SEMICOLON),
      ';', // this is not _PERLY_SEMICOLON so as not to generate an infinite stream of them
    ),
    package_statement: $ => choice(
      seq('package', field('name', $.package), optional(field('version', $._version)), $._PERLY_SEMICOLON),
      seq('package', field('name', $.package), optional(field('version', $._version)), $.block),
    ),
    use_version_statement: $ => seq($._KW_USE, field('version', $._version), $._PERLY_SEMICOLON),
    use_statement: $ => seq(
      $._KW_USE,
      field('module', $.package),
      optional(field('version', $._version)),
      optional($._listexpr),
      $._PERLY_SEMICOLON
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
    cstyle_for_statement: $ =>
      seq($._KW_FOR,
        '(',
          field('initialiser', optional($._expr)), ';',
          field('condition',   optional($._expr)), ';',
          field('iterator',    optional($._expr)),
        ')',
        $.block
      ),
    for_statement: $ =>
      seq($._KW_FOR,
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
    postfix_for_expression:    $ => seq($._expr, $._KW_FOR, field('list', $._expr)),

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
    list_expression: $ => seq(
      $._term, $._PERLY_COMMA, repeat(seq(optional($._term), $._PERLY_COMMA)), optional($._term)
    ),

    _subscripted: $ => choice(
      /* TODO:
       * gelem { expr ; }
       */
      $.array_element_expression,
      $.hash_element_expression,
      /* term -> ( )
       * term -> ( expr )
       * subscripted -> ( )
       * subscripted -> ( expr )
       */
      $.slice_expression,
    ),

    array_element_expression: $ => choice(
      // perly.y matches scalar '[' expr ']' here but that would yield a scalar var node
      seq(field('array', $.container_variable),    '[', field('index', $._expr), ']'),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '[', field('index', $._expr), ']')),
      seq($._subscripted,                          '[', field('index', $._expr), ']'),
    ),
    hash_element_expression: $ => choice(
      // perly.y matches scalar '{' expr '}' here but that would yield a scalar var node
      seq(field('hash', $.container_variable),     '{', field('key', $._expr), '}'),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '{', field('key', $._expr), '}')),
      seq($._subscripted,                          '{', field('key', $._expr), '}'),
    ),
    slice_expression: $ => choice(
      seq('(', optional(field('list', $._expr)), ')', '[', $._expr, ']'),
      seq(field('list', $.quoted_word_list), '[', $._expr, ']'),
    ),
    // this needs to be a named node so highlights.scm can capture it
    container_variable: $ => seq('$', $._indirob),

    _term: $ => choice(
      $.assignment_expression,
      $.binary_expression,
      $.equality_expression,
      $.relational_expression,
      $.unary_expression,
      $.preinc_expression,
      $.postinc_expression,
      $.anonymous_array_expression,
      $.anonymous_hash_expression,
      /* TODO:
       * anonymous sub
       */
      $.do_expression,
      $.conditional_expression,
      $.refgen_expression,
      /* KW_LOCAL
       */
      seq('(', $._expr, ')'),
      $.quoted_word_list,
      $.stub_expression,
      $.scalar,
      $.glob,
      $.hash,
      $.array,
      $.arraylen,
      $._subscripted,
      /* sliceme '[' expr ']'
       * kvslice '[' expr ']'
       * sliceme '{' expr '}'
       * kvslice '{' expr '}'
       * THING
       * amper
       * amper '(' ')'
       * amper '(' expr ')'
       * NOAMP -- wtf even is this thing?
       */
      $.scalar_deref_expression,
      $.array_deref_expression,
      $.hash_deref_expression,
      $.amper_deref_expression,
      $.glob_deref_expression,
      $.loopex_expression,
      $.goto_expression,
      $.undef_expression,
      /* NOTOP listexpr
       * UNIOP
       * UNIOP block
       * UNIOP term
       */
      $.require_expression,
      /* UNIOPSUB
       * UNIOPSUB term
       * FUNC0
       * FUNC0 '(' ')'
       * FUNC0OP
       * FUNC0OP '(' ')'
       * FUNC1 '(' ')'
       * FUNC1 '(' expr ')'
       * PMFUNC
       */
      $.bareword,
      $._listop,

      /* perly.y doesn't know about `my` because that is handled weirdly in
       * toke.c but we'll have to do it differently here
       */
      $.variable_declaration,

      // legacy
      $.primitive,

      $._literal,
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
    ),

    // perl.y calls this `termeqop`
    equality_expression: $ =>
      prec.left(TERMPREC.CHEQOP, choice(
        seq($._term, $._CHEQOP, $._term), // TODO: chaining
        seq($._term, $._NCEQOP, $._term),
      )
    ),

    // perly.y calls this `termrelop`
    relational_expression: $ =>
      prec.left(TERMPREC.CHRELOP, choice(
        seq($._term, $._CHRELOP, $._term), // TODO: chaining
        seq($._term, $._NCRELOP, $._term),
      )
    ),

    // perly.y calls this `termunop`
    unary_expression: $ => choice(
      prec(TERMPREC.UMINUS, unop_pre('-', $._term)),
      prec(TERMPREC.UMINUS, unop_pre('+', $._term)),
      prec(TERMPREC.UMINUS, unop_pre('~', $._term)), // TODO: also ~. when enabled
      prec(TERMPREC.UMINUS, unop_pre('!', $._term)),
    ),
    preinc_expression: $ =>
      prec(TERMPREC.PREINC, unop_pre(choice('++', '--'), $._term)),
    postinc_expression: $ =>
      prec(TERMPREC.POSTINC, unop_post(choice('++', '--'), $._term)),

    conditional_expression: $ => prec.right(TERMPREC.QUESTION_MARK, seq(
      field('condition', $._term), '?', field('consequent', $._term), ':', field('alternative', $._term)
    )),

    refgen_expression: $ => seq($._REFGEN, $._term),

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

    variable_declaration: $ =>
      seq('my', choice(
        field('variable', $.scalar),
        field('variable', $.array),
        field('variable', $.hash),
        field('variables', $._paren_list_of_variables))),
    _variable: $ => choice($.scalar, $.array, $.hash, $.undef_expression),
    _paren_list_of_variables: $ =>
      seq('(', repeat(seq(optional($._variable), ',')), optional($._variable), ')'),

    stub_expression: $ => seq('(', ')'),

    scalar_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '$', '*')),
    array_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '@', '*')),
    hash_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '%', '*')),
    amper_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '&', '*')),
    glob_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '*', '*')),

    require_expression: $ =>
      prec.left(TERMPREC.REQUIRE, seq('require', optional($._term))),

    loopex_expression: $ =>
      prec.left(TERMPREC.LOOPEX, seq(field('loopex', $._LOOPEX), optional($._term))),
    goto_expression: $ =>
      prec.left(TERMPREC.LOOPEX, seq('goto', $._term)),

    /* Perl just considers `undef` like any other UNIOP but it's quite likely
     * that tree consumers and highlighters would want to handle it specially
     */
    undef_expression: $ => prec.left(TERMPREC.UNOP, seq('undef', optional($._term))),

    _listop: $ => choice(
      /* TODO:
       * LSTOP indirob listexpr
       * FUNC '(' indirob expr ')'
       */
      $.method_call_expression,
      /* METHCALL0 indirob optlistexpr
       * METHCALL indirb '(' optexpr ')'
       * LSTOP optlistexpr
       * LSTOPSUB block optlistexpr
       */
      $.function_call_expression,
    ),

    function_call_expression: $ =>
      seq(field('function', $.function), '(', optional(field('arguments', $._expr)), ')'),
    function: $ => $._FUNC,

    method_call_expression: $ => prec.left(TERMPREC.ARROW, seq(
      field('invocant', $._term),
      '->',
      field('method', $.method),
      optseq('(', optional(field('arguments', $._expr)), ')')
    )),
    method: $ => choice($._METHCALL0, $.scalar),

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

    bareword: $ => $._bareword,
    _bareword: $ => /[a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*/,  // TODO: unicode

    // TODO: These are rediculously complicated in toke.c
    _FUNC: $ => $._bareword,
    _METHCALL0: $ => $._bareword,

    /****
     * Token types defined by toke.c
     */
    _ASSIGNOP: $ => choice(
      '=', '**=',
      '+=', '-=', '.=',
      '*=', '/=', '%=', 'x=',
      '&=', '|=', '^=',
      // TODO: Also &.= |.= ^.= when enabled
      '<<=', '>>=',
      '&&=', '||=', '//=',
    ),
    _OROR_DORDOR: $ => choice('||', '\/\/'),
    _ANDAND: $ => '&&',
    _BITOROP: $ => '|', // TODO also |. when enabled
    _BITANDOP: $ => '&', // TODO: also &. when enabled
    _SHIFTOP: $ => choice('<<', '>>'),
    _ADDOP: $ => choice('+', '-', '.'),
    _MULOP: $ => choice('*', '/', '%', 'x'),
    _POWOP: $ => '**',
    _CHEQOP: $ => choice('==', '!=', 'eq', 'ne'),
    _CHRELOP: $ => choice('<', '<=', '>=', '>', 'lt', 'le', 'ge', 'gt'),
    _NCEQOP: $ => choice('<=>', 'cmp', '~~'),
    _NCRELOP: $ => choice('isa'),
    _REFGEN: $ => '\\',

    _PERLY_COMMA: $ => choice(',', '=>'),

    _KW_USE: $ => choice('use', 'no'),
    _KW_FOR: $ => choice('for', 'foreach'),
    _LOOPEX: $ => choice('last', 'next', 'redo'),

    /****
     * Misc bits
     */
    comment: $ => token(/#.*/),
    ...primitives,
    _identifier: $ => /[a-zA-Z_]\w*/,

    // toke.c calls this a THING and that is such a generic unhelpful word,
    // we'll call it this instead
    _literal: $ => choice(
      $.string_literal,
      $.interpolated_string_literal,
    ),

    string_literal: $ => choice($._q_string),
    _q_string: $ => seq(
      $._q_string_begin,
      repeat(choice(
        $._q_string_content,
        $.escape_sequence,
        $.escaped_delimiter,
      )),
      $._quotelike_end
    ),
    interpolated_string_literal: $ => seq(
      $._qq_string_begin,
      repeat(choice(
        $._qq_string_content,
        $.escape_sequence,
        $.escaped_delimiter,

        /* interpolations */
        $.scalar,
        $.array,
        // TODO: $arr[123], $hash{key}, ${expr}, @{expr}, ...
      )),
      $._quotelike_end
    ),

    quoted_word_list: $ => seq(
      $._qw_list_begin,
      repeat(choice($._qw_list_content, $.escape_sequence, $.escaped_delimiter)),
      $._quotelike_end
    ),

    package: $ => $._bareword,
    _version: $ => prec(1, choice($.number, $.version)),
    version: $ => /v[0-9]+(?:\.[0-9]+)*/,
  }
})
