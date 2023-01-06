// NOTE - we made this list based off of perl's precedence docs.
// we will enable lines as we iterate towards those operators
const precedences = [
  // NOTE - these work only on LVALUEs, and that seems to be a compile time thing. should
  // that be reflected here?
  // { precedenceName: 'inc/dec', operators: ['++', '--'], type: 'unary_either' },
  { precedenceName: 'prefixes', operators: ['!', '~', '~.', '+', '-', '\\'], type: 'unary_pre' },
  // TODO - get the list of named unary ops
  // { precedenceName: 'named unary', operators: [''], type: 'unary_pre' },
  // // TODO - how to parse chained comparison... b4 chaining, it was syntax error to chain
  // { precedenceName: 'comparison', operators: ['>', '<', '<=', '>=', 'lt', 'gt', 'le', 'ge'], type: 'chain', assoc: 'chain' },
  // { precedenceName: 'equality/sorting', operators: ['==', '!=', 'eq', 'ne', '<=>', 'cmp', '~~'], type: 'chain', assoc: 'chain' },
  // TODO: only if `use feature isa`
  // { precedenceName: 'ternary cond', operators: [], type: 'ternary', assoc: 'right' },
  // {
  //   precedenceName: 'assignment',
  //   // TODO - equality works on arrays/hashes/lists, other assignments only get scalars.
  //   // is that a syntax level thing?
  //   operators: ['=', '+=', '*=', '-=', '.=', '/=', '%=', 'x=', '&=', '|=', '^=', '&.=', '|.=', '^.=', '<<==', '>>=', '&&=', '||=', '//='],
  //   assoc: 'right'
  // }
]

const unops = $ => precedences.filter(x => x.type === 'unary_pre')
  .map(({ precedenceName, operators }) => {
    return prec(precedenceName, seq(
      field('operator', choice(...operators)),
      field('operand', $.expression)
    ))
  })

module.exports = {
  precedenceLevels: precedences.map(x => x.precedenceName),
  unops
}
