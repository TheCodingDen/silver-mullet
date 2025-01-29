import { CachedMessage } from '../clients/redis'
import { URLDetectionResult } from '../detection/types'
import { extractURLs } from '../utils/url'
import { Guild } from 'discord.js'
import { cloudflare, accountId } from '../clients/cloudflare'
import { ScanCreateResponse } from 'cloudflare/resources/url-scanner/scans'
import { APIError } from 'cloudflare'
import prisma from '../clients/prisma'
import { DomainVerdict } from '@prisma/client'

async function sleep (ms: number): Promise<void> {
  return void await new Promise(resolve => setTimeout(resolve, ms))
}

export interface BadLink {
  domain: string
  url: string
  verdict: DomainVerdict
  categories: string[]
  redirects: string[]
  reportURL?: string
}

async function scanURL (url: URL): Promise<ScanCreateResponse> {
  const params = {
    account_id: accountId(),
    url: url.toString()
  }

  let res
  try {
    res = await cloudflare.urlScanner.scans.create(params)
  } catch (_err) {
    const err = _err as APIError
    // Recently scanned / backoff
    if (err.status === 429 || err.status === 409) {
      // https://developers.cloudflare.com/security-center/investigate/scan-limits/
      // 1 per 10 seconds
      await sleep(10_000)
      return await scanURL(url)
    }

    throw err
  }

  return res
}

async function pollForResult (submission: ScanCreateResponse): Promise<BadLink> {
  const params = {
    account_id: accountId()
  }

  try {
    const res = await cloudflare.urlScanner.scans.get(submission.uuid, params)
    return {
      domain: res.task.domain,
      url: res.task.url,
      categories: res.verdicts.overall.categories,
      verdict: res.verdicts.overall.malicious ? DomainVerdict.MALICIOUS : DomainVerdict.BENIGN,
      redirects: res.lists.urls,
      reportURL: res.task.reportURL
    }
  } catch (_err) {
    const err = _err as APIError
    if (err.status === 404) {
      await sleep(5_000)
      return await pollForResult(submission)
    }

    throw err
  }
}

async function getExistingMatch (url: URL, guildId: string): Promise<BadLink | undefined> {
  const existing = await prisma.link.findFirst({
    where: {
      AND: {
        domain: url.hostname,
        verdict: DomainVerdict.MALICIOUS,
        guildID: guildId
      }
    }
  })

  if (existing) {
    return {
      domain: existing.domain,
      url: existing.caughtURL,
      redirects: [],
      verdict: existing.verdict,
      categories: existing.categories
    }
  }

  return undefined
}

export async function scanURLs (message: CachedMessage, guild: Guild): Promise<URLDetectionResult | undefined> {
  const urls = extractURLs(message.content)
  if (!urls.length) {
    return undefined
  }

  logger.info(`Scanning URLs ${urls}`)
  const promises = []
  const alreadyExisted = []
  for (const url of urls) {
    const existing = await getExistingMatch(url, guild.id)
    if (existing) {
      alreadyExisted.push(existing.domain)
      promises.push(Promise.resolve(existing))
    } else {
      const doScan = scanURL(url).then(async x => {
        return await pollForResult(x)
      })
      promises.push(doScan)
    }
  }

  const radarResults = (await Promise.all(promises))

  const tripped = radarResults
    .filter(r => {
      return r.verdict === DomainVerdict.MALICIOUS
    })

  for (const link of tripped) {
    if (link.verdict === DomainVerdict.BENIGN) {
      continue
    }

    if (alreadyExisted.includes(link.domain)) {
      continue
    }

    await prisma.link.create({
      data: {
        categories: link.categories,
        caughtURL: link.url,
        domain: link.domain,
        guildID: guild.id,
        verdict: DomainVerdict.MALICIOUS
      }
    })
  }

  if (tripped.length) {
    return {
      source: 'url',
      message,
      trippedURLs: tripped,
      guild,
      action: 'MUTE'
    }
  }

  return undefined
}
