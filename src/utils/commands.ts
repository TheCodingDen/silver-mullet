import { CommandContext } from 'slash-create'

export type CommandFunction = (ctx: CommandContext) => unknown

// Symbols solve various issues here.
// 1) Declaring a known key in conjunction with an index declaration (https://github.com/microsoft/TypeScript/issues/17867#issuecomment-1025104103)
// 2) Choosing a sensible key that also cannot be an actual command name ('run' could conflict with a subcommand named the same)
export const run = Symbol('run')
export interface CommandNode {
  [k: string]: CommandNode | undefined
  [run]?: CommandFunction
}

export type CommandBase = Record<string, CommandNode>

export interface CommandLookupOk {
  ok: true
  // When the lookup is complete, the runner must exist, but empty runners are valid if there's
  // an incomplete implementation, or an intentionally blank implementation
  node: CommandNode & { [run]: CommandFunction }
  matchedKey: string[]
}

export interface CommandLookupErr {
  ok: false
  err: Error
  humanReadableErr: string
}

export type CommandLookup = CommandLookupOk | CommandLookupErr

export function validateSubcommandTree ([rootKey, ...subcommands]: string[], commandTree: CommandBase): CommandLookup {
  if (!commandTree[rootKey]) {
    return {
      ok: false,
      err: new Error(`No command with key "${rootKey}" at root`),
      humanReadableErr: `The command you tried to run (/${rootKey}) does not exist.`
    }
  }

  const rootObject = commandTree[rootKey]
  let current = rootObject
  const parts = [rootKey]

  for (const subcommand of subcommands) {
    const child = current[subcommand]
    parts.push(subcommand)

    if (!child) {
      return {
        ok: false,
        err: new Error(`No command "${parts.join('.')}" in the tree`),
        humanReadableErr: `The command you tried to run (\`/${parts.join(' ')}\`) is not configured correctly, please report this. You can quote "missing entry" to help the devs!`
      }
    }

    current = child
  }

  const runner = current[run]
  if (runner === undefined) {
    return {
      ok: false,
      err: new Error(`Attempted command execution with non-existent runner ${parts.join('.')}`),
      humanReadableErr: `The command you tried to run (\`/${parts.join(' ')}\`) is not configured correctly, please report this. You can quote "missing runner" to help the devs!`
    }
  }

  return {
    ok: true,
    // TS wont infer that current[run] is not undefined even if we check it
    node: {
      ...current,
      [run]: runner
    },
    matchedKey: parts
  }
}
