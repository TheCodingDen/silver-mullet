import { AntiSpamAction, AntiSpamRule, AntiSpamType, PermissionGroup } from '@prisma/client'
import didYouMean, { ReturnTypeEnums } from 'didyoumean2'
import _ from 'lodash'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType, AutocompleteContext, AutocompleteChoice } from 'slash-create'
import prisma from '../clients/prisma'
import { getAssignedGuilds, handleCommand, run, sendFailure, sendSuccess } from '../utils/commands'
import { embedBase } from '../utils/discordUtils'
import { errMessage, errStack, humanLikely } from '../utils/index'

const NON_ASCII_SPACE = ' '

export default class RuleCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'rule',
      description: 'Create and manage rules for the bot',
      guildIDs: getAssignedGuilds({ includeMain: true }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'list',
          description: 'List the currently set rules'
        },
        {
          type: CommandOptionType.SUB_COMMAND_GROUP,
          name: 'create',
          description: 'Create rules',
          options: [
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'spam',
              description: 'Create an anti spam rule',
              options: [
                {
                  type: CommandOptionType.NUMBER,
                  name: 'points',
                  description: 'The point threshold at which to apply this rule',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'action',
                  description: 'The action to perform.',
                  choices: _.keys(AntiSpamAction).map(action => ({ name: action, value: action })),
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'description',
                  description: 'The description of the rule',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'parent',
                  description: 'The parent of the new rule.',
                  autocomplete: true
                }
              ]
            },
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'filter',
              description: 'Create a filter rule',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'phrase',
                  description: 'The phrase that should trigger this rule',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'action',
                  description: 'The action to perform.',
                  choices: _.keys(AntiSpamAction).map(action => ({ name: action, value: action })),
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'description',
                  description: 'The description of the rule',
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'parent',
                  description: 'The parent of the new rule.',
                  autocomplete: true
                }
              ]
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND_GROUP,
          name: 'edit',
          description: 'Edit rules',
          options: [
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'spam',
              description: 'Edit an anti spam rule',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'rule',
                  description: 'The rule to edit',
                  required: true,
                  autocomplete: true
                },
                {
                  type: CommandOptionType.NUMBER,
                  name: 'points',
                  description: 'The new point threshold at which to apply this rule'
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'action',
                  description: 'The new action to perform.',
                  choices: _.keys(AntiSpamAction).map(action => ({ name: action, value: action }))
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'description',
                  description: 'The new description of the rule'
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'parent',
                  description: 'The new parent of the rule.',
                  autocomplete: true
                }
              ]
            },
            {
              type: CommandOptionType.SUB_COMMAND,
              name: 'filter',
              description: 'Edit a filter rule',
              options: [
                {
                  type: CommandOptionType.STRING,
                  name: 'rule',
                  description: 'The rule to edit',
                  autocomplete: true,
                  required: true
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'phrase',
                  description: 'The new phrase that should apply this rule'
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'action',
                  description: 'The new action to perform.',
                  choices: _.keys(AntiSpamAction).map(action => ({ name: action, value: action }))
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'description',
                  description: 'The new description of the rule'
                },
                {
                  type: CommandOptionType.STRING,
                  name: 'parent',
                  description: 'The new parent of the rule.',
                  autocomplete: true
                }
              ]
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'remove',
          description: 'Remove a channel, role, or user from the ignore list.',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'rule',
              description: 'The rule to remove.',
              required: true,
              autocomplete: true
            }
          ]
        }
      ]
    })
  }

  async autocomplete (ctx: AutocompleteContext): Promise<AutocompleteChoice[]> {
    const { focused, options } = ctx

    switch (focused) {
      case 'rule':
      case 'parent': {
        const type = ctx.subcommands.reverse()[0]?.toUpperCase()
        if (type !== 'FILTER' && type !== 'SPAM') {
          throw new Error(`expected FILTER|SPAM got ${type}`)
        }

        const rules = await prisma.antiSpamRule.findMany({
          orderBy: {
            type: 'asc'
          },
          where: {
            type
          }
        })

        const formatOption = (option: AntiSpamRule): string => `${option.type} (${option.description}) will ${option.action} at ${option.pointThreshold} points`

        const validOptions = rules.map(r => formatOption(r))
        const input = options?.remove?.rule ??
          options?.create?.spam?.parent ??
          options?.create?.filter?.parent ??
          options?.edit?.spam?.parent ??
          options?.edit?.filter?.parent ??
          options?.edit?.spam?.rule ??
          options?.edit?.filter?.rule

        const likely = didYouMean(
          input,
          validOptions,
          { returnType: ReturnTypeEnums.ALL_MATCHES }
        )

        return rules
          .filter(option => humanLikely(input, likely, formatOption(option)))
          .map(option => ({ name: formatOption(option), value: option.id }))
      }
      default:
        logger.warn(`Unknown autocompletable field ${focused} for command '${this.commandName}'!`)
        return []
    }
  }

  async run (ctx: CommandContext): Promise<void> {
    await handleCommand(this, ctx, [PermissionGroup.INFRA_ADMIN], {
      list: {
        [run]: this.list.bind(this)
      },
      create: {
        filter: {
          [run]: async ctx => await this.create(ctx, 'FILTER')
        },
        spam: {
          [run]: async ctx => await this.create(ctx, 'SPAM')
        }
      },
      remove: {
        [run]: this.remove.bind(this)
      },
      edit: {
        filter: {
          [run]: async ctx => await this.edit(ctx, 'FILTER')
        },
        spam: {
          [run]: async ctx => await this.edit(ctx, 'SPAM')
        }
      }
    })
  }

  private async list (ctx: CommandContext): Promise<void> {
    const rules = await prisma.antiSpamRule.findMany({
      orderBy: {
        type: 'asc'
      },
      include: {
        children: {
          include: {
            parent: true,
            children: true
          }
        },
        parent: true
      }
    })

    let description = ''
    let depth = 0

    const formatter = (rule: AntiSpamRule & { children?: AntiSpamRule[] }): void => {
      const pointString = ` @ ${rule.pointThreshold} points`
      const phraseString = ` (matches phrase "${rule.triggeringPhrase}")`
      description += `${NON_ASCII_SPACE.repeat(depth * 4)}**(${rule.type}) ${rule.action}${rule.pointThreshold ? pointString : ''}**\n`
      description += `${NON_ASCII_SPACE.repeat(depth * 4)}${rule.description}${rule.triggeringPhrase ? phraseString : ''}\n`

      if (rule.children) {
        for (const child of rule.children) {
          depth++
          formatter(child)
        }
      }
    }

    for (const rule of rules) {
      if (!rule.parent) {
        formatter(rule)
        depth = 0
        description += '\n'
      }
    }

    await ctx.send({
      embeds: [{
        ...embedBase(),
        title: 'Rules',
        description
      }
      ]
    })
  }

  private async create (ctx: CommandContext, type: AntiSpamType): Promise<void> {
    const { points, action, description, parent: parentId, phrase } = (ctx.options.create[type.toLowerCase()]) as
      { points: number | undefined, action: AntiSpamAction, description: string, parent: string, phrase: string | undefined }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found!', ctx)
      return
    }

    if (parentId) {
      const parent = await prisma.antiSpamRule.findFirst({
        where: {
          id: parentId
        }
      })

      if (!parent) {
        await sendFailure('No parent found, Discord must have given us garbage', ctx, true)
        return
      }

      logger.info(`${ctx.user.username} created automod ${type} rule "${description}" which will ${action} at ${points} points (child of ${parentId})`)

      await prisma.antiSpamRule.create({
        data: {
          type,
          action,
          triggeringPhrase: phrase,
          description,
          pointThreshold: points,
          parent: {
            connect: {
              id: parentId
            }
          },
          settings: {
            connect: {
              version: settings.version
            }
          }
        }
      })

      await sendSuccess(`Created automod ${type} rule "${description}" which will ${action} at ${points} points`, ctx)

      return
    }

    logger.info(`${ctx.user.username} created automod ${type} rule "${description}" which will ${action} at ${points} points`)
    await prisma.antiSpamRule.create({
      data: {
        type,
        action,
        triggeringPhrase: phrase,
        description,
        pointThreshold: points,
        settings: {
          connect: {
            version: settings.version
          }
        }
      }
    })

    await sendSuccess(`Created ${type} rule "${description}" which will ${action} ${points ? `at ${points} points` : `when ${phrase} is detected`}`, ctx)
  }

  private async remove (ctx: CommandContext): Promise<void> {
    const { options } = ctx
    const { rule: entityId } = options.remove as { rule: string }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found, cannot remove rule!', ctx)
      return
    }

    const rule = await prisma.antiSpamRule.findFirst({
      where: {
        id: entityId,
        settings: {
          version: settings.version
        }
      }
    })

    if (!rule) {
      await sendFailure('No data found for that rule.', ctx)
      return
    }

    const { pointThreshold, action, description, type, triggeringPhrase } = rule

    try {
      await prisma.antiSpamRule.delete({
        where: {
          id: rule.id
        }
      })

      logger.info(`${ctx.user.username} removed ${type} rule "${description}" which will ${action} ${pointThreshold ? `at ${pointThreshold} points` : `when ${triggeringPhrase} is detected`}`)
      await sendSuccess(`Removed ${type} rule "${description}"`, ctx)
    } catch (err) {
      logger.error(`Rule removal for "${description}" (${type} - ${action}) failed:\n${errStack(err)}`)
      await sendFailure(`Failed to remove rule: ${errMessage(err)}`, ctx, false)
    }
  }

  private async edit (ctx: CommandContext, type: AntiSpamType): Promise<void> {
    const { rule: entityId, points, action, description, parent: parentId, phrase } = (ctx.options.edit[type.toLowerCase()]) as
      { rule: string, points: number | undefined, action: AntiSpamAction, description: string, parent: string, phrase: string | undefined }

    const settings = await prisma.crossChannelAntiSpamSettings.findFirst({
      orderBy: {
        version: 'desc'
      }
    })

    if (!settings) {
      await sendFailure('No CCAS settings found, cannot edit rule!', ctx)
      return
    }

    const dbRule = await prisma.antiSpamRule.findFirst({
      where: {
        id: entityId,
        settings: {
          version: settings.version
        }
      }
    })

    const parentRule = await prisma.antiSpamRule.findFirst({
      where: {
        id: parentId,
        settings: {
          version: settings.version
        }
      }
    })

    if (!dbRule) {
      await sendFailure('Rule not found, Discord must have sent us invalid data.', ctx)
      return
    }

    if (!parentRule) {
      await sendFailure('Parent rule not found, Discord must have sent us invalid data.', ctx)
      return
    }

    const newRule = {
      type,
      description,
      action,
      triggeringPhrase: phrase,
      pointThreshold: points,
      parentId
    }

    // Copy the old version before we merge the two objects, as we must keep the old state around to compare to
    const oldRule = {
      ...dbRule
    }
    const mergedRule = _.merge(dbRule, newRule)

    try {
      await prisma.antiSpamRule.update({
        where: {
          id: oldRule.id
        },
        data: newRule
      })

      logger.info(`${ctx.user.username} edited automod rule
        Old: ${oldRule.type} - "${oldRule.description}" which will ${oldRule.action} at ${oldRule.pointThreshold} points (parent: ${oldRule.parentId}) (phrase: ${oldRule.triggeringPhrase})
        New: ${mergedRule.type} - "${mergedRule.description}" which will ${mergedRule.action} at ${mergedRule.pointThreshold} points (parent: ${mergedRule.parentId}) (phrase: ${mergedRule.triggeringPhrase})
      `)
      await sendSuccess(`Edited automod rule
        Old: ${oldRule.type} - "${oldRule.description}" which will ${oldRule.action} at ${oldRule.pointThreshold} points (parent: ${oldRule.parentId}) (phrase: ${oldRule.triggeringPhrase})
        New: ${mergedRule.type} - "${mergedRule.description}" which will ${mergedRule.action} at ${mergedRule.pointThreshold} points (parent: ${mergedRule.parentId}) (phrase: ${mergedRule.triggeringPhrase})
      `, ctx)
    } catch (err) {
      logger.error(`Rule edit for "${mergedRule.description}" (${mergedRule.type} - ${mergedRule.action} @ ${mergedRule.pointThreshold} points) failed:\n${errStack(err)}`)
      await sendFailure(`Failed to edit rule: ${errMessage(err)}`, ctx, false)
    }
  }
}
