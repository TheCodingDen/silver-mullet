import { PermissionGroup } from '@prisma/client'
import { Mock } from 'moq.ts'
import { Member } from 'slash-create'
import prisma from '../../src/clients/prisma'
import { CommandLookupErr, CommandLookupOk, GuildCommandContext, allowFor, run, validateSubcommandTree } from '../../src/utils/commands'

describe('Subcommand trees', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.permissionGroupMapping.deleteMany({})

    await prisma.permissionGroupMapping.createMany({
      data: [
        {
          roleID: '0',
          guildID: '0',
          group: PermissionGroup.INFRA_ADMIN
        },
        {
          roleID: '1',
          guildID: '0',
          group: PermissionGroup.ROOT
        },
        {
          roleID: '2',
          guildID: '0',
          group: PermissionGroup.ADMIN
        },
        {
          roleID: '3',
          guildID: '0',
          group: PermissionGroup.MODERATOR
        }
      ]
    })
  })

  const getMockCtx = (memberRoles: string[]): GuildCommandContext => {
    const mockMember = new Mock<Member>()
      .setup(ctx => ctx.roles)
      .returns(memberRoles)

    const mockCtx = new Mock<GuildCommandContext>()
      .setup(ctx => ctx.guildID)
      .returns('0')
      .setup(ctx => ctx.member)
      .returns(mockMember.object())

    return mockCtx.object()
  }

  const defaultPermsAndCtx: [PermissionGroup[], GuildCommandContext] = [
    [PermissionGroup.INFRA_ADMIN],
    getMockCtx(['0'])
  ]

  it('matches a single root command', async () => {
    const fn = jest.fn()
    const key = ['root']

    const result = await validateSubcommandTree(
      key,
      {
        root: {
          [run]: fn
        }
      },
      ...defaultPermsAndCtx
    )

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })

  it('matches one layer of subcommands', async () => {
    const fn = jest.fn()
    const key = ['root', 'child']

    const result = await validateSubcommandTree(
      key,
      {
        root: {
          [run]: () => {},
          child: {
            [run]: fn
          }
        }
      },
      ...defaultPermsAndCtx
    )

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })

  it('matches two layers of subcommands', async () => {
    const fn = jest.fn()
    const key = ['root', 'child', 'grandchild']

    const result = await validateSubcommandTree(
      key,
      {
        root: {
          [run]: () => {},
          child: {
            [run]: () => {},
            grandchild: {
              [run]: fn
            }
          }
        }
      },
      ...defaultPermsAndCtx
    )

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })

  it('returns an error if the root does not exist', async () => {
    const fn = jest.fn()
    const result = await validateSubcommandTree(
      ['does-not-exist'],
      {
        root: {
          [run]: fn
        }
      },
      ...defaultPermsAndCtx
    )

    expect(result.ok).toEqual(false)

    const errResult = (result as CommandLookupErr)
    expect(errResult).toMatchInlineSnapshot(`
{
  "err": [Error: No command with key "does-not-exist" at root],
  "humanReadableErr": "The command you tried to run (/does-not-exist) does not exist at the root of the tree.",
  "ok": false,
}
`)
  })

  it('returns an error if a subcommand does not exist', async () => {
    const fn = jest.fn()
    const result = await validateSubcommandTree(
      ['root', 'does-not-exist'],
      {
        root: {
          [run]: fn
        }
      },
      ...defaultPermsAndCtx
    )

    expect(result.ok).toEqual(false)

    const errResult = (result as CommandLookupErr)
    expect(errResult).toMatchInlineSnapshot(`
{
  "err": [Error: No command "root.does-not-exist" in the tree],
  "humanReadableErr": "The command you tried to run (\`/root does-not-exist\`) was not found in the subcommand tree.",
  "ok": false,
}
`)
  })

  it('returns a non-logging error if user does not have permission to run the command', async () => {
    const fn = jest.fn()
    const key = ['root']

    const result = await validateSubcommandTree(
      key,
      {
        root: {
          [run]: fn
        }
      },
      [PermissionGroup.INFRA_ADMIN],
      getMockCtx(['1'])
    )

    expect(result.ok).toEqual(false)

    const errResult = (result as CommandLookupErr)
    expect(errResult).toMatchInlineSnapshot(`
{
  "err": [Error: Permission group membership missing],
  "humanReadableErr": "Sorry, you are allowed to use this command. You must belong to the following permission group: INFRA_ADMIN",
  "ok": false,
  "suppressLog": true,
}
`)
  })

  it('allows access to subcommand if additional allowed groups have been declared', async () => {
    const fn = jest.fn()
    const key = ['root', 'child']

    const result = await validateSubcommandTree(
      key,
      {
        root: {
          [run]: () => {},
          child: {
            [run]: fn,
            [allowFor]: [PermissionGroup.MODERATOR]
          }
        }
      },
      [PermissionGroup.INFRA_ADMIN],
      getMockCtx(['3'])
    )

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })
})
