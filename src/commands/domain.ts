import { GuildCommandContext, getAssignedGuilds, handleCommand, run, sendSuccess } from '../utils/commands'
import { SlashCommand, SlashCreator, CommandContext, CommandOptionType } from 'slash-create'
import { PermissionGroup } from '@prisma/client'
import prisma from '../clients/prisma'
import wcmatch from 'wildcard-match'

export default class DomainCommand extends SlashCommand {
  constructor (creator: SlashCreator) {
    super(creator, {
      name: 'domain',
      description: 'Manage link scanning domain configuration',
      guildIDs: getAssignedGuilds({ includeMain: true, includeStaff: false }),
      options: [
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'ignore',
          description: 'Ignore a domain from scanning',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'domain',
              description: 'The domain to ignore, can include wildcards'
            }
          ]
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'list',
          description: 'List the domains being ignored by the link scanner'
        },
        {
          type: CommandOptionType.SUB_COMMAND,
          name: 'eval',
          description: 'Evaluate whether a given link would be ignored or not',
          options: [
            {
              type: CommandOptionType.STRING,
              name: 'link',
              description: 'The link to test'
            }
          ]
        }
      ]
    })
  }

  async run (ctx: CommandContext): Promise<void> {
    await handleCommand(this, ctx, [PermissionGroup.ADMIN, PermissionGroup.INFRA_ADMIN], {
      ignore: {
        [run]: this.ignore.bind(this)
      },
      list: {
        [run]: this.list.bind(this)
      },
      eval: {
        [run]: this.eval.bind(this)
      }
    })
  }

  private async ignore (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    const { domain } = options.ignore as { domain: string }

    await prisma.ignoredDomains.create({
      data: {
        domain
      }
    })

    logger.info(`${ctx.user.username} ignore domain '${domain}' from link scanning`)
    await sendSuccess(`Ignored domain "${domain}" from link scanning`, ctx)
  }

  private async eval (ctx: GuildCommandContext): Promise<void> {
    const { options } = ctx
    const { link } = options.eval as { link: string }
    const all = (await prisma.ignoredDomains.findMany({}))
    const url = new URL(link)

    let ignore = false
    for (const test of all) {
      const shouldIgnoreDomain = wcmatch(test.domain)
      if (shouldIgnoreDomain(url.hostname)) {
        ignore = true
        break
      }
    }

    await sendSuccess(`The link \`${link}\` ${ignore ? 'would' : 'would not'} be ignored`, ctx)
  }

  private async list (ctx: GuildCommandContext): Promise<void> {
    const domains = await prisma.ignoredDomains.findMany({ })
    const output = domains.map(d => `- \`${d.domain}\``).join('\n')

    await sendSuccess(`**Ignored domains**:\n ${output}`, ctx)
  }
}
