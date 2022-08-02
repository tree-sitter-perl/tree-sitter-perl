const precedences = [
  { name: 'deref', operators: [ '->' ], assoc: 'left', type: 'binary'},
  { name: 'inc/dec', operators: [ '++', '--' ], assoc: null, type: 'unary' },
  { name: 'exponent', operators: [ '**' ], assoc: 'right', type: 'binary'},
  { name: 'prefixes', operators: [ '!', '~', '~.', '+', '-', '\\' ], type: 'unary'},
  { name: 'regex bind', operators: [ '=~', '!~'], assoc: 'left', type: 'binary'  },
  { name: 'mult/div', operators: [ '*', '/', '%', 'x'], assoc: 'left', type: 'binary'},
  { name: 'add/sub', operators: [ '+', '-', '.' ], assoc: 'left', type: 'binary'},
  { name: 'bitshift', operators: [ '>>', '<<'], assoc: 'left', type: 'binary' },
  { name: 'named unary', operators: [ '' ], assoc: null, type: 'unary' },
  // TODO - how to parse chained comparison...
  { name: 'comparison', operators: [ '>', '<', '<=', '>=', 'lt', 'gt', 'le', 'ge' ], type: 'binary', assoc: 'left' },
  { name: 'equality/sorting', operators: [ '==', '!=', 'eq', 'ne', '<=>', 'cmp', '~~' ], type: 'binary', assoc: 'left'}
]
module.export = {

}
