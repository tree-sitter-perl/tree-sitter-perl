// NOTE - we made this list based off of perl's precedence docs.
// we will enable lines as we iterate towards those operators
const precedences = [
  // { precedenceName: 'deref', operators: ['->'], assoc: 'left', type: 'binary' },
  // { precedenceName: 'inc/dec', operators: ['++', '--'], assoc: null, type: 'unary_either' },
  { precedenceName: 'exponent', operators: ['**'], assoc: 'right', type: 'binary' },
  { precedenceName: 'prefixes', operators: ['!', '~', '~.', '+', '-', '\\'], type: 'unary_pre' },
  // { precedenceName: 'regex bind', operators: ['=~', '!~'], assoc: 'left', type: 'binary' },
  { precedenceName: 'mult/div', operators: ['*', '/', '%', 'x'], assoc: 'left', type: 'binary' },
  { precedenceName: 'add/sub', operators: ['+', '-', '.'], assoc: 'left', type: 'binary' },
  // { precedenceName: 'bitshift', operators: ['>>', '<<'], assoc: 'left', type: 'binary' },
  // TODO - get the list of precedenceNamed unary ops
  // { precedenceName: 'named unary', operators: [''], assoc: null, type: 'unary' },
  // // TODO - how to parse chained comparison... b4 chaining, it was syntax error to chain
  // { precedenceName: 'comparison', operators: ['>', '<', '<=', '>=', 'lt', 'gt', 'le', 'ge'], type: 'binary', assoc: 'chain' },
  // { precedenceName: 'equality/sorting', operators: ['==', '!=', 'eq', 'ne', '<=>', 'cmp', '~~'], type: 'binary', assoc: 'chain' },
  // { precedenceName: 'isa', operators: ['isa'], type: 'binary', assoc: null },
  // { precedenceName: 'bitwise and', operators: ['&'], type: 'binary', assoc: 'left' },
  // { precedenceName: 'bitwise ors', operators: ['|', '^'], type: 'binary', assoc: 'left' },
  // { precedenceName: 'logical and', operators: ['&&'], type: 'binary', assoc: 'left' },
  // { precedenceName: 'logical ors', operators: ['||', '//'], type: 'binary', assoc: 'left' },
  // { precedenceName: 'range ops', operators: ['..', '...'], type: 'binary', assoc: null },
  // { precedenceName: 'ternary cond', operators: [], type: 'ternary', assoc: 'right' },
  // {
  //   precedenceName: 'assignment',
  //   // TODO - equality works on arrays/hashes/lists, other assignments only get scalars.
  //   // is that a syntax level thing?
  //   operators: ['=', '+=', '*=', '-=', '.=', '/=', '%=', 'x=', '&=', '|=', '^=', '&.=', '|.=', '^.=', '<<==', '>>=', '&&=', '||=', '//='],
  //   type: 'binary',
  //   assoc: 'right'
  // }
  // TODO commas: do we impl them as operators? they need higher precedence than the last
  // operators. hrmm maybe just add a precedence here?
]

const binops = $ => precedences.filter(x => x.type === 'binary')
  .map(({ precedenceName, assoc, operators }) => {
    const precedenceLevel = prec[assoc]
    return precedenceLevel(precedenceName, seq(
      field('left', $.expression),
      field('operator', choice(...operators)),
      field('right', $.expression)
    ))
  })

module.exports = {
  precedenceLevels: precedences.map(x => x.precedenceName),
  binops
}