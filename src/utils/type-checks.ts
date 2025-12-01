// this ensures that all cases in a discriminated union are handled:
//
// e.g.
// declare const a: 'a'|'b'|'c'
//
// if (a === 'a') {
//   // handle this
// } else if (a === 'b') {
//   // handle this
// } else {
//   // this line throws a compile-time error, because 'c' is not handled
//   checkExhaustive(a)
// }
export function checkExhaustive (_arg: never): never {
  throw new Error('this case should never happen; please implement the missing conditional branch')
}
