// NOTE - we made this list based off of perl's precedence docs.
// we will enable lines as we iterate towards those operators
const precedences = [
  // { name: 'deref', operators: ['->'], assoc: 'left', type: 'binary' },
  // { name: 'inc/dec', operators: ['++', '--'], assoc: null, type: 'unary' },
  { name: 'exponent', operators: ['**'], assoc: 'right', type: 'binary' },
  // { name: 'prefixes', operators: ['!', '~', '~.', '+', '-', '\\'], type: 'unary' },
  // { name: 'regex bind', operators: ['=~', '!~'], assoc: 'left', type: 'binary' },
  { name: 'mult/div', operators: ['*', '/', '%', 'x'], assoc: 'left', type: 'binary' },
  { name: 'add/sub', operators: ['+', '-', '.'], assoc: 'left', type: 'binary' },
  // { name: 'bitshift', operators: ['>>', '<<'], assoc: 'left', type: 'binary' },
  // { name: 'named unary', operators: [''], assoc: null, type: 'unary' },
  // // TODO - how to parse chained comparison... b4 chaining, it was syntax error to chain
  // { name: 'comparison', operators: ['>', '<', '<=', '>=', 'lt', 'gt', 'le', 'ge'], type: 'binary', assoc: 'chain' },
  // { name: 'equality/sorting', operators: ['==', '!=', 'eq', 'ne', '<=>', 'cmp', '~~'], type: 'binary', assoc: 'chain' },
  // { name: 'isa', operators: ['isa'], type: 'binary', assoc: null },
  // { name: 'bitwise and', operators: ['&'], type: 'binary', assoc: 'left' },
  // { name: 'bitwise ors', operators: ['|', '^'], type: 'binary', assoc: 'left' },
  // { name: 'logical and', operators: ['&&'], type: 'binary', assoc: 'left' },
  // { name: 'logical ors', operators: ['||', '//'], type: 'binary', assoc: 'left' },
  // { name: 'range ops', operators: ['..', '...'], type: 'binary', assoc: null },
  // { name: 'ternary cond', operators: [], type: 'ternary', assoc: 'right' },
  // {
  //   name: 'assignment',
  //   // TODO - equality works on arrays/hashes/lists, other assignments only get scalars.
  //   // is that a syntax level thing?
  //   operators: ['=', '+=', '*=', '-=', '.=', '/=', '%=', 'x=', '&=', '|=', '^=', '&.=', '|.=', '^.=', '<<==', '>>=', '&&=', '||=', '//='],
  //   type: 'binary',
  //   assoc: 'right'
  // }
  // TODO commas: do we impl them as operators? they need higher precedence than the last
  // operators. hrmm maybe just add a precedence here?
]

const binops = $ => precedences.filter(x => x.type === 'binary').map(({ name, assoc, operators }) => {
  const precedenceLevel = prec[assoc]
  return precedenceLevel(name, seq(
    field('left', $.expression),
    field('operator', choice(...operators)),
    field('right', $.expression)
  ))
})

module.exports = {
  precedenceLevels: precedences.map(x => x.name),
  binops
}
