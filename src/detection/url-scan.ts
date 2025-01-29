import { CachedMessage } from '../clients/redis'
import { URLDetectionResult } from '../detection/types'
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
  reportURL: string
  rawResult: any
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
      reportURL: res.task.reportURL,
      rawResult: res
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
  const today = new Date()
  const lastYear = new Date(today.setFullYear(today.getFullYear() - 1))

  const existing = await prisma.link.findFirst({
    where: {
      AND: {
        domain: url.hostname,
        guildID: guildId,
        scannedAt: {
          gte: lastYear
        }
      }
    }
  })

  if (existing) {
    return {
      domain: existing.domain,
      rawResult: existing.rawResult,
      reportURL: existing.reportURL,
      url: existing.caughtURL,
      redirects: existing.redirects,
      verdict: existing.verdict,
      categories: existing.categories
    }
  }

  return undefined
}

async function extractURLs (str: string): Promise<URL[]> {
  // Don't really want to mess around trying to get ESM modules to load on our runtime
  // So we will just do this for now. get-urls is ESM only
  const getUrls = (await import('get-urls')).default

  const opts = {
    requireSchemeOrWww: true
  }

  return [...getUrls(str, opts)]
    .map(u => new URL(u))
};

export async function scanURLs (message: CachedMessage, guild: Guild): Promise<URLDetectionResult | undefined> {
  const urls = await extractURLs(message.content)
  if (!urls.length) {
    return undefined
  }

  logger.info(`Scanning URLs ${urls}`)
  const promises = []
  const alreadyExisted = []

  for (const url of urls) {
    const existing = await getExistingMatch(url, guild.id)
    if (existing) {
      // Don't log rawResult, it's massive
      const { rawResult: _, ...rest } = existing

      logger.debug(`Found existing scan match: ${JSON.stringify(rest)}`)
      alreadyExisted.push(existing.domain)
      promises.push(Promise.resolve(existing))
    } else {
      logger.debug(`No match found for ${url}, scanning`)
      const doScan = scanURL(url).then(async x => {
        logger.debug(`Scan started for ${url}`)
        return await pollForResult(x)
      }).then(x => {
        logger.debug(`Scan finished for URL ${url}, verdict: ${x.verdict}`)
        return x
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
        reportURL: link.reportURL,
        rawResult: link.rawResult,
        redirects: link.redirects,
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
