import { CommandLookupErr, CommandLookupOk, run, validateSubcommandTree } from '../../src/utils/commands'

describe('Subcommand trees', () => {
  it('matches a single root command', () => {
    const fn = jest.fn()
    const key = ['root']

    const result = validateSubcommandTree(key, {
      root: {
        [run]: fn
      }
    })

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })

  it('matches one layer of subcommands', () => {
    const fn = jest.fn()
    const key = ['root', 'child']

    const result = validateSubcommandTree(key, {
      root: {
        [run]: () => {},
        child: {
          [run]: fn
        }
      }
    })

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })

  it('matches two layers of subcommands', () => {
    const fn = jest.fn()
    const key = ['root', 'child', 'grandchild']

    const result = validateSubcommandTree(key, {
      root: {
        [run]: () => {},
        child: {
          [run]: () => {},
          grandchild: {
            [run]: fn
          }
        }
      }
    })

    expect(result.ok).toEqual(true)

    const okResult = (result as CommandLookupOk)
    expect(okResult.node[run]).toEqual(fn)
    expect(okResult.matchedKey).toEqual(key)
  })

  it('returns an error if the root does not exist', () => {
    const fn = jest.fn()
    const result = validateSubcommandTree(['does-not-exist'], {
      root: {
        [run]: fn
      }
    })

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

  it('returns an error if a subcommand does not exist', () => {
    const fn = jest.fn()
    const result = validateSubcommandTree(['root', 'does-not-exist'], {
      root: {
        [run]: fn
      }
    })

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
})
