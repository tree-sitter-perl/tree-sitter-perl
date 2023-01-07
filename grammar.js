const primitives = require('./lib/primitives.js')
const operators = require('./lib/operators.js')

module.exports = grammar({
  name: 'perl',
  supertypes: $ => [
    $.statement,
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
    source_file: $ => repeat($.statement),
    comment: $ => token(/#.*/),
    statement: $ => choice(
      $.expression_statement,
      $.postfix_if_statement,
      $.postfix_unless_statement,
      $.postfix_while_statement,
      $.postfix_until_statement,
      $.postfix_for_statement,
      $.if_statement,
      $.unless_statement,
      $.while_statement,
      $.until_statement,
    ),
    expression_statement: $ => seq($.expression, ';'),
    postfix_if_statement:     $ => seq($.expression, 'if',     field('condition', $.expression), ';'),
    postfix_unless_statement: $ => seq($.expression, 'unless', field('condition', $.expression), ';'),
    postfix_while_statement:  $ => seq($.expression, 'while',  field('condition', $.expression), ';'),
    postfix_until_statement:  $ => seq($.expression, 'until',  field('condition', $.expression), ';'),
    postfix_for_statement:    $ => seq($.expression, $._for,   field('condition', $.expression), ';'),
    if_statement:     $ => seq('if',     '(', field('condition', $.expression), ')', field('body', $._block)),
    // TODO: handle elsif + else
    unless_statement: $ => seq('unless', '(', field('condition', $.expression), ')', field('body', $._block)),
    while_statement:  $ => seq('while',  '(', field('condition', $.expression), ')', field('body', $._block)),
    until_statement:  $ => seq('until',  '(', field('condition', $.expression), ')', field('body', $._block)),
    _block: $ => seq('{', repeat($.statement), '}'),
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
