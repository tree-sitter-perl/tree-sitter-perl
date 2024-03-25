/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const primitives = require('./lib/primitives.js')
const unicode_ranges = require('./lib/unicode_ranges')

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
  PREINC: 23,
  POSTINC: 23,
  ARROW: 24,
  PAREN: 25,
}

const unop_pre = (op, term) =>
  seq(field('operator', op), field('operand', term))
const unop_post = (op, term) =>
  seq(field('operand', term), field('operator', op))

const binop = (op, term) =>
  seq(field('left', term), field('operator', op), field('right', term))

// nonassoc we can do by forcing tree-sitter down the continue branch via a
// zero-width external and following it w/ an error token
binop.nonassoc = ($, op, term) =>
  seq(
    field('left', term),
    field('operator', op),
    field('right', term),
    optseq(
      field('operator', op),
      $._NONASSOC,
      $._ERROR
    )
  )

regexpContent = ($, node) => 
  field('content', alias(node, $.regexp_content))

replacement = ($, node) => 
  alias(node, $.replacement)

trContent = ($, node) => 
  field('content', alias(node, $.transliteration_content))

/**
 *
 * @param {RuleOrLiteral[]} terms
 *
 */
const optseq = (...terms) => optional(seq(...terms))
const paren_list_of = rule =>
  seq('(', repeat(seq(optional(rule), ',')), optional(rule), ')')

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.primitive
  ],
  word: $ => $._identifier,
  inline: $ => [
    $._conditionals,
    $._loops,
    $._postfixables,
    $._keywords,
    $._quotelikes,
    $._func0op,
    $._func1op,
    $._map_grep,
    $._autoquotables,
    $._PERLY_COMMA,
    $._KW_USE,
    $._KW_FOR,
    $._LOOPEX,
    $._PHASE_NAME,
    $._HASH_PERCENT,
    $._bareword,
  ],
  externals: $ => [
    /* ident-alikes */
    /* non-ident tokens */
    $._apostrophe,
    $._double_quote,
    $._backtick,
    $._search_slash,
    $._PERLY_SEMICOLON,
    $._PERLY_HEREDOC,
    $._ctrl_z_hack,
    /* immediates */
    $._quotelike_begin,
    $._quotelike_middle_close,
    $._quotelike_middle_skip,
    $._quotelike_end_zw,
    $._quotelike_end,
    $._q_string_content,
    $._qq_string_content,
    $.escape_sequence,
    $.escaped_delimiter,
    $._dollar_in_regexp,
    $.pod,
    $._gobbled_content,
    $._attribute_value_begin,
    $.attribute_value,
    $.prototype_or_signature,
    $._heredoc_delimiter,
    $._command_heredoc_delimiter,
    $._heredoc_start,
    $._heredoc_middle,
    $.heredoc_end,
    /* zero-width lookahead tokens */
    $._fat_comma_zw,
    $._brace_end_zw,
    $._dollar_ident_zw,
    $._no_interp_whitespace_zw,
    /* zero-width high priority token */
    $._NONASSOC,
    /* error condition must always be last; we don't use this in the grammar */
    $._ERROR
  ],
  extras: $ => [
    /\p{White_Space}|\\\r?\n/,
    $.comment,
    $.pod,
    $.heredoc_content,
  ],
  conflicts: $ => [
    [$.preinc_expression, $.postinc_expression],
    // all of the following go GLR b/c they need extra tokens to allow postfixy autoquotes
    [$.return_expression],
    [$.conditional_statement],
    [$.elsif],
    [$._listexpr, $.list_expression, $._term_rightward],
    [$._term_rightward],
    [$.function, $.bareword],
    [$._term, $.indirect_object],
    [$.expression_statement, $._tricky_indirob_hashref],
    // these are all dynamic handling for continue BLOCK vs autoquoted
    [$.loop_statement],
    [$.cstyle_for_statement],
    [$.for_statement],
  ],
  rules: {
    source_file: $ => seq(repeat($._fullstmt), optional($.__DATA__)),
    /****
     * Main grammar rules taken from perly.y.
     ****/
    // NOTE - the plain token MUST come first, b/c TS will otherwise decide that the plain
    // old '{' is a non-usable token. Related to the issue from https://github.com/tree-sitter-perl/tree-sitter-perl/pull/110
    _HASHBRACK: $ => '{',
    _PERLY_BRACE_OPEN: $ => alias(token(prec(2, '{')), '{'),

    block: $ => seq($._PERLY_BRACE_OPEN, repeat($._fullstmt), '}'),

    _fullstmt: $ => choice($._barestmt, $.statement_label),

    // perly.y calls this labfullstmt
    statement_label: $ => seq(field('label', $.identifier), ':', field('statement', $._fullstmt)),
    _semicolon: $ => choice(';', $._PERLY_SEMICOLON),

    _barestmt: $ => choice(
      $.package_statement,
      $.class_statement,
      $.use_version_statement,
      $.use_statement,
      $.subroutine_declaration_statement,
      $.method_declaration_statement,
      $.phaser_statement,
      $.conditional_statement,
      /* TODO: given/when/default */
      $.loop_statement,
      $.cstyle_for_statement,
      $.for_statement,
      $.try_statement,
      alias($.block, $.block_statement),
      seq($.expression_statement, choice($._semicolon, $.__DATA__)),
      $.defer_statement,
      ';', // this is not _semicolon so as not to generate an infinite stream of them
    ),
    package_statement: $ => choice(
      seq('package', field('name', $.package), optional(field('version', $._version)), $._semicolon),
      seq('package', field('name', $.package), optional(field('version', $._version)), $.block),
    ),
    class_statement: $ => choice(
      seq('class',
        field('name', $.package),
        optional(field('version', $._version)), 
        optseq(':', optional(field('attributes', $.attrlist))),
        $._semicolon),
      seq('class',
        field('name', $.package),
        optional(field('version', $._version)),
        optseq(':', optional(field('attributes', $.attrlist))),
        $.block),
    ),
    use_version_statement: $ => seq($._KW_USE, field('version', $._version), $._semicolon),
    use_statement: $ => seq(
      $._KW_USE,
      field('module', $.package),
      optional(field('version', $._version)),
      optional($._listexpr),
      $._semicolon
    ),

    subroutine_declaration_statement: $ => seq(
      'sub',
      field('name', $.bareword),
      optseq(':', optional(field('attributes', $.attrlist))),
      optional($.prototype_or_signature),
      field('body', $.block),
    ),

    method_declaration_statement: $ => seq(
      'method',
      field('name', $.bareword),
      optseq(':', optional(field('attributes', $.attrlist))),
      optional($.prototype_or_signature),
      field('body', $.block),
    ),

    // perly.y's grammar just considers a phaser to be a `sub` with a special
    // name and lacking the `sub` keyword, but most tree consumers are likely
    // to care about distinguishing it
    phaser_statement: $ => seq(field('phase', $._PHASE_NAME), $.block),

    conditional_statement: $ =>
      seq($._conditionals, '(', field('condition', $._expr), ')',
        field('block', $.block),
        optional($._else)
      ),
    loop_statement: $ =>
      seq($._loops, '(', field('condition', $._expr), ')',
        field('block', $.block),
        optseq('continue', field('continue', $.block))
      ),
    cstyle_for_statement: $ =>
      seq($._KW_FOR,
        '(',
        field('initialiser', optional($._expr)), ';',
        field('condition', optional($._expr)), ';',
        field('iterator', optional($._expr)),
        ')',
        $.block,
        optseq('continue', field('continue', $.block))
      ),
    for_statement: $ =>
      seq($._KW_FOR,
        optional(choice(
          seq(optional(choice('my', 'state', 'our')), field('variable', $.scalar)),
          seq('my', field('variables', paren_list_of($.scalar))),
        )),
        '(', field('list', $._expr), ')',
        field('block', $.block),
        optseq('continue', field('continue', $.block))
      ),

    try_statement: $ => seq(
      'try',
      field('try_block', $.block),
      // regular perl only permits catch(VAR) but we get easy compatibility
      // with Syntax::Keyword::Try too by being a bit more flexible
      optseq('catch', optseq('(', field('catch_expr', $._expr), ')'),
        field('catch_block', $.block)),
      optseq('finally',
        field('finally_block', $.block)),
    ),

    defer_statement: $ => seq(
      'defer',
      field('block', $.block),
    ),

    // perly.y calls this `sideff`
    expression_statement: $ => choice(
      $._expr,
      $._postfix_expressions,
      $.yadayada,
    ),
    _postfix_expressions: $ => choice(
      $.postfix_conditional_expression,
      $.postfix_loop_expression,
      $.postfix_for_expression,
    ),
    postfix_conditional_expression: $ => seq($._expr, $._conditionals, field('condition', $._expr)),
    postfix_loop_expression: $ => seq($._expr, $._loops, field('condition', $._expr)),
    postfix_for_expression: $ => seq($._expr, $._KW_FOR, field('list', $._expr)),
    yadayada: $ => '...',

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
    _term_rightward: $ => prec.right(seq(
      $._term,
      repeat(seq($._PERLY_COMMA, optional($._term))),
      // NOTE - we need this here to create a conflict in order to go GLR to handle
      // `die 1, or => die` correctly
      optional(seq($._PERLY_COMMA))
    )),
    // NOTE - we gave this negative precedence b/c it's kinda just a fallback
    list_expression: $ => prec(-1, choice($._term, $._term_rightward)),

    _subscripted: $ => choice(
      /* TODO:
       * gelem { expr ; }
       */
      $.array_element_expression,
      $.hash_element_expression,
      $.coderef_call_expression,
      $.anonymous_slice_expression,
    ),

    // NOTE - we have container_variable as a named node so we can match against it nicely
    // for highlighting. We raise its prec b/c in a print (print $thing{stuff}) it becomes a var
    // not an indirob
    container_variable: $ => prec(2, seq('$', $._var_indirob)),
    array_element_expression: $ => choice(
      // perly.y matches scalar '[' expr ']' here but that would yield a scalar var node
      seq(field('array', $.container_variable), '[', field('index', $._expr), ']'),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '[', field('index', $._expr), ']')),
      seq($._subscripted, '[', field('index', $._expr), ']'),
    ),
    _hash_key: $ => choice($._brace_autoquoted, $._expr),
    hash_element_expression: $ => choice(
      // perly.y matches scalar '{' expr '}' here but that would yield a scalar var node
      seq(field('hash', $.container_variable), '{', field('key', $._hash_key), '}'),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '{', field('key', $._hash_key), '}')),
      seq($._subscripted, '{', field('key', $._hash_key), '}'),
    ),
    coderef_call_expression: $ => choice(
      prec.left(TERMPREC.ARROW, seq($._term, '->', '(', optional(field('arguments', $._expr)), ')')),
      seq($._subscripted, '(', optional(field('arguments', $._expr)), ')'),
    ),
    anonymous_slice_expression: $ => choice(
      seq('(', optional(field('list', $._expr)), ')', '[', $._expr, ']'),
      seq(field('list', $.quoted_word_list), '[', $._expr, ']'),
    ),
    slice_container_variable: $ => seq('@', $._var_indirob),
    slice_expression: $ => choice(
      seq(field('array', $.slice_container_variable), '[', $._expr, ']'),
      seq(field('hash', $.slice_container_variable), '{', $._expr, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $._term), '->', '@', '[', $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref', $._term), '->', '@', '{', $._expr, '}')),
    ),
    keyval_container_variable: $ => seq($._HASH_PERCENT, $._var_indirob),
    keyval_expression: $ => choice(
      seq(field('array', $.keyval_container_variable), '[', $._expr, ']'),
      seq(field('hash', $.keyval_container_variable), '{', $._expr, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $._term), '->', '%', '[', $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref', $._term), '->', '%', '{', $._expr, '}')),
    ),

    _term: $ => choice(
      $.readline_expression,
      $.assignment_expression,
      $.binary_expression,
      $.equality_expression,
      $.relational_expression,
      $.unary_expression,
      $.preinc_expression,
      $.postinc_expression,
      $.anonymous_array_expression,
      $.anonymous_hash_expression,
      $.anonymous_subroutine_expression,
      $.anonymous_method_expression,
      $.do_expression,
      $.eval_expression,
      $.conditional_expression,
      $.refgen_expression,
      $.localization_expression,
      seq('(', $._expr, ')'),
      $.quoted_word_list,
      $.heredoc_token,
      $.command_heredoc_token,
      $.stub_expression,
      $.scalar,
      $.glob,
      $.hash,
      $.array,
      $.arraylen,
      $._subscripted,
      $.slice_expression,
      $.keyval_expression,
      /* THING
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
      $.return_expression,
      $.undef_expression,
      /* NOTOP listexpr
       * UNIOP
       * UNIOP block
       * UNIOP term
       */
      $.require_expression,
      /* UNIOPSUB
       * UNIOPSUB term */
      $.func0op_call_expression,
      $.func1op_call_expression,
      $.map_grep_expression,
      $.sort_expression,
      /* PMFUNC */
      $.bareword,
      $.autoquoted_bareword,
      $._fat_comma_autoquoted_bareword,
      $._listop,

      /* perly.y doesn't know about `my` because that is handled weirdly in
       * toke.c but we'll have to do it differently here
       */
      $.variable_declaration,

      // legacy
      $.primitive,

      $._literal,
    ),

    readline_expression: $ => choice(
      seq(field('operator', '<'), optional(alias($._indirob, $.filehandle)), field('operator', '>')),
      field('operator', seq('<<', token.immediate('>>'))),
    ),
    assignment_expression: $ => prec.right(TERMPREC.ASSIGNOP,
      binop(
        choice( // _ASSIGNOP
          '=', '**=',
          '+=', '-=', '.=',
          '*=', '/=', '%=', 'x=',
          '&=', '|=', '^=',
          // TODO: Also &.= |.= ^.= when enabled
          '<<=', '>>=',
          '&&=', '||=', '//=',
        ),
        $._term
      )
    ),

    binary_expression: $ => {
      const table = [
        [prec.right, binop.nonassoc, choice('..', '...'), TERMPREC.DOTDOT], // _DOTDOT
        [prec.right, binop, '**', TERMPREC.POWOP], // _POWOP
        [prec.left, binop, choice('||', '//'), TERMPREC.OROR], // _OROR_DORDOR
        [prec.left, binop, '&&', TERMPREC.ANDAND], // _ANDAND
        [prec.left, binop, '|', TERMPREC.BITOROP], // _BITORDOP
        [prec.left, binop, '&', TERMPREC.BITANDOP], // _BITANDOP
        [prec.left, binop, choice('<<', '>>'), TERMPREC.SHIFTOP], // _SHIFTOP
        [prec.left, binop, choice('+', '-', '.'), TERMPREC.ADDOP], // _ADDOP
        [prec.left, binop, choice('*', '/', '%', 'x'), TERMPREC.MULOP], // _MULOP
        [prec.left, binop, choice('=~', '!~'), TERMPREC.MATCHOP], // _MATCHOP
      ]

      // @ts-ignore
      return choice(...table.map(([fn, fnop, operator, precedence]) => fn(
        precedence,
        // @ts-ignore
        fnop === binop ? fnop(operator, $._term) : fnop($, operator, $._term)
      )))
    },

    // perl.y calls this `termeqop`
    equality_expression: $ =>
      choice(
        prec.left(TERMPREC.CHEQOP, binop(choice('==', '!=', 'eq', 'ne'), $._term)), // _CHEQOP
        prec.right(TERMPREC.CHEQOP, binop.nonassoc($, choice('<=>', 'cmp', '~~'), $._term)), // _NCEQOP
      ),

    // perly.y calls this `termrelop`
    relational_expression: $ =>
      choice(
        prec.left(TERMPREC.CHRELOP, binop(choice('<', '<=', '>=', '>', 'lt', 'le', 'ge', 'gt'), $._term)), // _CHRELOP
        prec.right(TERMPREC.CHRELOP, binop.nonassoc($, 'isa', $._term)), // _NCRELOP
      )
      ,

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

    refgen_expression: $ => seq('\\', $._term), // _REFGEN

    anonymous_array_expression: $ => seq(
      '[', optional($._expr), ']'
    ),

    anonymous_hash_expression: $ => seq(
      $._HASHBRACK, optional($._expr), '}'
    ),

    anonymous_subroutine_expression: $ => seq(
      'sub',
      optseq(':', optional(field('attributes', $.attrlist))),
      optional($.prototype_or_signature),
      field('body', $.block),
    ),

    anonymous_method_expression: $ => seq(
      'method',
      optseq(':', optional(field('attributes', $.attrlist))),
      optional($.prototype_or_signature),
      field('body', $.block),
    ),

    do_expression: $ => choice(
      /* TODO: do FILENAME */
      seq('do', $.block),
    ),

    eval_expression: $ => prec(TERMPREC.UNOP, seq('eval', choice($.block, $._term))),

    variable_declaration: $ => prec.left(TERMPREC.QUESTION_MARK + 1,
      seq(
        choice('my', 'state', 'our', 'field'),
        choice(
          field('variable', alias($._declare_scalar, $.scalar)),
          field('variable', alias($._declare_array, $.array)),
          field('variable', alias($._declare_hash, $.hash)),
          field('variables', $._decl_variable_list)),
        optseq(':', optional(field('attributes', $.attrlist))))
    ),

    _decl_variable_list: $ => paren_list_of(
      choice(
        $.undef_expression,
        alias($._declare_scalar, $.scalar),
        alias($._declare_array, $.array),
        alias($._declare_hash, $.hash),
      )
    ),

    localization_expression: $ =>
      prec(TERMPREC.UNOP, seq('local', $._term)),

    // this has negative prec b/c it's only if the parens weren't eaten elsewhere
    stub_expression: $ => prec(-1, seq('(', ')')),

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

    func0op_call_expression: $ =>
      seq(field('function', $._func0op), optseq('(', ')')),

    func1op_call_expression: $ =>
      prec.left(TERMPREC.UNOP, seq(
        field('function', $._func1op),
        choice(optseq('(', optional($._expr), ')'), $._term),
      )),

    _map_grep: $ => choice('map', 'grep'),
    // we use the precedence here to ensure that we turn map { q'thingy" => $_ } into a hashref
    // it just needs to be arbitrarily higher than the _literal rule
    _tricky_hashref: $ => prec(1, seq(
      $._PERLY_BRACE_OPEN, choice($.string_literal, $.interpolated_string_literal, $.command_string), $._PERLY_COMMA, $._expr, '}'
    )),

    map_grep_expression: $ => prec.left(TERMPREC.LSTOP, choice(
      seq($._map_grep, field('callback', $.block), field('list', $._term_rightward)),
      seq($._map_grep, field('callback', choice($._term, alias($._tricky_hashref, $.anonymous_hash_expression))), $._PERLY_COMMA, field('list', $._term_rightward)),
      seq($._map_grep, '(', $._NONASSOC, field('callback', choice($._term, alias($._tricky_hashref, $.anonymous_hash_expression))), $._PERLY_COMMA, field('list', $._term_rightward), ')'),
      seq($._map_grep, '(', $._NONASSOC, field('callback', $.block), field('list', $._term_rightward), ')'),
    )),

    // even though technically you need the _tricky_hashref handling here, we punt on that,
    // b/c it's quite unlikely that someone is sorting a hashref w/ the default string
    // sort
    // sigh, here we go SUBNAME (bareword vers)! we'll cover this with indirobs
    //   - if it's the only thing on the list, then it's autoquoted.
    //   - if there's a comma, it's autoquoted
    //   - if there isn't, then it's a SUBNAME (unless it's builting)
    sort_expression: $ => prec.left(TERMPREC.LSTOP, choice(
      seq('sort', optional(field('callback', $.block)), field('list', $._term_rightward)),
      seq('sort', '(', $._NONASSOC, optional(field('callback', $.block)), field('list', $._term_rightward), ')'),
    )),


    _label_arg: $ => choice(alias($.identifier, $.label), $._term),
    loopex_expression: $ =>
      prec.left(TERMPREC.LOOPEX, seq(field('loopex', $._LOOPEX), optional($._label_arg))),
    goto_expression: $ =>
      prec.left(TERMPREC.LOOPEX, seq('goto', $._label_arg)),
    return_expression: $ => prec(TERMPREC.LSTOP, seq('return', optional($._term_rightward))),

    /* Perl just considers `undef` like any other UNIOP but it's quite likely
     * that tree consumers and highlighters would want to handle it specially
     */
    undef_expression: $ => prec.left(TERMPREC.UNOP, seq('undef', optional($._term))),

    _listop: $ => choice(
      /* TODO:
       * FUNC '(' indirob expr ')'
       */
      $.method_call_expression,
      /* METHCALL0 indirob optlistexpr
       * METHCALL indirb '(' optexpr ')'
       * LSTOP optlistexpr
       */
      $.function_call_expression,
      $.ambiguous_function_call_expression,
    ),

    // the usage of NONASSOC here is to make it that any parse of a paren after a func
    // automatically becomes a non-ambiguous function call
    function_call_expression: $ => choice(
      seq(field('function', $.function), '(', $._NONASSOC, optional(field('arguments', $._expr)), ')'),
      seq(field('function', $.function), '(', $._NONASSOC, $.indirect_object, field('arguments', $._expr), ')'),
    ),
    indirect_object: $ => choice(
      // we intentionally don't do bareword filehandles b/c we can't possibly do it right
      // since we can't know what subs have been defined
      $.scalar,
      $.block
    ),
    _tricky_indirob_hashref: $ => seq($._PERLY_BRACE_OPEN, $._expr, $._PERLY_SEMICOLON, '}'),
    ambiguous_function_call_expression: $ =>
      // we need the right precedence here so we can read ahead for the hash/sub disambiguation
      prec.right(TERMPREC.LSTOP,
        choice(
          seq(field('function', $.function), field('arguments', $._term_rightward)),
          seq(field('function', $.function), $.indirect_object, field('arguments', $._term_rightward)),
          // we handle this_takes_a_block { thing; other_thing }; here. we don't wanna accept an indirob of scalar tho
          seq(field('function', $.function), alias($.block, $.indirect_object)),
          // we handle cases like takes_a_hash { 1 => 2 }; by having this special case
          seq(field('function', $.function), field('arguments', alias($._tricky_indirob_hashref, $.anonymous_hash_expression)), optseq($._PERLY_COMMA , field('arguments', $._term_rightward)))
        )
      ),
    // we only parse a function if it won't be an indirob
    function: $ => $._bareword,

    method_call_expression: $ => prec.left(TERMPREC.ARROW, seq(
      field('invocant', $._term),
      '->',
      field('method', $.method),
      optseq('(', optional(field('arguments', $._expr)), ')')
    )),
    method: $ => choice($._bareword, $.scalar),

    scalar:   $ => seq('$',  $._var_indirob),
    _declare_scalar:   $ => seq('$',  $.varname),
    array:    $ => seq('@',  $._var_indirob),
    _declare_array:    $ => seq('@',  $.varname),
    _HASH_PERCENT: $ => alias(token(prec(2, '%')), '%'), // self-aliasing b/c token
    hash:     $ => seq($._HASH_PERCENT, $._var_indirob),
    _declare_hash:    $ => seq($._HASH_PERCENT,  $.varname),

    arraylen: $ => seq('$#', $._var_indirob),
    // perly.y calls this `star`
    glob: $ => seq('*', $._var_indirob),

    _indirob: $ => choice(
      $._bareword,
      // toke.c has weird code in S_scan_ident to handle the $<digits> and
      // other single-character punctuation vars like $!
      $._ident_special,
      $.scalar,
      $.block,
    ),
    varname: $ => choice(
      $._identifier,
      $._ident_special // TODO - not sure if we wanna make `my $1` error out
    ),
    // not all indirobs are alike; for variables, they have autoquoting behavior
    _var_indirob_autoquote: $ => seq(
        $._PERLY_BRACE_OPEN,
        alias(choice($._bareword, $._autoquotables, $._ident_special, /\^\w+/ ), $.varname),
        $._brace_end_zw, '}'
    ),
    _var_indirob: $ => choice(
      alias($._indirob, $.varname),
      $._var_indirob_autoquote
    ),

    attrlist: $ => prec.left(0, seq(
      $.attribute,
      repeat(seq(optional(':'), $.attribute))
    )),
    attribute: $ => seq(
      field('name', $.attribute_name),
      optseq($._attribute_value_begin, '(', field('value', $.attribute_value), ')'),
    ),
    attribute_name: $ => $._bareword,

    /****
     * Token types defined by toke.c
     */

    _PERLY_COMMA: $ => choice(',', '=>'),

    _KW_USE: $ => choice('use', 'no'),
    _KW_FOR: $ => choice('for', 'foreach'),
    _LOOPEX: $ => choice('last', 'next', 'redo'),

    _PHASE_NAME: $ => choice('BEGIN', 'INIT', 'CHECK', 'UNITCHECK', 'END', 'ADJUST'),

    // Anything toke.c calls FUN0 or FUN0OP; the distinction does not matter to us
    _func0op: $ => choice(
      '__FILE__', '__LINE__', '__PACKAGE__', '__SUB__',
      'break', 'fork', 'getppid', 'time', 'times', 'wait', 'wantarray',
      'continue' // non-block continue is func0
      /* TODO: all the end*ent, get*ent, set*ent, etc... */
    ),

    // Anything toke.c calls FUN1 or UNIOP; the distinction does not matter to us
    // NOTE - undef is handled separately
    _func1op: $ => choice(
      // UNI
      'abs', 'alarm', 'chop', 'chdir', 'close', 'closedir', 'caller', 'chomp',
      'chr', 'cos', 'chroot', 'defined', 'delete', 'dbmclose', 'exists', 'exit',
      'eof', 'exp', 'each', 'fc', 'fileno', 'gmtime', 'getc', 'getpgrp',
      'getprotobyname', 'getpwname', 'getpwuid', 'getpeername', 'getnetbyname',
      'getsockname', 'getgrnam', 'getgrgid', 'hex', 'int', 'keys', 'lc',
      'lcfirst', 'length', 'localtime', 'log', 'lock', 'lstat', 'oct', 'ord',
      'prototype', 'pop', 'pos', 'quotemeta', 'reset', 'rand', 'rmdir',
      'readdir', 'readline', 'readpipe', 'rewinddir', 'readlink', 'ref',
      'scalar', 'shift', 'sin', 'sleep', 'sqrt', 'srand', 'stat', 'study',
      'tell', 'telldir', 'tied', 'uc', 'ucfirst', 'untie', 'umask',
      'values', 'write',
      // filetest operators
      seq('-', token.immediate(prec(1, /[rwxoRWXOezsfdlpSbctugkTBMAC]/)))
      /* TODO: all the set*ent */
    ),

    /****
     * Misc bits
     */

    comment: $ => /#.*/,

    __DATA__: $ => seq(
      choice(
        seq(
          alias(choice('__DATA__', '__END__'), $.eof_marker),
          /.*/, // ignore til end of line
          alias($._gobbled_content, $.data_section)
        ),
        // we need to use a hack for CTRL-Z or else it can't compile on windoze
        // these don't create a __DATA__ fh, so their _gobbled_content stays hidden
        seq(
          alias(choice('\x04', $._ctrl_z_hack), $.eof_marker),
          $._gobbled_content
        )
      ),
    ),

    // toke.c calls this a THING and that is such a generic unhelpful word,
    // we'll call it this instead
    _literal: $ => choice(
      $.string_literal,
      $.interpolated_string_literal,
      $.command_string,
      $.quoted_regexp,
      $.match_regexp,
      $.substitution_regexp,
      $.transliteration_expression,
    ),

    string_literal: $ => seq(
      choice(
        seq('q', $._quotelike_begin),
        $._apostrophe
      ),
      optional($._noninterpolated_string_content),
      $._quotelike_end
    ),
    interpolated_string_literal: $ => seq(
      choice(
        seq('qq', $._quotelike_begin),
        $._double_quote
      ),
      optional($._interpolated_string_content),
      $._quotelike_end
    ),
    // we make a copy of the relevant rules b/c this must be more constrained (or else TS
    // just explodes)
    _subscripted_interpolations: $ => choice(
      alias($._array_element_interpolation, $.array_element_expression),
      alias($._hash_element_interpolation, $.hash_element_expression),
    ),
    // we make any braced variable force to be this rule so it can't get subscripted (good ol' NONASSOC)
    _braced_scalar: $ => seq(
      '$', choice($.block, $._var_indirob_autoquote), $._NONASSOC
    ),
    _braced_array: $ => seq(
      '@', choice($.block, $._var_indirob_autoquote), $._NONASSOC
    ),
    _array_element_interpolation: $ => choice(
      seq(field('array', alias($.scalar, $.container_variable)), token.immediate('['), field('index', $._expr), ']'),
      prec.left(TERMPREC.ARROW, seq($.scalar, token.immediate('->['), field('index', $._expr), ']')),
      seq($._subscripted_interpolations, token.immediate('['), field('index', $._expr), ']'),
    ),
    _hash_element_interpolation: $ => choice(
      seq(field('hash', alias($.scalar, $.container_variable)), token.immediate('{'), field('key', $._hash_key), '}'),
      prec.left(TERMPREC.ARROW, seq($.scalar, token.immediate('->{'), field('key', $._hash_key), '}')),
      seq($._subscripted_interpolations, token.immediate('{'), field('key', $._hash_key), '}'),
    ),
    _slice_expression_interpolation: $ => choice(
      seq(field('array', alias($.array, $.slice_container_variable)), token.immediate('['), $._expr, ']'),
      seq(field('hash', alias($.array, $.slice_container_variable)), token.immediate('{'), $._expr, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $.scalar), token.immediate('->@['), $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref', $.scalar), token.immediate('->@{'), $._expr, '}')),
    ),
    _interpolations: $ => choice(
      $.array,
      $.scalar,
      alias($._braced_scalar, $.scalar),
      alias($._braced_array, $.array),
      $._subscripted_interpolations,
      alias($._slice_expression_interpolation, $.slice_expression),
    ),
    _noninterpolated_string_content: $ => repeat1(
      choice(
        $._q_string_content,
        $.escape_sequence,
        $.escaped_delimiter,
      )
    ),
    _interpolation_fallbacks: $ => choice(
      seq('@', $._no_interp_whitespace_zw),
      // Most array punctuation vars do not interpolate
      // we need the zw quote-end for "" (we leave regular _end so the scanner looks for it)
      seq('@', choice(/[^A-Za-z0-9_\$'+:-]/, $._quotelike_end_zw, $._quotelike_end)),
      '-',
      '{',
      '[',
    ),
    _interpolated_string_content: $ => repeat1(
      choice(
        $._qq_string_content,
        $._interpolation_fallbacks,
        $.escape_sequence,
        $.escaped_delimiter,
        $._interpolations
      )
    ),

    quoted_word_list: $ => seq(
      'qw',
      $._quotelike_begin,
      optional($._noninterpolated_string_content),
      $._quotelike_end
    ),

    command_string: $ => choice(
      seq(
        choice(
          seq('qx', $._quotelike_begin),
          $._backtick
        ),
        optional($._interpolated_string_content),
        $._quotelike_end
      ),
      seq(
        'qx',
        $._apostrophe,
        optional($._noninterpolated_string_content),
        $._quotelike_end
      )
    ),

    quoted_regexp: $ => seq(
      'qr',
      choice(
        seq(
          $._quotelike_begin,
          optional(regexpContent($, $._interpolated_regexp_content)),
        ),
        seq(
          $._apostrophe,
          optional(regexpContent($, $._noninterpolated_string_content)), // TODO: regexp content
        ),
      ),
      $._quotelike_end,
      optional(field('modifiers', $.quoted_regexp_modifiers))
    ),

    // we need to make a regex node, b/c you can't make an unnamed node a field
    match_regexp: $ => seq(
      choice(
        seq(
          choice(
          seq(
            choice(
              $._search_slash,
              seq(field('operator', 'm'), $._quotelike_begin)
            ),
            optional(regexpContent($, $._interpolated_regexp_content)),
          ),
          seq(
            field('operator', 'm'),
            $._apostrophe,
            optional(regexpContent($, $._noninterpolated_string_content)), // TODO: regexp content
          ),
        ),
        $._quotelike_end,
        ),
        '//' // empty pattern is handled specially so we can manage shift // 'default'
      ),
      optional(field('modifiers', $.match_regexp_modifiers))
    ),
    _quotelike_middle: $ => seq(
      $._quotelike_middle_close,
      choice($._quotelike_middle_skip, $._quotelike_begin),
    ),

    substitution_regexp: $ => seq(
      field('operator', 's'),
      choice(
        seq(
          $._quotelike_begin,
          optional(regexpContent($, $._interpolated_regexp_content)),
          $._quotelike_middle,
          optional(replacement($, $._interpolated_string_content)),
        ),
        seq(
          $._apostrophe,
          optional(regexpContent($, $._noninterpolated_string_content)),
          $._quotelike_middle,
          optional(replacement($, $._noninterpolated_string_content)),
        ),
      ),
      $._quotelike_end,
      optional(field('modifiers', $.substitution_regexp_modifiers))
    ),

    _interpolated_regexp_content: $ => repeat1(
      choice(
        $._qq_string_content,
        $.escape_sequence,
        $.escaped_delimiter,
        $._dollar_in_regexp,
        $._interpolation_fallbacks,
        $._interpolations,
        seq('$', $._no_interp_whitespace_zw),
      )
    ),

    quoted_regexp_modifiers:        $ => token.immediate(prec(2, /[msixpadlun]+/)),
    match_regexp_modifiers:         $ => token.immediate(prec(2, /[msixpadluncg]+/)),
    substitution_regexp_modifiers:  $ => token.immediate(prec(2, /[msixpogcedualr]+/)),
    transliteration_modifiers:      $ => token.immediate(prec(2, /[cdsr]+/)),

    _interpolated_transliteration_content: $ => repeat1(
      choice(
        $._qq_string_content,
        $._interpolation_fallbacks,
        seq(choice('$', '@'), /./), // no variables interpolate AT ALL
        $.escape_sequence,
        $.escaped_delimiter,
      )
    ),
    transliteration_expression: $ => seq(
      field('operator', choice('tr', 'y')),
      choice(
        seq(
          $._quotelike_begin,
          optional(trContent($, $._interpolated_transliteration_content)),
          $._quotelike_middle,
          optional(replacement($, $._interpolated_transliteration_content)),
        ),
        seq(
          $._apostrophe,
          optional(trContent($, $._noninterpolated_string_content)),
          $._quotelike_middle,
          optional(replacement($, $._noninterpolated_string_content)),
        ),
      ),
      $._quotelike_end,
      optional(field('modifiers', $.transliteration_modifiers))
    ),

    /* quick overview of the heredoc logic
     * 1. we parse the heredoc token (given all of its rules and varieties). We store that in the
     *    lexer state for comparing later
     * 2. tree-sitter continues happily along
     * 3. we have a _heredoc_start zw token in extras, so every lex looks to see if it's
     *    valid to start a heredoc. If we're at the beggining of a line, then we initiate
     * 4. now we're inside heredoc_content, we parse the full line to decide what to do.
     *    There are 3 options
     *    a. if there's nothing interesting, then we accept it + read another line
     *    b. if there's escapes or interpolation (depending on if the heredoc_token above
     *       allowed them), then we give the line back, and re-parse it in "continue"
     *       mode, stopping at $, @, and \
     *    c. we read the end token; then we make everything before into a _heredoc_middle,
     *       and re-parse the ending line in "end" mode, where we finally finish our
     *       heredoc
     */
    // NOTE - we need our own HEREDOC token for <<, so that even in GLR mode all sides
    // will see that << followed by a valid heredoc is a heredoc, and not a shift
    heredoc_token: $ => seq($._PERLY_HEREDOC, $._heredoc_delimiter),
    // in the event that it's in ``, we want it to be a different node
    command_heredoc_token: $ => seq($._PERLY_HEREDOC, $._command_heredoc_delimiter),
    heredoc_content: $ => seq(
      $._heredoc_start,
      repeat(choice(
        $._heredoc_middle,
        $.escape_sequence,
        $._interpolations,
        $._interpolation_fallbacks
      )),
      $.heredoc_end
    ),

    package: $ => $._bareword,
    _version: $ => prec(1, choice($.number, $.version)),
    // we have to up the lexical prec here to prevent v5 from being read as a bareword
    version: $ => token(prec(1, /v[0-9]+(?:\.[0-9]+)*/)),

    // NOTE - we MUST do it this way, b/c if we don't include every literal token, then TS
    // will not even consider the consuming rules. Lexical precedence...
    // also, all of these rules are inlined up top
    _conditionals: $ => choice('if', 'unless'),
    _loops: $ => choice('while', 'until'),
    _postfixables: $ => choice($._conditionals, $._loops, $._KW_FOR, 'and', 'or'),
    _keywords: $ => choice($._postfixables, 'else', 'elsif', 'do', 'eval', 'our', 'state', 'my', 'local', 'require', 'return', 'eq', 'ne', 'lt', 'le', 'ge', 'gt', 'cmp', 'isa', $._KW_USE, $._LOOPEX, $._PHASE_NAME, '__DATA__', '__END__', 'sub', $._map_grep, 'sort', 'try', 'class', 'field', 'method', 'continue'),
    _quotelikes: $ => choice('q', 'qq', 'qw', 'qx', 's', 'tr', 'y'),
    _autoquotables: $ => choice($._func0op, $._func1op, $._keywords, $._quotelikes),
    // we need dynamic precedence here so we can resolve things like `print -next`
    autoquoted_bareword: $ => prec.dynamic(20,
      // give this autoquote the highest precedence we gots
      prec(TERMPREC.PAREN, seq('-', choice(
        $._bareword,
        $._autoquotables,
        // b/c we needed to bump up prec for filetests, we had to also inline a filetest
        // followed by a bareword (see gh#145)
        token.immediate(prec(1, /[rwxoRWXOezsfdlpSbctugkTBMAC]((::)|([a-zA-Z_]\w*))+/))
      ))),
    ),
    _fat_comma_autoquoted_bareword: $ => prec.dynamic(2, 
      // NOTE - these have zw lookaheads so they override just being read as barewords
      // NOTE - we have this as a hidden node + alias the actual target b/c we don't need
      // the whitespace b4 the zw assetion to be part of our node
      seq(alias(choice($._identifier, $._autoquotables), $.autoquoted_bareword), $._fat_comma_zw),
    ),
    _brace_autoquoted: $ => seq(
      alias(choice($._bareword, $._autoquotables), $.autoquoted_bareword),
      $._brace_end_zw
    ),

    // prefer identifer to bareword where the grammar allows
    identifier: $ => prec(2, $._identifier),
    _identifier: $ => unicode_ranges.identifier,
    // this pattern tries to encapsulate the joys of S_scan_ident in toke.c in perl core
    // _dollar_ident_zw takes care of the subtleties that distinguish $$; ( only $$
    // followed by semicolon ) from $$deref
    _ident_special: $ => choice(/[0-9]+|\^([A-Z[?\^_]|])|\S/, seq('$', $._dollar_ident_zw) ),

    bareword: $ => prec.dynamic(1, $._bareword),
    // _bareword is at the very end b/c the lexer prefers tokens defined earlier in the grammar
    _bareword: $ => choice($._identifier, unicode_ranges.bareword),
    ...primitives,
  }
})
