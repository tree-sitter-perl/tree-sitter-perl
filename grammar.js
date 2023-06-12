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

const unop_pre = (op, term) =>
  seq(field('operator', op), field('operand', term));
const unop_post = (op, term) =>
  seq(field('operand', term), field('operator', op));

const binop = (op, term) =>
  seq(field('left', term), field('operator', op), field('right', term));

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
  );

// listassoc we do by using a continuation version of the token for the op.
// Using tree-sitter directly to make the high prec continuation token is
// punishing (crashes your computer level), so it has to be manually
// implemented in the scanner. See the sad saga at https://github.com/tree-sitter-perl/tree-sitter-perl/pull/47#issuecomment-1418270313
binop.listassoc = (op, continue_token, term) =>
  seq(
    field('arg', term),
    field('operator', op),
    field('arg', term),
    repeat(seq(
      continue_token,
      field('operator', op),
      field('arg', term),
    ))
  )

const optseq = (...terms) => optional(seq(...terms));
const paren_list_of = rule => 
      seq('(', repeat(seq(optional(rule), ',')), optional(rule), ')')

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.primitive
  ],
  inline: $ => [
    $._conditionals,
    $._loops,
    $._postfixables,
    $._keywords,
    $._quotelikes,
    $._func0op,
    $._func1op,
    $._autoquotables,
  ],
  externals: $ => [
    /* ident-alikes */
    /* non-ident tokens */
    $._apostrophe,
    $._double_quote,
    $._backtick,
    $._PERLY_SEMICOLON,
    $._PERLY_BRACE_OPEN,
    $._HASHBRACK,
    $._ctrl_z_hack,
    /* immediates */
    $._quotelike_begin,
    $._quotelike_end,
    $._q_string_content,
    $._qq_string_content,
    $.escape_sequence,
    $.escaped_delimiter,
    $.pod,
    $._gobbled_content,
    $.attribute_value,
    $.prototype_or_signature,
    $._heredoc_delimiter,
    $._command_heredoc_delimiter,
    $._heredoc_start,
    $._heredoc_middle,
    $.heredoc_end,
    /* zero-width lookahead tokens */
    $._CHEQOP_continue,
    $._CHRELOP_continue,
    $._PERLY_COMMA_continue,
    $._fat_comma_zw,
    $._brace_end_zw,
    /* zero-width high priority token */
    $._NONASSOC,
    /* error condition must always be last; we don't use this in the grammar */
    $._ERROR
  ],
  extras: $ => [
    /\s|\\\r?\n/,
    $.comment,
    $.pod,
    $.heredoc_content,
  ],
  conflicts: $ => [
    [ $.preinc_expression, $.postinc_expression ],
    // all of the following go GLR b/c they need extra tokens to allow postfixy autoquotes
    [ $.return_expression ],
    [ $.conditional_statement ],
    [ $.elsif ],
    [ $.list_expression ],
    [ $._term_rightward ],
    [ $._FUNC, $.bareword ],
    // for fancy interpolations
    [ $._interpolations, $._array_element_interpolation ],
    [ $._interpolations, $._hash_element_interpolation ],
  ],
  rules: {
    source_file: $ => seq(repeat($._fullstmt), optional($.__DATA__)),
    /****
     * Main grammar rules taken from perly.y.
     ****/
    block: $ => seq($._PERLY_BRACE_OPEN, repeat($._fullstmt), '}'),

    _fullstmt: $ => choice($._barestmt, $.statement_label),

    // perly.y calls this labfullstmt
    statement_label: $ => seq(field('label', $.identifier), ':', field('statement', $._fullstmt)),

    _barestmt: $ => choice(
      $.package_statement,
      $.use_version_statement,
      $.use_statement,
      $.subroutine_declaration_statement,
      $.phaser_statement,
      $.conditional_statement,
      /* TODO: given/when/default */
      $.loop_statement,
      $.cstyle_for_statement,
      $.for_statement,
      alias($.block, $.block_statement),
      seq($.expression_statement, choice($._PERLY_SEMICOLON, $.__DATA__)),
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

    subroutine_declaration_statement: $ => seq(
      'sub',
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
      $._postfix_expressions,
      $.yadayada,
    ),
    _postfix_expressions: $ => choice(
      $.postfix_conditional_expression,
      $.postfix_loop_expression,
      $.postfix_for_expression,
    ),
    postfix_conditional_expression:     $ => seq($._expr, $._conditionals, field('condition', $._expr)),
    postfix_loop_expression:  $ => seq($._expr, $._loops,  field('condition', $._expr)),
    postfix_for_expression:    $ => seq($._expr, $._KW_FOR, field('list', $._expr)),
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
    list_expression: $ => seq(
      $._term, $._PERLY_COMMA, repeat(seq(optional($._term), $._PERLY_COMMA)), optional($._term)
    ),
    _term_rightward: $ => prec.right(seq(
      $._term,
      repeat(seq($._PERLY_COMMA_continue, $._PERLY_COMMA, optional($._term))),
      // NOTE - we need this here to create a conflict in order to go GLR to handle
      // `die 1, or => die` correctly
      optional(seq($._PERLY_COMMA_continue, $._PERLY_COMMA))
    )),

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
    // for highlighting.
    container_variable: $ => seq('$', $._var_indirob),
    array_element_expression: $ => choice(
      // perly.y matches scalar '[' expr ']' here but that would yield a scalar var node
      seq(field('array', $.container_variable),    '[', field('index', $._expr), ']'),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '[', field('index', $._expr), ']')),
      seq($._subscripted,                          '[', field('index', $._expr), ']'),
    ),
    _hash_key: $ => choice($._brace_autoquoted, $._expr),
    hash_element_expression: $ => choice(
      // perly.y matches scalar '{' expr '}' here but that would yield a scalar var node
      seq(field('hash', $.container_variable),     '{', field('key', $._hash_key), '}'),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '{', field('key', $._hash_key), '}')),
      seq($._subscripted,                          '{', field('key', $._hash_key), '}'),
    ),
    coderef_call_expression: $ => choice(
      prec.left(TERMPREC.ARROW, seq($._term, '->', '(', optional(field('arguments', $._expr)), ')')),
      seq($._subscripted,                          '(', optional(field('arguments', $._expr)), ')'),
    ),
    anonymous_slice_expression: $ => choice(
      seq('(', optional(field('list', $._expr)), ')',   '[', $._expr, ']'),
      seq(field('list', $.quoted_word_list),            '[', $._expr, ']'),
    ),
    slice_container_variable: $ => seq('@', $._var_indirob),
    slice_expression: $ => choice(
      seq(field('array', $.slice_container_variable),   '[', $._expr, ']'),
      seq(field('hash',  $.slice_container_variable),   '{', $._expr, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $._term), '->', '@',       '[', $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref',  $._term), '->', '@',       '{', $._expr, '}')),
    ),
    keyval_container_variable: $ => seq($._HASH_PERCENT, $._var_indirob),
    keyval_expression: $ => choice(
      seq(field('array', $.keyval_container_variable),   '[', $._expr, ']'),
      seq(field('hash',  $.keyval_container_variable),   '{', $._expr, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $._term), '->', '%',       '[', $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref',  $._term), '->', '%',       '{', $._expr, '}')),
    ),

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
      $.anonymous_subroutine_expression,
      $.do_expression,
      $.conditional_expression,
      $.refgen_expression,
      /* KW_LOCAL
       */
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
      /* PMFUNC */
      $.bareword,
      $.autoquoted_bareword,
      $._listop,

      /* perly.y doesn't know about `my` because that is handled weirdly in
       * toke.c but we'll have to do it differently here
       */
      $.variable_declaration,
      $.localization_expression,

      // legacy
      $.primitive,

      $._literal,
    ),

    assignment_expression: $ =>
      prec.right(TERMPREC.ASSIGNOP, binop($._ASSIGNOP, $._term)),

    // perly.y calls this `termbinop`
    binary_expression: $ => choice(
      prec.right(TERMPREC.DOTDOT,  binop.nonassoc($, $._DOTDOT, $._term)),
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
      prec.right(TERMPREC.CHEQOP, choice(
        binop.listassoc($._CHEQOP, $._CHEQOP_continue, $._term),
        binop.nonassoc($, $._NCEQOP, $._term),
      )
    ),

    // perly.y calls this `termrelop`
    relational_expression: $ =>
      prec.right(TERMPREC.CHRELOP, choice(
        binop.listassoc($._CHRELOP, $._CHRELOP_continue, $._term),
        binop.nonassoc($, $._NCRELOP, $._term),
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
      $._HASHBRACK, optional($._expr), '}'
    ),

    anonymous_subroutine_expression: $ => seq(
      'sub',
      optseq(':', optional(field('attributes', $.attrlist))),
      optional($.prototype_or_signature),
      field('body', $.block),
    ),

    do_expression: $ => choice(
      /* TODO: do FILENAME */
      seq('do', $.block),
    ),

    variable_declaration: $ => prec.left(TERMPREC.QUESTION_MARK+1,
      seq(
        choice('my', 'our'),
        choice(
          field('variable', alias($._declare_scalar, $.scalar)),
          field('variable', alias($._declare_array, $.array)),
          field('variable', alias($._declare_hash, $.hash)),
          field('variables', $._decl_variable_list)),
        optseq(':', optional(field('attributes', $.attrlist))))
    ),
    localization_expression: $ =>
      seq('local', choice(
        field('variable', $.scalar),
        field('variable', $.array),
        field('variable', $.hash),
        field('variables', $._variable_list))),
    _variable_list: $ => paren_list_of(
      choice($.scalar, $.array, $.hash, $.undef_expression)
    ),
    _decl_variable_list: $ => paren_list_of(
      choice(
        $.undef_expression,
        alias($._declare_scalar, $.scalar),
        alias($._declare_array, $.array),
        alias($._declare_hash, $.hash),
      )
    ),

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
      $.ambiguous_function_call_expression,
    ),

    // the usage of NONASSOC here is to make it that any parse of a paren after a func
    // automatically becomes a non-ambiguous function call
    function_call_expression: $ =>
      seq(field('function', $.function), '(', $._NONASSOC, optional(field('arguments', $._expr)), ')'),
    ambiguous_function_call_expression: $ => 
      prec(TERMPREC.LSTOP, seq(field('function', $.function), field('arguments', $._term_rightward))),
    function: $ => $._FUNC,

    method_call_expression: $ => prec.left(TERMPREC.ARROW, seq(
      field('invocant', $._term),
      '->',
      field('method', $.method),
      optseq('(', optional(field('arguments', $._expr)), ')')
    )),
    method: $ => choice($._METHCALL0, $.scalar),

    scalar:   $ => seq('$',  $._var_indirob),
    _declare_scalar:   $ => seq('$',  $._varname),
    array:    $ => seq('@',  $._var_indirob),
    _declare_array:    $ => seq('@',  $._varname),
    _HASH_PERCENT: $ => token(prec(2, '%')),
    hash:     $ => seq($._HASH_PERCENT, $._var_indirob),
    _declare_hash:    $ => seq($._HASH_PERCENT,  $._varname),

    arraylen: $ => seq('$#', $._var_indirob),
    // perly.y calls this `star`
    glob:     $ => seq('*',  $._var_indirob),

    _indirob: $ => choice(
      $._bareword,
      // toke.c has weird code in S_scan_ident to handle the $<digits> and
      // other single-character punctuation vars like $!
      $._ident_special,
      $.scalar,
      $.block,
    ),
    _varname: $ => choice(
      $._identifier,
      $._ident_special // TODO - not sure if we wanna make `my $1` error out
    ),
    // not all indirobs are alike; for variables, they have autoquoting behavior
    _var_indirob: $ => choice(
      $._indirob,
      seq(
        $._PERLY_BRACE_OPEN,
        choice($._bareword, $._autoquotables, $._ident_special, /\^[A-Z]\w*/ ),
        $._brace_end_zw, '}'
      )
    ),

    attrlist: $ => prec.left(0, seq(
      $.attribute,
      repeat(seq(optional(':'), $.attribute))
    )),
    attribute: $ => seq(
      field('name', $.attribute_name),
      field('value', optional($.attribute_value))
    ),
    attribute_name: $ => $._bareword,

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
    // these chaining ops have high precedence versions ALSO defined in the scanner, name _{name}_continue
    _CHEQOP: $ => choice('==', '!=', 'eq', 'ne'),
    _CHRELOP: $ => choice('<', '<=', '>=', '>', 'lt', 'le', 'ge', 'gt'),
    _DOTDOT:  $ => choice('..', '...'),
    _NCEQOP:  $ => choice('<=>', 'cmp', '~~'),
    _NCRELOP: $ => choice('isa'),
    _REFGEN: $ => '\\',

    _PERLY_COMMA: $ => choice(',', '=>'),

    _KW_USE: $ => choice('use', 'no'),
    _KW_FOR: $ => choice('for', 'foreach'),
    _LOOPEX: $ => choice('last', 'next', 'redo'),

    _PHASE_NAME: $ => choice('BEGIN', 'INIT', 'CHECK', 'UNITCHECK', 'END'),

    // Anything toke.c calls FUN0 or FUN0OP; the distinction does not matter to us
    _func0op: $ => choice(
      '__FILE__', '__LINE__', '__PACKAGE__', '__SUB__',
      'break', 'fork', 'getppid', 'time', 'times', 'wait', 'wantarray',
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
      seq('-', token.immediate(/[rwxoRWXOezsfdlpSbctugkTBMAC]/))
      /* TODO: all the set*ent */
    ),

    /****
     * Misc bits
     */

    // Would like to write  repeat1(token(/#.*/))  but we can't because of
    //   https://github.com/tree-sitter/tree-sitter/issues/1910
    comment: $ => token(/#.*(\r?\n\s*#.*)*/),

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
    ),

    string_literal: $ => choice($._q_string),
    _q_string: $ => seq(
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
    _array_element_interpolation: $ => choice( 
        seq(field('array', alias($.scalar, $.container_variable)), token.immediate('['),   field('index', $._expr), ']'),
        prec.left(TERMPREC.ARROW, seq($.scalar,                    token.immediate('->['), field('index', $._expr), ']')),
        seq($._subscripted_interpolations,                         token.immediate('['),   field('index', $._expr), ']'),
      ),
    _hash_element_interpolation: $ => choice( 
        seq(field('hash', alias($.scalar, $.container_variable)), token.immediate('{'),   field('key', $._hash_key), '}'),
        prec.left(TERMPREC.ARROW, seq($.scalar,                   token.immediate('->{'), field('key', $._hash_key), '}')),
        seq($._subscripted_interpolations,                        token.immediate('{'),   field('key', $._hash_key), '}'),
      ),
    _slice_expression_interpolation: $ => choice(
      seq(field('array', alias($.array, $.slice_container_variable)),   token.immediate('['), $._expr, ']'),
      seq(field('hash',  alias($.array, $.slice_container_variable)),   token.immediate('{'), $._expr, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $.scalar), token.immediate('->@['), $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref',  $.scalar), token.immediate('->@{'), $._expr, '}')),
    ),
    _interpolations: $ => choice(
      $.array,
      $.scalar,
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
    _interpolated_string_content: $ => repeat1(
      choice(
        $._qq_string_content,
        seq(choice('$', '@'), /\s/),
        // Most array punctuation vars do not interpolate
        seq('@', /[^A-Za-z0-9_\$'+:-]/),
        '-',
        '{',
        '[',
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

    quoted_regexp: $ => choice(
      seq(
        seq('qr', $._quotelike_begin),
        optional($._interpolated_string_content), // TODO: regexp content
        $._quotelike_end,
        optional(field('modifiers', $.quoted_regexp_modifiers))
      ),
      seq(
        'qr',
        $._apostrophe,
        optional($._noninterpolated_string_content), // TODO: regexp content
        $._quotelike_end,
        optional(field('modifiers', $.quoted_regexp_modifiers))
      )
    ),

    match_regexp: $ => choice(
      // TODO: recognise /pattern/ as a match regexp as well
      seq(
        seq('m', $._quotelike_begin),
        optional($._interpolated_string_content), // TODO: regexp content
        $._quotelike_end,
        optional(field('modifiers', $.match_regexp_modifiers))
      ),
      seq(
        'm',
        $._apostrophe,
        optional($._noninterpolated_string_content), // TODO: regexp content
        $._quotelike_end,
        optional(field('modifiers', $.match_regexp_modifiers))
      )
    ),

    quoted_regexp_modifiers: $ => token(/[msixpadlun]+/),
    match_regexp_modifiers:  $ => token(/[msixpadluncg]+/),

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
    heredoc_token: $ => seq('<<', $._heredoc_delimiter),
    // in the event that it's in ``, we want it to be a different node
    command_heredoc_token: $ => seq('<<', $._command_heredoc_delimiter),
    heredoc_content: $ => seq(
      $._heredoc_start,
      repeat(choice(
        $._heredoc_middle,
        $.escape_sequence,
        $._interpolations
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
    _keywords: $ => choice($._postfixables, 'else', 'elsif', 'do', 'our', 'my', 'local', 'require', 'return', 'eq', 'ne', 'lt', 'le', 'ge', 'gt', 'cmp', 'isa', $._KW_USE, $._LOOPEX, $._PHASE_NAME, '__DATA__', '__END__'),
    _quotelikes: $ => choice('q', 'qq', 'qw', 'qx'),
    _autoquotables: $ => choice($._func0op, $._func1op, $._keywords, $._quotelikes),
    // we need dynamic precedence here so we can resolve things like `print -next`
    autoquoted_bareword: $ => prec.dynamic(2, choice(
      // NOTE - these have zw lookaheads so they override just being read as barewords
      seq(choice($._identifier, $._autoquotables), $._fat_comma_zw),
      // give this autoquote the highest precedence we gots
      prec(TERMPREC.PAREN, seq('-', choice($._bareword, $._autoquotables))),
    )),
    _brace_autoquoted: $ => seq(
      alias(choice($._bareword, $._autoquotables), $.autoquoted_bareword),
      $._brace_end_zw
    ),

    // prefer identifer to bareword where the grammar allows
    identifier: $ => prec(2, $._identifier),
    _identifier: $ => /[a-zA-Z_]\w*/,
    _ident_special: $ => /[0-9]+|\^[A-Z]|./,

    bareword: $ => prec.dynamic(1, $._bareword),
    // _bareword is at the very end b/c the lexer prefers tokens defined earlier in the grammar 
    _bareword: $ => choice($._identifier, /((::)|([a-zA-Z_]\w*))+/),  // TODO: unicode
    ...primitives,
  }
})
