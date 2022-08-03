const precedences = [
  { name: 'deref', operators: ['->'], assoc: 'left', type: 'binary' },
  { name: 'inc/dec', operators: ['++', '--'], assoc: null, type: 'unary' },
  { name: 'exponent', operators: ['**'], assoc: 'right', type: 'binary' },
  { name: 'prefixes', operators: ['!', '~', '~.', '+', '-', '\\'], type: 'unary' },
  { name: 'regex bind', operators: ['=~', '!~'], assoc: 'left', type: 'binary' },
  { name: 'mult/div', operators: ['*', '/', '%', 'x'], assoc: 'left', type: 'binary' },
  { name: 'add/sub', operators: ['+', '-', '.'], assoc: 'left', type: 'binary' },
  { name: 'bitshift', operators: ['>>', '<<'], assoc: 'left', type: 'binary' },
  { name: 'named unary', operators: [''], assoc: null, type: 'unary' },
  // TODO - how to parse chained comparison... b4 chaining, it was syntax error to chain
  { name: 'comparison', operators: ['>', '<', '<=', '>=', 'lt', 'gt', 'le', 'ge'], type: 'binary', assoc: 'chain' },
  { name: 'equality/sorting', operators: ['==', '!=', 'eq', 'ne', '<=>', 'cmp', '~~'], type: 'binary', assoc: 'chain' },
  { name: 'isa', operators: ['isa'], type: 'binary', assoc: null },
  { name: 'bitwise and', operators: ['&'], type: 'binary', assoc: 'left' },
  { name: 'bitwise x?or', operators: ['|', '^'], type: 'binary', assoc: 'left' },
  { name: 'logical and', operators: ['&&'], type: 'binary', assoc: 'left' },
  { name: 'logical or', operators: ['||', '//'], type: 'binary', assoc: 'left' }
]

export default {
  precedenceLevels: precedences.map(x => x.name)
}
