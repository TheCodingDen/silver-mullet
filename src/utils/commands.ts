export type CommandFunction = () => unknown

// Symbols solve various issues here.
// 1) Declaring a known key in conjunction with an index declaration (https://github.com/microsoft/TypeScript/issues/17867#issuecomment-1025104103)
// 2) Choosing a sensible key that also cannot be an actual command name ('run' could conflict with a subcommand named the same)
export const run = Symbol('run')
export interface CommandNode {
  [k: string]: CommandNode | undefined
  [run]: CommandFunction
}

export type CommandBase = Record<string, CommandNode>

export interface CommandLookupOk {
  ok: true
  node: CommandNode
  matchedKey: string[]
}

export interface CommandLookupErr {
  ok: false
  err: Error
}

export type CommandLookup = CommandLookupOk | CommandLookupErr

export function validateSubcommandTree ([rootKey, ...subcommands]: string[], commandTree: CommandBase): CommandLookup {
  if (!commandTree[rootKey]) {
    return {
      ok: false,
      err: new Error(`no command "${rootKey}" at root`)
    }
  }

  const rootObject = commandTree[rootKey]
  let current = rootObject
  const parts = [rootKey]

  for (const subcommand of subcommands) {
    const child = current[subcommand]
    if (!child) {
      return {
        ok: false,
        err: new Error(`no command "${parts.join('.')}" in the tree`)
      }
    }

    current = child
    parts.push(subcommand)
  }

  return {
    ok: true,
    node: current,
    matchedKey: parts
  }
}
