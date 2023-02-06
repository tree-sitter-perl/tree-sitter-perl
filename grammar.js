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
    /* non-ident tokens */
    $._apostrophe,
    $._double_quote,
    $._PERLY_SEMICOLON,
    $._PERLY_BRACE_OPEN,
    $._HASHBRACK,
    /* immediates */
    $._quotelike_begin,
    $._quotelike_end,
    $._q_string_content,
    $._qq_string_content,
    $._qw_list_content,
    $.escape_sequence,
    $.escaped_delimiter,
    $.pod,
    $._gobbled_content,
    $.attribute_value,
    $.prototype_or_signature,
    /* error condition must always be last; we don't use this in the grammar */
    $._ERROR
  ],
  extras: $ => [
    /\s|\\\r?\n/,
    $.comment,
    $.pod,
    $.__DATA__,
    $.__END__,
    $._CTRL_D,
    // $._CTRL_Z // borken on windoze, sigh
  ],
  conflicts: $ => [
    [ $.preinc_expression, $.postinc_expression ],
  ],
  rules: {
    source_file: $ => stmtseq($),
    /****
     * Main grammar rules taken from perly.y.
     ****/
    block: $ => seq($._PERLY_BRACE_OPEN, stmtseq($), '}'),

    _fullstmt: $ => choice($._barestmt, $.statement_label),

    // perly.y calls this labfullstmt
    statement_label: $ => seq(field('label', $.bareword), ':', field('statement', $._fullstmt)),

    _barestmt: $ => choice(
      $.package_statement,
      $.use_version_statement,
      $.use_statement,
      $.subroutine_declaration_statement,
      $.phaser_statement,
      $.if_statement,
      $.unless_statement,
      /* TODO: given/when/default */
      $.while_statement,
      $.until_statement,
      $.cstyle_for_statement,
      $.for_statement,
      alias($.block, $.block_statement),
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
      $.yadayada,
    ),
    postfix_if_expression:     $ => seq($._expr, 'if',     field('condition', $._expr)),
    postfix_unless_expression: $ => seq($._expr, 'unless', field('condition', $._expr)),
    postfix_while_expression:  $ => seq($._expr, 'while',  field('condition', $._expr)),
    postfix_until_expression:  $ => seq($._expr, 'until',  field('condition', $._expr)),
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
      $.anonymous_subroutine_expression,
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
       * UNIOPSUB term */
      $.func0op_call_expression,
      $.func1op_call_expression,
      /* PMFUNC */
      $.bareword,
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
      $._range_expression,
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
    // TODO - get support for prec.nonassoc upstream b/c it really doesn't work to emulate
    // it
    _range_expression: $ => 
      prec.left(TERMPREC.DOTDOT,        binop($._DOTDOT, $._term)),


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
          field('variable', $.scalar),
          field('variable', $.array),
          field('variable', $.hash),
          field('variables', $._paren_list_of_variables)),
        optseq(':', optional(field('attributes', $.attrlist))))
    ),
    localization_expression: $ =>
      seq('local', choice(
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

    func0op_call_expression: $ =>
      seq(field('function', $.func0op), optseq('(', ')')),

    func1op_call_expression: $ =>
      prec.left(TERMPREC.UNOP, seq(
        field('function', $.func1op),
        choice(optseq('(', optional($._expr), ')'), $._term),
      )),

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
    hash:     $ => seq(token(prec(2, '%')), $._indirob),
    arraylen: $ => seq('$#', $._indirob),
    // perly.y calls this `star`
    glob:     $ => seq('*',  $._indirob),

    _indirob: $ => choice(
      $._bareword,
      // toke.c has weird code in S_scan_ident to handle the $<digits> and
      // other single-character punctuation vars like $!
      $._ident_special,
      $.scalar,
      $.block,
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
    _DOTDOT: $ => choice('..', '...'),
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

    _PHASE_NAME: $ => choice('BEGIN', 'INIT', 'CHECK', 'UNITCHECK', 'END'),

    // Anything toke.c calls FUN0 or FUN0OP; the distinction does not matter to us
    func0op: $ => choice(
      '__FILE__', '__LINE__', '__PACKAGE__', '__SUB__',
      'break', 'fork', 'getppid', 'time', 'times', 'wait', 'wantarray',
      /* TODO: all the end*ent, get*ent, set*ent, etc... */
    ),

    // Anything toke.c calls FUN1 or UNIOP; the distinction does not matter to us
    func1op: $ => choice(
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
      'tell', 'telldir', 'tied', 'uc', 'ucfirst', 'untie', 'undef', 'umask',
      'values', 'write',
      // filetest operators
      ...("rwxoRWXOezsfdlpSbctugkTBMAC".split("").map(x => "-"+x))
      /* TODO: all the set*ent */
    ),

    /****
     * Misc bits
     */

    // Would like to write  repeat1(token(/#.*/))  but we can't because of
    //   https://github.com/tree-sitter/tree-sitter/issues/1910
    comment: $ => token(/#.*(\r?\n\s*#.*)*/),

    ...primitives,
    // NOTE - not sure if this is a bug in tree-sitter, but choice here doesn't work, it
    // won't bother looking at the second choice. So we instead make one invisible node +
    // name the children appropriately
    __DATA__: $ => seq(
      alias('__DATA__', $.eof_marker),
      /.*/, // ignore til end of line - not part of the DATA filehandle
      alias($._gobbled_content, $.data_section)
    ),
    __END__: $ => seq(
      alias('__END__', $.eof_marker),
      /.*/, // ignore til end of line
      alias($._gobbled_content, $.data_section)
    ),
    _CTRL_D: $ => seq(
      alias('\x04', $.eof_marker),
      $._gobbled_content
    ),
    /* borken on windoze b/c visual studio ends the input on the literal ctrl-z in
     * parser.c -- a tree-sitter bug?
    _CTRL_Z: seq(
      alias('\x1a', $.eof_marker),
      $._gobbled_content
    ),
    */
    _identifier: $ => /[a-zA-Z_]\w*/,

    // toke.c calls this a THING and that is such a generic unhelpful word,
    // we'll call it this instead
    _literal: $ => choice(
      $.string_literal,
      $.interpolated_string_literal,
    ),

    string_literal: $ => choice($._q_string),
    _q_string: $ => seq(
      choice(
        seq('q', $._quotelike_begin),
        $._apostrophe
      ),
      repeat(choice(
        $._q_string_content,
        $.escape_sequence,
        $.escaped_delimiter,
      )),
      $._quotelike_end
    ),
    interpolated_string_literal: $ => seq(
      choice(
        seq('qq', $._quotelike_begin),
        $._double_quote
      ),
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
      'qw',
      $._quotelike_begin,
      repeat(choice($._qw_list_content, $.escape_sequence, $.escaped_delimiter)),
      $._quotelike_end
    ),

    package: $ => $._bareword,
    _version: $ => prec(1, choice($.number, $.version)),
    version: $ => /v[0-9]+(?:\.[0-9]+)*/,
    // bareword is at the very end b/c the lexer prefers tokens defined earlier in the grammar 
    bareword: $ => $._bareword,
    _bareword: $ => /[a-zA-Z_]\w*(?:::[a-zA-Z_]\w*)*/,  // TODO: unicode

    _ident_special: $ => /[0-9]+|\^[A-Z]|./,
  }
})
