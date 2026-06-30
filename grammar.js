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
  NOTOP: 4,
  LSTOP: 5,
  COMMA: 6,
  ASSIGNOP: 7,
  QUESTION_MARK: 8,
  DOTDOT: 9,
  OROR: 10,
  ANDAND: 11,
  BITOROP: 12,
  BITANDOP: 13,
  CHEQOP: 14,
  CHRELOP: 15,
  UNOP: 16,
  REQUIRE: 17,
  SHIFTOP: 18,
  ADDOP: 19,
  MULOP: 20,
  MATCHOP: 21,
  UMINUS: 22,
  POWOP: 23,
  PREINC: 24,
  POSTINC: 24,
  ARROW: 25,
  PAREN: 26,
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

const stringContent = ($, node) =>
  field('content', alias(node, $.string_content))

const regexpContent = ($, node) =>
  field('content', alias(node, $.regexp_content))

const replacement = ($, node) =>
  alias(node, $.replacement)

const trContent = ($, node) =>
  field('content', alias(node, $.transliteration_content))

const aliasMany = (to, tokens) => tokens.map(t => alias(t, to))


// Recovery-aware closers: use these instead of bare ')', ']', '}' so the
// scanner can inject a synthetic close when a statement keyword appears
// on the next line.  Defined as functions so every call-site shares the
// same grammar node (no extra states).
// NOTE: recoverBrace is only used in subscript rules (hash_element,
// slice, keyval) — NOT in block or anonymous_hash_expression, where
// block/hash ambiguity via shared _PERLY_BRACE_OPEN makes it unsafe.
const recoverParen = ($) => choice(')', alias($._RECOVER_PAREN_CLOSE, ')'))
const recoverBracket = ($) => choice(']', alias($._RECOVER_BRACKET_CLOSE, ']'))
const recoverBrace = ($) => choice('}', alias($._RECOVER_BRACE_CLOSE, '}'))
// Block-body closer: a DISTINCT recovery token from recoverBrace's subscript
// `}`.  Used only on sub/method bodies (`_body_block`).  The scanner emits
// `_RECOVER_BLOCK_CLOSE` only when a `method`/`class`/`role` keyword opens the
// next line — keywords that never legitimately nest inside a body (verified
// against ~2.4k modern-OO modules) — so a half-typed body closes just itself.
// Distinct from `_RECOVER_BRACE_CLOSE` so subscript-brace recovery is untouched.
const recoverBlock = ($) => choice('}', alias($._RECOVER_BLOCK_CLOSE, '}'))

// little helper just to keep things DRY.  `async` is a contextual keyword
// emitted by the scanner (aliased so it stays queryable/highlightable).
const subExtensions = ($) => repeat(choice('extended', alias($._KW_ASYNC, 'async')))

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
    $.primitive,
    // $.variables, // TODO - i don't know why, but these just went crazy
    $.postfix_deref,
    $.subscripted,
    $.slices,
  ],
  word: $ => $._identifier,
  inline: $ => [
    $._var_indirob,
    $._semicolon,
    $._fullstmt,
    $._else,
    $._conditionals,
    $._quotelike_end,
    $._quotelike_begin,
    $._declared_vars,
    $._interpolations,
    $._nonvar_interpolation_fallbacks,
    $._apostrophe,
    $._brace_autoquoted,
    $._version,
    $._loops,
    $._func0op,
    $._func1op,
    $._map_grep,
    $._PERLY_COMMA,
    $._KW_USE,
    $._KW_FOR,
    $._LOOPEX,
    $._PHASE_NAME,
    $._HASH_PERCENT,
    $._bareword,
    $._unambiguous_function,
  ],
  externals: $ => [
    /* ident-alikes */
    /* non-ident tokens */
    $._single_quote,
    $._double_quote,
    $._backtick_quote,
    $._search_slash_quote,
    $._no_search_slash_plz,
    $._open_readline_bracket,
    $._open_fileglob_bracket,
    $._PERLY_SEMICOLON,
    $._PERLY_HEREDOC,
    $._ctrl_z_hack,
    /* immediates */
    $._quotelike_begin_quote,
    $._quotelike_middle_close_quote,
    $._quotelike_middle_skip,
    $._quotelike_end_zw,
    $._quotelike_end_quote,
    $._q_string_content,
    $._qq_string_content,
    $.escape_sequence,
    $.escaped_delimiter,
    $._dollar_in_regexp,
    $._regexp_open_bracket,
    $._regexp_open_brace,
    $.pod,
    $._gobbled_content,
    $._attribute_value_begin,
    $.attribute_value,
    $.prototype,
    $._signature_start,
    $._heredoc_delimiter,
    $._command_heredoc_delimiter,
    $._heredoc_start,
    $._heredoc_middle,
    $.heredoc_end,
    $._fat_comma_autoquoted,
    $._fat_comma_autoquoted_ahead,
    $._filetest,
    $._brace_autoquoted_token,
    /* zero-width lookahead tokens */
    $._brace_end_zw,
    $._dollar_ident_zw,
    $._no_interp_whitespace_zw,
    /* zero-width high priority token */
    $._NONASSOC,
    /* synthetic tokens for error recovery */
    $._RECOVER_PAREN_CLOSE,
    $._RECOVER_BRACKET_CLOSE,
    $._RECOVER_BRACE_CLOSE,
    $._RECOVER_ARROW,
    $._RECOVER_BLOCK_CLOSE,
    /* opaque body of a `format NAME = ... .` declaration: from the line after
     * `=` up to and including the lone-`.` terminator line */
    $.format_content,
    /* `x` repetition operator glued to its count (`"ab"x3`) — emitted only when
     * an operator is expected, mirroring perl's XOPERATOR-state disambiguation */
    $._x_op,
    /* `class`/`role` emitted as keywords by the scanner ONLY in declaration
     * position (followed by a name); otherwise the word lexes as a bareword so
     * `role { … }`, `class($x)`, `-role` parse as ordinary calls/terms. */
    $._KW_CLASS,
    $._KW_ROLE,
    $._KW_METHOD,
    /* `async` emitted as a keyword only before `{`/`sub`/`method`; `try` only
     * before a block `{`.  Otherwise the words lex as ordinary barewords so
     * `async(...)`/`try(1,2,3)`/`try => 1` parse as calls/terms. */
    $._KW_ASYNC,
    $._KW_TRY,
    /* error condition must always be last; we don't use this in the grammar */
    $._ERROR
  ],
  extras: $ => [
    /\p{White_Space}/,
    $.comment,
    $.pod,
    $.heredoc_content,
  ],
  conflicts: $ => [
    [$.preinc_expression, $.postinc_expression],
    // all of the following go GLR b/c they need extra tokens to allow postfixy autoquotes
    [$.return_expression],
    [$.function, $.bareword],
    [$.function, $.function_call_expression],
    [$._variables, $.indirect_object],
    // a builtin filehandle after a list-op is ambiguous between the indirect
    // object slot (`print STDERR LIST`) and a plain term argument
    // (`binmode STDOUT, MODE`); GLR resolves on the following comma/term.
    [$._term, $.indirect_object],
    [$.expression_statement, $._tricky_indirob_hashref],
    [$.autoquoted_bareword],
    // nameless params need extra lookahead
    [$.optional_parameter],
    // these are all dynamic handling for continue BLOCK vs func0 b/c we don't get lookahead
    [$._loop_body],
    // we need an extra lookahead so we can correctly hide the `->` in a non-interpolating case
    [$._interp_arrow, $._interpolation_fallbacks]
  ],
  rules: {
    source_file: $ => seq(repeat($._fullstmt), optional($.__DATA__)),
    /****
     * Main grammar rules taken from perly.y.
     ****/
    _PERLY_BRACE_OPEN: $ => '{',

    block: $ => seq($._PERLY_BRACE_OPEN, repeat($._fullstmt), '}'),

    // Like `block`, but recovery-aware: accepts a synthetic `}` injected by the
    // scanner when a `method`/`class`/`role` keyword starts the next line.  Used
    // ONLY for sub/method bodies (aliased back to `block` so node names are
    // identical).  Class/role bodies stay plain `block`, which bounds recovery:
    // closing a body lands in the enclosing class block, which cannot accept the
    // synthetic `}`, so the cascade stops (no over-closing).
    _body_block: $ => seq($._PERLY_BRACE_OPEN, repeat($._fullstmt), recoverBlock($)),

    _fullstmt: $ => choice($._barestmt, $.statement_label),

    // perly.y calls this labfullstmt
    statement_label: $ => seq(field('label', choice($.identifier, alias($._PHASE_NAME, $.identifier))), ':', field('statement', $._fullstmt)),
    _semicolon: $ => choice(';', $._PERLY_SEMICOLON),

    _barestmt: $ => choice(
      $.package_statement,
      $.class_statement,
      $.role_statement,
      $.class_phaser_statement,
      $.use_version_statement,
      $.use_statement,
      $.subroutine_declaration_statement,
      $.method_declaration_statement,
      $.phaser_statement,
      $.format_statement,
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
      seq(alias($._KW_CLASS, "class"),
        field('name', $.package),
        optional(field('version', $._version)),
        optseq(':', optional(field('attributes', $.attrlist))),
        $._semicolon),
      seq(alias($._KW_CLASS, "class"),
        field('name', $.package),
        optional(field('version', $._version)),
        optseq(':', optional(field('attributes', $.attrlist))),
        $.block),
    ),
    role_statement: $ => choice(
      seq(alias($._KW_ROLE, "role"),
        field('name', $.package),
        optional(field('version', $._version)),
        optseq(':', optional(field('attributes', $.attrlist))),
        $._semicolon),
      seq(alias($._KW_ROLE, "role"),
        field('name', $.package),
        optional(field('version', $._version)),
        optseq(':', optional(field('attributes', $.attrlist))),
        $.block),
    ),
    /* `format NAME = <newline> BODY .` — NAME defaults to STDOUT and is
     * optional. The body (picture/argument lines up to a lone `.`) is opaque
     * content read by the external scanner. */
    format_statement: $ => seq(
      'format',
      optional(field('name', $.bareword)),
      '=',
      $.format_content,
    ),
    class_phaser_statement: $ => seq(
      field('phase', choice('BUILD', 'ADJUST')),
      optseq(':', optional(field('attributes', $.attrlist))),
      optional($.signature),
      $.block
    ),
    use_version_statement: $ => seq($._KW_USE, field('version', $._version), $._semicolon),
    use_statement: $ => seq(
      $._KW_USE,
      field('module', $.package),
      optional(field('version', $._version)),
      optional($._listexpr),
      $._semicolon
    ),

    mandatory_parameter: $ => alias(choice('$', $._signature_scalar), $.scalar),
    optional_parameter: $ => choice(
      seq(
        alias($._signature_scalar, $.scalar),
        choice('=', '||=', '//='),
        field('default', $._term),
      ),
      seq(
        alias('$', $.scalar),
        choice('=', '||=', '//='),
        field('default', optional($._term))
      )
    ),
    named_parameter: $ => seq(
      ':',
      alias($._signature_scalar, $.scalar),
      optseq(
        choice('=', '||=', '//='),
        field('default', $._term),
      )
    ),

    slurpy_parameter: $ => choice(
      alias(choice('@', $._signature_array), $.array),
      alias(choice($._HASH_PERCENT, $._signature_hash), $.hash)
    ),

    _signature_vars: $ => choice(
      $.mandatory_parameter,
      $.optional_parameter,
      $.slurpy_parameter,
      $.named_parameter,
    ),


    signature: $ => seq(
      alias($._signature_start, '('),
      // we don't bother being strict about the order b/c too much work
      repeat(seq(
        $._signature_vars,
        optseq(',', optional($._signature_vars)))
      ),
      ')'
    ),
    subroutine_declaration_statement: $ => seq(
      optional(choice(field('lexical', choice('my', 'state')), 'our')),
      subExtensions($),
      'sub',
      field('name', $.bareword),
      $._sub_decl_tail,
    ),

    method_declaration_statement: $ => seq(
      optional(choice(field('lexical', choice('my', 'state')), 'our')),
      subExtensions($),
      alias($._KW_METHOD, "method"),
      field('name', $.bareword),
      $._sub_decl_tail,
    ),

    // A *named* sub/method declaration may be a forward declaration (no body,
    // just `;`) as well as a definition — `sub foo;`, `sub foo :attr;`,
    // `sub foo ($sig);`. Anonymous subs always need a body, so they keep
    // `_anon_sub_tail`; here we allow either a body or a terminating `;`.
    _sub_decl_tail: $ => seq(
      optseq(':', optional(field('attributes', $.attrlist))),
      optional(choice($.prototype, $.signature)),
      choice(field('body', alias($._body_block, $.block)), $._semicolon),
    ),

    // perly.y's grammar just considers a phaser to be a `sub` with a special
    // name and lacking the `sub` keyword, but most tree consumers are likely
    // to care about distinguishing it
    phaser_statement: $ => seq(field('phase', $._PHASE_NAME), alias($._body_block, $.block)),

    conditional_statement: $ =>
      seq($._conditionals, '(', field('condition', $._expr), ')',
        field('block', alias($._body_block, $.block)),
        optional($._else)
      ),
    _loop_body: $ => seq(field('block', alias($._body_block, $.block)), optseq('continue', field('continue', alias($._body_block, $.block)))),
    loop_statement: $ => seq($._loops, '(', field('condition', $._expr), ')', $._loop_body),
    cstyle_for_statement: $ =>
      seq($._KW_FOR,
        '(',
        field('initialiser', $._barestmt),
        field('condition', $._barestmt),
        field('iterator', optional($._expr)),
        ')',
        $._loop_body
      ),
    _for_initializer: $ => choice(
      seq(optional(choice('my', 'state', 'our')), field('variable', $.scalar)),
      seq(optional(choice('my', 'state', 'our')), field('variable', $.refalias_variable)),
      seq('my', field('variables', paren_list_of($.scalar))),
    ),
    for_statement: $ =>
      seq($._KW_FOR,
        optional($._for_initializer),
        '(', field('list', $._expr), ')',
        $._loop_body
      ),

    try_statement: $ => seq(
      alias($._KW_TRY, 'try'),
      field('try_block', alias($._body_block, $.block)),
      // regular perl only permits catch(VAR) but we get easy compatibility
      // with Syntax::Keyword::Try too by being a bit more flexible
      optseq('catch', optseq('(', field('catch_expr', $._expr), ')'),
        field('catch_block', alias($._body_block, $.block))),
      optseq('finally',
        field('finally_block', alias($._body_block, $.block))),
    ),

    defer_statement: $ => seq(
      'defer',
      field('block', alias($._body_block, $.block)),
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
    else: $ => seq('else', field('block', alias($._body_block, $.block))),
    elsif: $ =>
      seq('elsif', '(', field('condition', $._expr), ')',
        field('block', alias($._body_block, $.block)),
        optional($._else)
      ),

    _expr: $ => choice($.lowprec_logical_expression, $._listexpr),
    lowprec_logical_expression: $ => choice(
      prec.left(TERMPREC.ANDOP, binop('and', $._expr)),
      prec.left(TERMPREC.OROP, binop(choice('or', 'xor'), $._expr)),
    ),

    /* A parenless list operator gobbles everything to its right
     * (`return bless {}, $class` ≡ `return bless({}, $class)`), so at a comma
     * the parser must ALWAYS continue the innermost open list, never close a
     * call and let the comma escape to an enclosing return/list. We force that
     * branch statically: the `_term` production here is prec.right, so the
     * equal-precedence shift/reduce against `_term_rightward`'s comma resolves
     * toward the shift (right-assoc reduce = prefer shift) and the escape
     * readings are never even forked. Which consumer owns the finished flat
     * list stays deterministic — it reduces to whatever's below it on the
     * stack, which is exactly the innermost list-taker. */
    _listexpr: $ => choice(
      alias($._term_rightward, $.list_expression),
      prec.right($._term)
    ),
    /* one flat list: internal commas plus an optional trailing one.  The trailing
     * slot is at the END, not an interior `optional` after every comma — an
     * interior empty slot competes with a `++`/`--` after a comma and the
     * `prec.right` gobble closes the list instead (so `push @a, ++$x` reads `++`
     * as a postfix).  Slot-at-end forces `++` to shift as a prefix; `,,` empties
     * (sitting before a comma) still reduce. */
    _term_rightward: $ => prec.right(seq(
      $._term, $._PERLY_COMMA,
      repeat(seq(optional($._term), $._PERLY_COMMA)),
      optional($._term),
    )),

    subscripted: $ => choice(
      $.glob_slot_expression,
      $.array_element_expression,
      $.hash_element_expression,
      $.coderef_call_expression,
      $.anonymous_slice_expression,
    ),

    // NOTE - we have container_variable as a named node so we can match against it nicely
    // for highlighting. We raise its prec b/c in a print (print $thing{stuff}) it becomes a var
    // not an indirob
    container_variable: $ => prec(2, seq('$', $._var_indirob)),
    _glob_slot_subscript: $ => seq('{', $._hash_key, '}'),
    glob_slot_expression: $ => choice(
      seq($.glob, $._glob_slot_subscript),
      prec.left(TERMPREC.ARROW, seq($._term, '->', '*', $._glob_slot_subscript)),
    ),
    _index_subscript: $ => seq('[', field('index', $._expr), recoverBracket($)),
    _key_subscript: $ => seq('{', field('key', $._hash_key), recoverBrace($)),
    _args_subscript: $ => seq('(', optional(field('arguments', $._expr)), recoverParen($)),
    array_element_expression: $ => choice(
      // perly.y matches scalar '[' expr ']' here but that would yield a scalar var node
      seq(field('array', $.container_variable), $._index_subscript),
      prec.left(TERMPREC.ARROW, seq($._term, '->', $._index_subscript)),
      seq($.subscripted, $._index_subscript),
    ),
    _hash_key: $ => choice($._brace_autoquoted, $._expr),
    hash_element_expression: $ => choice(
      // perly.y matches scalar '{' expr '}' here but that would yield a scalar var node
      seq(field('hash', $.container_variable), $._key_subscript),
      prec.left(TERMPREC.ARROW, seq($._term, '->', $._key_subscript)),
      seq($.subscripted, $._key_subscript),
    ),
    coderef_call_expression: $ => choice(
      prec.left(TERMPREC.ARROW, seq($._term, '->', $._args_subscript)),
      seq($.subscripted, $._args_subscript),
    ),
    _anon_slice_subscript: $ => seq('[', $._expr, ']'),
    anonymous_slice_expression: $ => choice(
      seq('(', optional(field('list', $._expr)), ')', $._anon_slice_subscript),
      seq(field('list', $.quoted_word_list), $._anon_slice_subscript),
    ),

    slices: $ => choice(
      $.slice_expression,
      $.keyval_expression,
    ),
    _slice_index_subscript: $ => seq('[', $._expr, recoverBracket($)),
    _slice_key_subscript: $ => seq('{', $._hash_key, recoverBrace($)),
    slice_container_variable: $ => seq('@', $._var_indirob),
    slice_expression: $ => choice(
      seq(field('array', $.slice_container_variable), $._slice_index_subscript),
      seq(field('hash', $.slice_container_variable), $._slice_key_subscript),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $._term), '->', '@', $._slice_index_subscript)),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref', $._term), '->', '@', $._slice_key_subscript)),
    ),
    keyval_container_variable: $ => seq($._HASH_PERCENT, $._var_indirob),
    keyval_expression: $ => choice(
      seq(field('array', $.keyval_container_variable), $._slice_index_subscript),
      seq(field('hash', $.keyval_container_variable), $._slice_key_subscript),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $._term), '->', '%', $._slice_index_subscript)),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref', $._term), '->', '%', $._slice_key_subscript)),
    ),

    _term: $ => choice(
      $.readline_expression,
      $.fileglob_expression,
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
      $.async_block_expression,
      $.do_expression,
      $.eval_expression,
      $.await_expression,
      $.conditional_expression,
      $.refgen_expression,
      $.localization_expression,
      seq('(', $._expr, ')'),
      $.quoted_word_list,
      $.heredoc_token,
      $.command_heredoc_token,
      $.stub_expression,
      // all the variable handlings
      $._variables,
      $.subscripted,
      $.slices,
      $.postfix_deref,

      $.loopex_expression,
      $.goto_expression,
      $.return_expression,
      $.undef_expression,
      /* NOTOP listexpr */
      $.logical_not_expression,
      /* UNIOP
       * UNIOP block
       * UNIOP term
       */
      $.require_expression,
      $.require_version_expression,
      /* UNIOPSUB
       * UNIOPSUB term */
      $.func0op_call_expression,
      $.func1op_call_expression,
      $.map_grep_expression,
      $.sort_expression,
      /* PMFUNC */
      alias($._builtin_filehandle, $.filehandle),
      $.bareword,
      // builtin list-op words used as a bare term (e.g. `die if …`, `print;`)
      // need a standalone reading too, since they're otherwise only reachable
      // through the list-op function-call branches. They're unambiguously
      // builtins, so emit `function`, not `bareword`.
      alias(choice($._listop_keyword, $._indirob_listop), $.function),
      $.autoquoted_bareword,
      $._listop,

      /* perly.y doesn't know about `my` because that is handled weirdly in
       * toke.c but we'll have to do it differently here
       */
      $.variable_declaration,

      // legacy
      $.primitive,

      $._literal,
    ),

    // this does NOT take an indirob, it only takes a single scalar. what we'll have to do
    // is create an external token which does the lookahead to decide if what we've got
    // is a readline or a fileglob, and both are win b/c we need it higher priority than
    // the normal `<` which makes this guy parse as a binop
    readline_expression: $ => choice(
      seq(
        field('operator', alias($._open_readline_bracket, '<')),
        optional(alias(choice($.scalar, $.bareword), $.filehandle)),
        field('operator', '>')
      ),
      field('operator', seq('<<', token.immediate('>>'))),
    ),
    fileglob_expression: $ => seq(
      field('operator', alias($._open_fileglob_bracket, '<')),
      stringContent($, $._interpolated_string_content),
      field('operator', alias($._quotelike_end, '>'))
    ),
    assignment_expression: $ => prec.right(TERMPREC.ASSIGNOP,
      binop(
        choice( // _ASSIGNOP
          // The compound-assigns starting with a sigil char (`*` `%` `&`) need
          // higher lexer prec than the `*`/`%`/`&` sigils (`_GLOB_STAR`/
          // `_HASH_PERCENT`/`_SUB_AMPER`, all prec 2) so that after a bareword in
          // term position (`FOO **= 1`, `FOO %= 1`, `FOO &= 1`, …) the operator
          // wins on longest-match instead of the leading sigil char being eaten
          // as a `*glob`/`%hash`/`&sub` sigil (which orphaned the tail into ERROR).
          '=', token(prec(2, '**=')),
          '+=', '-=', '.=',
          token(prec(2, '*=')), '/=', token(prec(2, '%=')), 'x=',
          token(prec(2, '&=')), '|=', '^=',
          // TODO: Also &.= |.= ^.= when enabled
          '<<=', '>>=',
          token(prec(2, '&&=')), '||=', '//=',
        ),
        $._term
      )
    ),

    binary_expression: $ => {
      const table = [
        [prec.right, binop.nonassoc, choice('..', '...'), TERMPREC.DOTDOT], // _DOTDOT
        // `**` needs higher lexer prec than the `*` glob sigil (`_GLOB_STAR`,
        // prec 2) so `FOO ** 2` after a bareword isn't mis-lexed as a `*glob`.
        [prec.right, binop, token(prec(2, '**')), TERMPREC.POWOP], // _POWOP
        [prec.left, binop, choice('||', '//', '^^'), TERMPREC.OROR], // _OROR_DORDOR
        // `&&` needs higher lexer prec than the `&` sub sigil (`_SUB_AMPER`,
        // prec 2) so that after a bareword in term position (`FOO && 1`) the
        // logical-and operator wins instead of the leading `&` being eaten as
        // a sub-call sigil (which orphaned the trailing `& 1` into an ERROR).
        [prec.left, binop, token(prec(2, '&&')), TERMPREC.ANDAND], // _ANDAND
        [prec.left, binop, choice('|', '^'), TERMPREC.BITOROP], // _BITORDOP
        [prec.left, binop, '&', TERMPREC.BITANDOP], // _BITANDOP
        [prec.left, binop, choice('<<', '>>'), TERMPREC.SHIFTOP], // _SHIFTOP
        [prec.left, binop, choice('+', '-', '.'), TERMPREC.ADDOP], // _ADDOP
        [prec.left, binop, choice('*', '/', '%', 'x', alias($._x_op, 'x')), TERMPREC.MULOP], // _MULOP
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
        prec.left(TERMPREC.CHEQOP, binop(choice('==', '!=', 'eq', '===', 'equ', 'eqr', 'ne'), $._term)), // _CHEQOP
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
    // perly.y models this as `term: NOTOP listexpr`, so unlike `and`/`or`/`xor`
    // (which live in lowprec_logical_expression at the _expr level) `not` is a
    // _term and may appear e.g. on the RHS of an assignment. Its operand is a
    // listexpr, so it binds looser than the comma but tighter than and/or.
    logical_not_expression: $ =>
      prec.right(TERMPREC.NOTOP, unop_pre('not', $._listexpr)),
    preinc_expression: $ =>
      prec(TERMPREC.PREINC, unop_pre(choice('++', '--'), $._term)),
    postinc_expression: $ =>
      prec(TERMPREC.POSTINC, unop_post(choice('++', '--'), $._term)),

    conditional_expression: $ => prec.right(TERMPREC.QUESTION_MARK, seq(
      field('condition', $._term), '?', field('consequent', $._term), ':', field('alternative', $._term)
    )),

    refgen_expression: $ => prec.left(TERMPREC.UMINUS, seq('\\', choice(alias($.amper_sub, $.function), $._term))), // _REFGEN

    anonymous_array_expression: $ => seq(
      '[', optional($._expr), recoverBracket($)
    ),

    // we use the precedence here to ensure that we turn map { q'thingy" => $_ } into a hashref
    // it just needs to be arbitrarily higher than the _literal rule.
    // The tail mirrors `_term_rightward` (flat list + empty/trailing slots) rather
    // than delegating to `_listexpr` — a delegated `_listexpr` can't begin with a
    // comma, so `{ hi =>, 'thing' }` (a fat comma followed by an empty slot, valid
    // Perl) used to error. Inlining the empty-slot-aware repeat also flattens the
    // list instead of nesting a second `list_expression` after the first comma.
    _tricky_list: $ => prec.right(1, seq(
      choice($.string_literal, $.interpolated_string_literal, $.command_string, $.autoquoted_bareword, $.number),
      $._PERLY_COMMA,
      repeat(seq(optional($._term), $._PERLY_COMMA)),
      optional($._term),
    )),
    anonymous_hash_expression: $ => choice(
      seq($._PERLY_BRACE_OPEN, $._expr, '}'),
      // an empty top-level block is a hashref
      prec(1, seq($._PERLY_BRACE_OPEN, '}')),
      // and if the hash starts w/ most quoted strings it's a hashref
      seq($._PERLY_BRACE_OPEN, alias($._tricky_list, $.list_expression), '}'),
    ),

    _anon_sub_tail: $ => seq(
      optseq(':', optional(field('attributes', $.attrlist))),
      optional(choice($.prototype, $.signature)),
      field('body', $.block),
    ),

    anonymous_subroutine_expression: $ => seq(
      subExtensions($),
      'sub',
      $._anon_sub_tail,
    ),

    anonymous_method_expression: $ => seq(
      subExtensions($),
      alias($._KW_METHOD, "method"),
      $._anon_sub_tail,
    ),

    // `async { … }` block (threads::async — a bare block run as an anon sub).
    // The scanner emits `_KW_ASYNC` here only before a `{`, so `async`/`async(...)`
    // as a plain sub stays an ordinary call.
    async_block_expression: $ => seq(
      alias($._KW_ASYNC, 'async'),
      $.block,
    ),

    // do FILENAME is more of an eval, so we parse it as eval_expression w/ a filename
    // node inside
    do_expression: $ => choice(seq('do', $.block)),
    eval_expression: $ => prec.left(TERMPREC.UNOP,
      choice(
        // bare `eval` (no arg) defaults to `$_` (`map { eval } @list`);
        // `prec.left` resolves the resulting `eval` • term shift/reduce.
        seq('eval', optional(choice($.block, $._term))),
        seq('do', alias($._term, $.filename))
      )
    ),
    await_expression: $ => seq('await', $._term),

    _declared_vars: $ => choice(
      alias($._declare_scalar, $.scalar),
      alias($._declare_array, $.array),
      alias($._declare_hash, $.hash),
    ),

    // refaliasing: `\$x`, `\@a`, `\%h` as a declaration or for-loop iterator.
    //
    // This is its own visible node (not just a `refgen_expression`) on purpose:
    // a `\`-var after `my`/`state`/`our` or in a for-iterator can *only* be a
    // refalias, so the distinct node is a real syntactic category, not a
    // semantic overlay -- and refaliasing has different binding semantics that
    // downstream consumers should see. (In `\$x = ...` assignment the `\` is a
    // genuine refgen lvalue, exactly as Perl parses it, so that case stays a
    // `refgen_expression`; refalias-there is positional. The node boundary
    // tracks where the grammar actually disambiguates.)
    //
    // it's not folded under other _declared_vars b/c you need to guard against REVERSE
    // SOLIDUS RECUSRION
    refalias_variable: $ => seq('\\', $._declared_vars),

    variable_declaration: $ => prec.left(TERMPREC.QUESTION_MARK + 1,
      seq(
        choice('my', 'state', 'our', 'field'),
        choice(
          // typed lexical: `my Dog $spot` — an optional class/type name (a
          // package name, possibly `::`-qualified) before the variable.
          // Unambiguous: the variable always starts with a sigil, never a bareword.
          seq(optional(field('type', $.package)), field('variable', $._declared_vars)),
          field('variable', $.refalias_variable),
          field('variables', $._decl_variable_list)),
        optseq(':', optional(field('attributes', $.attrlist))))
    ),

    _decl_variable_list: $ => seq('(', optional($._decl_variable_list_body), ')'),

    // The body intentionally avoids `paren_list_of`'s leading-`optional(rule)`
    // shape: that admits an empty leading element, which collides with a nested
    // `(` group opener and makes tree-sitter drop the group shift. Requiring the
    // first element (while still allowing empty/trailing slots after a comma)
    // keeps the nested-group `(` unambiguous.
    _decl_variable_list_body: $ => seq(
      $._decl_variable_list_element,
      repeat(seq(',', optional($._decl_variable_list_element)))
    ),

    _decl_variable_list_element: $ => choice(
      $.undef_expression,
      $._declared_vars,
      $.refalias_variable,
      // a nested parenthesized group: perl flattens `my ($a, ($b, $c))` to
      // `my ($a, $b, $c)`, so structurally the inner `( ... )` is just another
      // (recursive) variable list.
      $.variable_group
    ),

    variable_group: $ => seq('(', optional($._decl_variable_list_body), ')'),

    localization_expression: $ =>
      prec(TERMPREC.UNOP, seq(choice('local', 'dynamically'), $._term)),

    // this has negative prec b/c it's only if the parens weren't eaten elsewhere
    stub_expression: $ => prec(-1, seq('(', ')')),

    postfix_deref: $ => choice(
      $.scalar_deref_expression,
      $.array_deref_expression,
      $.arraylen_deref_expression,
      $.hash_deref_expression,
      $.amper_deref_expression,
      $.glob_deref_expression,
    ),
    scalar_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '$', '*')),
    array_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '@', '*')),
    arraylen_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '$#', '*')),
    hash_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '%', '*')),
    amper_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '&', '*')),
    glob_deref_expression: $ =>
      prec.left(TERMPREC.ARROW, seq($._term, '->', '*', '*')),

    require_expression: $ =>
      prec.left(TERMPREC.REQUIRE, seq('require', $._term)),
    require_version_expression: $ =>
      prec.left(TERMPREC.REQUIRE, seq('require', field('version', $._version))),

    func0op_call_expression: $ =>
      seq(field('function', $._func0op), optseq('(', ')')),

    func1op_call_expression: $ =>
      prec.left(TERMPREC.UNOP, seq(
        field('function', $._func1op),
        choice(optseq('(', optional($._expr), ')'), $._term),
      )),

    _map_grep: $ => choice('map', 'grep'),
    map_grep_expression: $ => prec.left(TERMPREC.LSTOP, choice(
      seq($._map_grep, field('callback', $.block), field('list', $._listexpr)),
      seq($._map_grep, field('callback', $._term), $._PERLY_COMMA, field('list', $._listexpr)),
      seq($._map_grep, '(', $._NONASSOC, field('callback', $._term), $._PERLY_COMMA, field('list', $._listexpr), ')'),
      seq($._map_grep, '(', $._NONASSOC, field('callback', $.block), field('list', $._listexpr), ')'),
    )),

    // - we support sort SUBNAME as follows - if there's a bareword and no comma, it's
    // automatically used as the callback, as per the perl docs. the callback can be
    // either a block, a bareword or a scalar. we don't bother with _tricky_hashref b/c
    // its sufficiently unlikely that somone is trying to numerical sort a single
    // hashref
    _sort_routine: $ => choice(prec(1, alias($._bareword, $.function)), $.block, prec(1, $.scalar)),
    sort_expression: $ => prec.left(TERMPREC.LSTOP, choice(
      seq('sort', optional(field('callback', $._sort_routine)), field('list', $._listexpr)),
      seq('sort', '(', $._NONASSOC, optional(field('callback', $._sort_routine)), field('list', $._listexpr), ')'),
    )),


    _label_arg: $ => choice(alias($.identifier, $.label), $._term),
    loopex_expression: $ =>
      prec.left(TERMPREC.LOOPEX, seq(field('loopex', $._LOOPEX), optional($._label_arg))),
    goto_expression: $ =>
      prec.left(TERMPREC.LOOPEX, seq('goto', $._label_arg)),
    return_expression: $ => prec(TERMPREC.LSTOP, seq('return', optional($._listexpr))),

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

    indirect_object: $ => choice(
      // We punt on *arbitrary* bareword filehandles (can't know what subs are
      // defined), but the standard predefined handles are a safe closed set —
      // nobody sanely defines `sub STDOUT` — so we accept those.
      alias($._builtin_filehandle, $.filehandle),
      $.block,
      // this may be kinda evil, but we use this token as a flag to not accept a search slash
      seq($.scalar, optional($._no_search_slash_plz)),
    ),
    // Perl's predefined filehandles. A closed set, so recognizing them as
    // filehandles (in the indirect-object slot and as filetest/func1 operands)
    // can't collide with a user sub. Non-standard bareword handles are punted.
    _builtin_filehandle: $ => choice('STDIN', 'STDOUT', 'STDERR'),
    _unambiguous_function: $ => alias(choice($._bareword, $._listop_keyword, $._indirob_listop, $.amper_sub), $.function),
    function_call_expression: $ => choice(
      seq(field('function', alias($.amper_sub, $.function))),
      // the usage of NONASSOC here is to make it that any parse of a paren after a func
      // automatically becomes a non-ambiguous function call
      seq(field('function', $._unambiguous_function), '(', $._NONASSOC, optional(field('arguments', $._expr)), recoverParen($)),
      // The indirect-object call form `FUNC(INDIROB ARGS)` is only valid for the
      // indirob set (print/printf/say/exec/system) and userland barewords — NOT
      // the other builtin list-ops. Otherwise `bless({%$arg}, $class)` reads its
      // leading `{…}` as a block indirect-object instead of a hashref argument.
      // Listed as the disjoint pieces (`_indirob_listop` direct, the named
      // `function` rule for barewords) rather than one combined alias, so a
      // keyword reduces to a single hidden rule (no reduce/reduce that would
      // starve print's indirob in favor of the hashref reading).
      seq(field('function', alias($._indirob_listop, $.function)), '(', $._NONASSOC, $.indirect_object, field('arguments', $._expr), recoverParen($)),
      seq(field('function', $.function), '(', $._NONASSOC, $.indirect_object, field('arguments', $._expr), recoverParen($)),
    ),
    _tricky_indirob_hashref: $ => seq($._PERLY_BRACE_OPEN, $._expr, $._PERLY_SEMICOLON, '}'),
    ambiguous_function_call_expression: $ =>
      // we need the right precedence here so we can read ahead for the hash/sub disambiguation
      prec.right(TERMPREC.LSTOP,
        choice(
          // The no-paren list-op form. Builtin LIST operators (print, split,
          // join, …) keep regex-after-bareword behavior (`split /,/`, `print
          // /x/`). For generic/userland barewords we apply PPI's heuristic: a
          // following `/` is division by default, NOT a regex. The
          // `_no_search_slash_plz` marker suppresses the search-slash token so
          // `FOO / 1.05` lexes the `/` as division (the bareword then falls
          // through to a plain term in a binary_expression). This sacrifices
          // `myfunc /x/` (becomes division), but `myfunc(/x/)` is unaffected
          // (parens make it unambiguous).
          seq(field('function', alias($._listop_keyword, $.function)), field('arguments', $._listexpr)),
          seq(field('function', alias($._indirob_listop, $.function)), field('arguments', $._listexpr)),
          seq(field('function', $.function), optional($._no_search_slash_plz), field('arguments', $._listexpr)),
          seq(field('function', $.function), $.indirect_object, field('arguments', $._listexpr)),
          seq(field('function', alias($._indirob_listop, $.function)), $.indirect_object, field('arguments', $._listexpr)),
          // we handle this_takes_a_block { thing; other_thing }; here. we don't wanna accept an indirob of scalar tho
          seq(field('function', $.function), alias($.block, $.indirect_object)),
          // we handle cases like takes_a_hash { 1 => 2 }; by having this special case
          seq(field('function', $.function), field('arguments', alias($._tricky_indirob_hashref, $.anonymous_hash_expression)), optseq($._PERLY_COMMA, field('arguments', $._listexpr)))
        )
      ),
    // Builtin LIST operators. This is the `@function.builtin` list-op set from
    // queries/highlights.scm, minus words that already have dedicated grammar
    // handling (return → return_expression, sort → sort_expression) which would
    // otherwise create unresolved conflicts.
    //
    // DESIGN NOTE — why these are folded into `ambiguous_function_call_expression`
    // (aliased to `function`) rather than getting their own `listop_call_expression`
    // node like func0op/func1op/sort do:
    //   This token exists ONLY to control one thing — the search-slash heuristic
    //   above (a `/` after a builtin list-op stays a regex: `split /,/`, `print
    //   /x/`; after a generic bareword it's division). It is NOT meant to claim
    //   these are "really" ambiguous. A dedicated node would read more cleanly,
    //   BUT it isn't worth it: (a) it renames the node for every `print`/`split`/…
    //   call, a breaking change for tree consumers, and (b) it costs ~+46 large
    //   states (the no-paren call shapes — args / indirect-object / block-indirob
    //   / hashref — have to be duplicated for the new node). So we reuse the
    //   existing call machinery and only split the one search-slash-sensitive arg
    //   branch. The `function` alias keeps the emitted node identical to a plain
    //   bareword call.
    // The builtin list-ops that take a no-comma indirect object `FUNC {EXPR} LIST`
    // (perlfunc): print/printf/say take a filehandle there, exec/system the
    // program. Only these get the block/filehandle-indirob branch — for every
    // other list-op (bless, join, push, …) a `{…}` is a hashref argument, not an
    // indirect object. (sort's `{$a<=>$b}` comparator is its own rule.)
    _indirob_listop: $ => choice('print', 'printf', 'say', 'exec', 'system'),
    // NB: the no-comma-indirect-object list-ops (print/printf/say/exec/system)
    // live in `_indirob_listop`, NOT here — the two sets are kept disjoint so a
    // keyword reduces to exactly one hidden rule (overlap = reduce/reduce
    // conflict). Use `choice($._listop_keyword, $._indirob_listop)` where you
    // want "any builtin list-op".
    _listop_keyword: $ => choice(
      'accept', 'atan2', 'bind', 'binmode', 'bless', 'crypt', 'chmod', 'chown',
      'connect', 'die', 'dbmopen', 'fcntl', 'flock', 'getpriority',
      'getprotobynumber', 'gethostbyaddr', 'getnetbyaddr', 'getservbyname',
      'getservbyport', 'getsockopt', 'glob', 'index', 'ioctl', 'join', 'kill',
      'link', 'listen', 'mkdir', 'msgctl', 'msgget', 'msgrcv', 'msgsend',
      'opendir', 'push', 'pack', 'pipe', 'rename', 'rindex',
      'read', 'recv', 'reverse', 'select', 'seek', 'semctl', 'semget',
      'semop', 'send', 'setpgrp', 'setpriority', 'seekdir', 'setsockopt',
      'shmctl', 'shmread', 'shmwrite', 'shutdown', 'socket', 'socketpair',
      'split', 'sprintf', 'splice', 'substr', 'symlink', 'syscall',
      'sysopen', 'sysseek', 'sysread', 'syswrite', 'tie', 'truncate', 'unlink',
      'unpack', 'utime', 'unshift', 'vec', 'warn', 'waitpid', 'formline', 'open'
    ),
    // we only parse a function if it won't be an indirob
    function: $ => $._bareword,

    method_call_expression: $ => prec.left(TERMPREC.ARROW, seq(
      field('invocant', $._term),
      '->',
      optional('&'),
      field('method', $.method),
      optional($._args_subscript)
    )),
    method: $ => choice($._bareword, $.scalar, $._RECOVER_ARROW),

    _variables: $ => choice(
      $.scalar,
      $.array,
      $.hash,
      $.arraylen,
      $.glob,
    ),
    _signature_varname: $ => alias($._identifier, $.varname),
    scalar: $ => seq('$', $._var_indirob),
    _declare_scalar: $ => seq('$', choice($.varname, $._var_indirob_autoquote)),
    _signature_scalar: $ => seq('$', $._signature_varname),
    array: $ => seq('@', $._var_indirob),
    _declare_array: $ => seq('@', choice($.varname, $._var_indirob_autoquote)),
    _signature_array: $ => seq('@', $._signature_varname),
    // these need to have higher prec than the equivalent operator symbols
    _HASH_PERCENT: $ => alias(token(prec(2, '%')), '%'), // self-aliasing b/c token
    _SUB_AMPER: $ => alias(token(prec(2, '&')), '&'), // self-aliasing b/c token
    _GLOB_STAR: $ => alias(token(prec(2, '*')), '*'), // self-aliasing b/c token

    hash: $ => seq($._HASH_PERCENT, $._var_indirob),
    _declare_hash: $ => seq($._HASH_PERCENT, choice($.varname, $._var_indirob_autoquote)),
    _signature_hash: $ => seq($._HASH_PERCENT, $._signature_varname),

    arraylen: $ => seq('$#', $._var_indirob),
    // Like amper_sub: a braced-block glob target (`*{$x}`, `*{"Foo::$s"}`,
    // `*{ EXPR }`) is a glob dereference of whatever EXPR yields, not the glob's
    // literal name — so emit the target as a deref instead of burying it in
    // varname. `*foo` / `*$ref` / `*{name}` keep their varname reading.
    glob: $ => seq($._GLOB_STAR, choice(
      alias($._amper_indirob, $.varname),
      $._var_indirob_autoquote,
      alias($._code_deref, $.glob_deref_expression),
    )),

    // NOTE - amper_sub does NOT go into variable, b/c it's always a function call
    // unless it got refgen-ed
    amper_sub: $ => seq($._SUB_AMPER, choice(
      // &foo / &$ref / &$punct — the name (or scalar) slot of a sub call
      alias($._amper_indirob, $.varname),
      // &{name} — a braced bareword autoquotes to a sub name (perl calls sub `name`)
      $._var_indirob_autoquote,
      // &{ EXPR } — a real code-dereference of whatever EXPR yields (a coderef in
      // a scalar, a symbolic name from a string, or a code block). A distinct node
      // lets consumers tell this from "call the sub literally named NAME".
      alias($._code_deref, $.code_deref_expression),
    )),
    // _indirob minus the block arm; the braced-block case becomes code_deref
    _amper_indirob: $ => choice($._bareword, $._ident_special, $.scalar),
    _code_deref: $ => $.block,

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
      alias(choice($._brace_autoquoted_token, $._bareword, $._special_var_name, /\^\w+/), $.varname),
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

    _PHASE_NAME: $ => choice('BEGIN', 'INIT', 'CHECK', 'UNITCHECK', 'END'),

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
      // filetest operators - we alias b/c otherwise the highlight query won't work
      alias($._filetest, '-x')
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
      // v-strings in expression position require at least one dot.  A bare `vN`
      // is ambiguous — perl parses it as a function call when a `sub vN` is in
      // scope, else as a v-string — so we leave the single-token form a bareword
      // and only claim the unambiguous dotted form (`v5.6.0`), which can't be a
      // call.  `use`/`package`/`require` keep the permissive `version` token.
      alias(token(prec(1, /v[0-9]+(?:\.[0-9]+)+/)), $.version),
    ),

    // we cast these into imaginary tokens to be quote chars with handedness
    _apostrophe: $ => alias($._single_quote, "'"),
    _quotation_mark: $ => alias($._double_quote, "'"),
    _backtick: $ => alias($._backtick_quote, "'"),
    _search_slash: $ => alias($._search_slash_quote, "'"),
    _quotelike_begin: $ => alias($._quotelike_begin_quote, "'"),
    _quotelike_middle_close: $ => alias($._quotelike_middle_close_quote, "'"),
    _quotelike_end: $ => alias($._quotelike_end_quote, "'"),
    // NOTE - we may need MOAR specific captures depending on how editors handle the
    // multi-part quotes
    _quotelike_middle: $ => seq(
      $._quotelike_middle_close,
      choice($._quotelike_middle_skip, $._quotelike_begin),
    ),

    string_literal: $ => seq(
      choice(
        seq('q', $._quotelike_begin),
        $._apostrophe
      ),
      optional(stringContent($, $._noninterpolated_string_content)),
      $._quotelike_end
    ),
    interpolated_string_literal: $ => seq(
      choice(
        seq('qq', $._quotelike_begin),
        $._quotation_mark
      ),
      optional(stringContent($, $._interpolated_string_content)),
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

    _interp_arrow: $ => token.immediate('->'),

    _array_element_interpolation: $ => choice(
      seq(field('array', alias($.scalar, $.container_variable)), token.immediate('['), field('index', $._expr), ']'),
      prec.left(TERMPREC.ARROW, seq($.scalar, $._interp_arrow, '[', field('index', $._expr), ']')),
      // chained subscript: implicit (`$h{a}[0]`) or with an explicit arrow (`$h->{a}->[0]`)
      seq($._subscripted_interpolations, optional($._interp_arrow), token.immediate('['), field('index', $._expr), ']'),
    ),
    _hash_element_interpolation: $ => choice(
      seq(field('hash', alias($.scalar, $.container_variable)), token.immediate('{'), field('key', $._hash_key), '}'),
      prec.left(TERMPREC.ARROW, seq($.scalar, $._interp_arrow, '{', field('key', $._hash_key), '}')),
      // chained subscript: implicit (`$h{a}{b}`) or with an explicit arrow (`$h->{a}->{b}`)
      seq($._subscripted_interpolations, optional($._interp_arrow), token.immediate('{'), field('key', $._hash_key), '}'),
    ),
    _slice_expression_interpolation: $ => choice(
      seq(field('array', alias($.array, $.slice_container_variable)), token.immediate('['), $._expr, ']'),
      seq(field('hash', alias($.array, $.slice_container_variable)), token.immediate('{'), $._hash_key, '}'),
      prec.left(TERMPREC.ARROW,
        seq(field('arrayref', $.scalar), $._interp_arrow, '@', '[', $._expr, ']')),
      prec.left(TERMPREC.ARROW,
        seq(field('hashref', $.scalar), $._interp_arrow, '@', '{', $._hash_key, '}')),
    ),
    _scalar_deref_interpolation: $ => prec.left(TERMPREC.ARROW, seq($.scalar, $._interp_arrow, token.immediate('$*'))),
    _array_deref_interpolation: $ => prec.left(TERMPREC.ARROW, seq(field('arrayref', $.scalar), $._interp_arrow, token.immediate('@*'))),
    _interpolations: $ => choice(
      $.scalar,
      $.arraylen,
      $.array,
      alias($._scalar_deref_interpolation, $.scalar_deref_expression),
      alias($._array_deref_interpolation, $.array_deref_expression),
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
      // handling space sensitivity more correctly re deref-ing interps
      seq(
        $.scalar,
        alias(token.immediate('->'), 'not-interpolated'),
        choice(
          // handle "$ting->@ {blah}" and "$ting-> {blah}"
          seq(optional(choice('@', '$')), $._no_interp_whitespace_zw),
          // handle dynamic method calls like $scalar->$scalar
          $.scalar,
          // handle method calls "$ting->call" by taking anything other than @, {, and [
          /[^@${\[]/
        )
      ),
      $._nonvar_interpolation_fallbacks
    ),
    // a separate fallback section for non-vars b/c no variables interp inside of
    // transliterations
    _nonvar_interpolation_fallbacks: $ => choice(
      // these are re-aliased to not-interpolated so that a query for the actual
      // syntactic token won't match; we don't want queries mistakenly picking up these tokens as
      // part of a bracket pair
      ...aliasMany('not-interpolated', ['-', '{', '[',]),
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

    // TODO - consider actually parsing this split on spaces, so textobjects could go from
    // one word to the next?
    quoted_word_list: $ => seq(
      'qw',
      $._quotelike_begin,
      optional(stringContent($, $._noninterpolated_string_content)),
      $._quotelike_end
    ),

    command_string: $ => choice(
      seq(
        choice(
          seq('qx', $._quotelike_begin),
          $._backtick
        ),
        optional(stringContent($, $._interpolated_string_content)),
        $._quotelike_end
      ),
      seq(
        'qx',
        $._apostrophe,
        optional(stringContent($, $._noninterpolated_string_content)),
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
        alias($._regexp_open_bracket, '['),
        alias($._regexp_open_brace, '{'),
        $._interpolation_fallbacks,
        $._interpolations,
        seq('$', $._no_interp_whitespace_zw),
      )
    ),

    quoted_regexp_modifiers: $ => token.immediate(prec(2, /[msixpodualn]+/)),
    match_regexp_modifiers: $ => token.immediate(prec(2, /[msixpogcdualn]+/)),
    substitution_regexp_modifiers: $ => token.immediate(prec(2, /[msixpogcedualr]+/)),
    transliteration_modifiers: $ => token.immediate(prec(2, /[cdsr]+/)),

    _interpolated_transliteration_content: $ => repeat1(
      choice(
        $._qq_string_content,
        $._nonvar_interpolation_fallbacks,
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
    // Two forms: a v-string (`v5`, `v5.26.0`), and a bare numeric version with
    // at least two dots (`5.14.0`, `1.2.3.4`) as used by `use 5.14.0;` /
    // `package Foo 5.14.0;`. The bare form needs >=2 dots so it doesn't swallow
    // an ordinary one-dot float (`5.14` stays a `number`).
    // Lexical prec 2 (> the dotted v-string token in `_literal`, prec 1): in
    // use/package/require contexts both tokens can match a dotted version, and
    // this permissive form must win so `require v5.26` stays a
    // require_version_expression.  The raised prec also keeps `v5` from lexing
    // as a bareword.
    version: $ => token(prec(2, /v[0-9]+(?:\.[0-9]+)*|[0-9]+(?:\.[0-9]+){2,}/)),

    _conditionals: $ => choice('if', 'unless'),
    _loops: $ => choice('while', 'until'),
    autoquoted_bareword: $ => choice(
      // we need the dynamic prec to allow `say -thing` to not parse as a subtraction
      prec.dynamic(20,
        // give this autoquote the highest precedence we gots; NOTE that builtins override
        // minus autoquoting
        prec(TERMPREC.PAREN, seq('-', $._bareword)),
      ),
      seq(optional($._fat_comma_autoquoted_ahead), optional('-'), $._fat_comma_autoquoted)
    ),
    // NOTE - these have zw lookaheads so they override just being read as barewords
    _brace_autoquoted: $ => alias($._brace_autoquoted_token, $.autoquoted_bareword),

    // prefer identifer to bareword where the grammar allows
    identifier: $ => prec(2, $._identifier),
    _identifier: $ => unicode_ranges.identifier,
    // _identifier: $ => /[a-zA-Z_]\w*/,
    // this pattern tries to encapsulate the joys of S_scan_ident in toke.c in perl core
    // _dollar_ident_zw takes care of the subtleties that distinguish $$; ( only $$
    // followed by semicolon ) from $$deref
    // the punctuation/number/caret special-variable NAME ($!, $0, $^W). Split out
    // so the ${...} autoquote can use just this — NOT the `$`-prefixed form below,
    // since `${ $foo }` / `${ $/ }` is always a dereference, not an autoquoted name.
    _special_var_name: $ => /[0-9]+|\^([A-Z[?\^_]|])|\S/,
    _ident_special: $ => choice($._special_var_name, seq('$', $._dollar_ident_zw)),

    bareword: $ => prec.dynamic(1, $._bareword),
    // _bareword is at the very end b/c the lexer prefers tokens defined earlier in the grammar.
    // unicode-aware (XID_Start/XID_Continue) dotted/qualified bareword, so package
    // names allow unicode like the `_identifier` (sub name) path already does.
    _bareword: $ => choice($._identifier, unicode_ranges.bareword),
    ...primitives,
  }
})
