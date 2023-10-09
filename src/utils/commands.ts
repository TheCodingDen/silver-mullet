import { PermissionGroup } from '@prisma/client'
import { CommandContext, Message, MessageOptions, SlashCommand } from 'slash-create'
import prisma from '../clients/prisma'
import emoji from './emoji'

export class GuildCommandContext extends CommandContext {
  declare guildID: string
}

export type CommandFunction = (ctx: GuildCommandContext) => unknown

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

export enum CommandPermissionAssertionResult {
  MEMBER_UNKNOWN,
  ALLOWED,
  NOT_ALLOWED
}

export function validateSubcommandTree ([rootKey, ...subcommands]: string[], commandTree: CommandBase): CommandLookup {
  if (!commandTree[rootKey]) {
    return {
      ok: false,
      err: new Error(`No command with key "${rootKey}" at root`),
      humanReadableErr: `The command you tried to run (/${rootKey}) does not exist at the root of the tree.`
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
        humanReadableErr: `The command you tried to run (\`/${parts.join(' ')}\`) was not found in the subcommand tree.`
      }
    }

    current = child
  }

  const runner = current[run]
  if (!runner) {
    return {
      ok: false,
      err: new Error(`Attempted command execution with non-existent runner ${parts.join('.')}`),
      humanReadableErr: `The command you tried to run (\`/${parts.join(' ')}\`) is missing a runner function.`
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

export async function assertPermissionGroupMembership (allowed: PermissionGroup[], ctx: CommandContext): Promise<CommandPermissionAssertionResult> {
  const targetGroups = await prisma.permissionGroupMapping.findMany({
    where: {
      group: {
        in: allowed
      }
    }
  })

  const groupRoleIDs = targetGroups.map(group => group.roleID)

  if (!ctx.member) {
    return CommandPermissionAssertionResult.MEMBER_UNKNOWN
  } else if (ctx.member.roles.filter(role => groupRoleIDs.includes(role)).length === 0) {
    return CommandPermissionAssertionResult.NOT_ALLOWED
  } else {
    return CommandPermissionAssertionResult.ALLOWED
  }
}

export const getAssignedGuilds = (opts?: { includeMain?: boolean, includeStaff?: boolean }): string[] => {
  const guilds = []

  if (process.env.NODE_ENV === 'production') {
    if (opts?.includeStaff) {
      guilds.push(process.env.STAFF_GUILD_ID as string)
    }

    if (opts?.includeMain) {
      guilds.push(process.env.MAIN_GUILD_ID as string)
    }
  }

  guilds.push(process.env.DEVELOPMENT_GUILD_ID as string)

  return guilds
}

export async function handleCommand (
  instance: SlashCommand,
  _ctx: CommandContext,
  allowedGroups: PermissionGroup[],
  subcommandTree: CommandBase
): Promise<void> {
  if (!_ctx.guildID) {
    await sendFailure('This command is not available in DMs.', _ctx)
    return
  }

  const ctx = _ctx as GuildCommandContext

  const permissionAssertionResult = await assertPermissionGroupMembership(allowedGroups, ctx)

  switch (permissionAssertionResult) {
    case CommandPermissionAssertionResult.MEMBER_UNKNOWN:
      await sendFailure('Sorry, I cannot figure out who you are to authenticate you.', ctx, true)
      return
    case CommandPermissionAssertionResult.NOT_ALLOWED:
      await sendFailure(
        `Sorry, you are allowed to use this command. You must belong to the following permission ${allowedGroups.length > 1 ? 'groups' : 'group'}: ${allowedGroups.join(', ')}`,
        ctx,
        true
      )
      return
  }

  const result = validateSubcommandTree([instance.commandName, ...ctx.subcommands], {
    [instance.commandName]: subcommandTree
  })

  if (!result.ok) {
    logger.error(result.err)

    await sendFailure(result.humanReadableErr, ctx, true)
    return
  }

  await result.node[run](ctx)
}

interface SendableContext {
  send: (content: string | MessageOptions, options?: MessageOptions | undefined) => Promise<boolean | Message>
}

export async function sendSuccess (message: string, ctx: SendableContext, ephemeral = false): Promise<void> {
  await ctx.send(`${emoji.success} ${message}`, { ephemeral })
}

export async function sendFailure (message: string, ctx: SendableContext, ephemeral = true): Promise<void> {
  await ctx.send(`${emoji.error} ${message}`, { ephemeral })
}
