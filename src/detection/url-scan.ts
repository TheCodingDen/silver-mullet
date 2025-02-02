import { CachedMessage } from '../clients/redis'
import { URLDetectionResult } from '../detection/types'
import { Guild } from 'discord.js'
import { cloudflare, accountId } from '../clients/cloudflare'
import { ScanCreateResponse } from 'cloudflare/resources/url-scanner/scans'
import { APIError } from 'cloudflare'
import prisma from '../clients/prisma'
import { AntiSpamAction, DomainVerdict } from '@prisma/client'
import _ from 'lodash'
import { errMessage } from '../utils'
import extractURLs from 'extract-urls'

const currentlyScanning = new Set<string>()

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

async function scanURL (url: URL, accountId: string, retries = 10): Promise<ScanCreateResponse | undefined> {
  const params = {
    account_id: accountId,
    url: url.toString()
  }

  if (retries === 0) {
    logger.info(`Max retries hit for ${url}`)
    return undefined
  }

  let res
  try {
    res = await cloudflare.urlScanner.scans.create(params)
  } catch (err) {
    // Recently scanned / backoff
    if (err instanceof APIError && (err.status === 429 || err.status === 409)) {
      // https://developers.cloudflare.com/security-center/investigate/scan-limits/
      // 1 per 10 seconds
      logger.debug(`Got ${err.status} for URL ${url}, sleeping for 10s`)
      await sleep(10_000)
      return await scanURL(url, accountId, retries - 1)
    } else {
      logger.error(`Got unexpected error ${errMessage(err)} on URL ${url}`)
      throw err
    }
  }

  return res
}

async function pollForResult (submission: ScanCreateResponse, accountId: string, retries = 10): Promise<BadLink | undefined> {
  const params = {
    account_id: accountId
  }

  if (retries === 0) {
    return undefined
  }

  try {
    const res = await cloudflare.urlScanner.scans.get(submission.uuid, params)
    return {
      domain: res.task.domain,
      url: res.task.url,
      categories: res.verdicts.overall.categories,
      verdict: res.verdicts.overall.malicious ? DomainVerdict.MALICIOUS : DomainVerdict.BENIGN,
      // @ts-expect-error CF SDK is missing the `history` property which has our redirect chain
      redirects: res.page.history?.map(h => h.url) ?? [],
      reportURL: res.task.reportURL,
      rawResult: res
    }
  } catch (err) {
    if (err instanceof APIError && err.status === 404) {
      // Recently scanned / backoff
      logger.debug(`URL ${submission.uuid} still in progress, sleeping`)
      await sleep(5_000)
      return await pollForResult(submission, accountId, retries - 1)
    } else {
      logger.error(`Got unexpected error ${errMessage(err)} on scan task ${submission.uuid}`)
      throw err
    }
  }
}

async function getExistingMatch (url: URL, guildId: string): Promise<BadLink | undefined> {
  const today = new Date()
  const lastYear = new Date(today.setFullYear(today.getFullYear() - 1))

  const existing = await prisma.link.findFirst({
    where: {
      AND: {
        caughtURL: url.toString(),
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

function doExtraction (str: string): URL[] {
  return [...extractURLs(str, true) ?? []]
    .map(u => new URL(u))
};

async function filterIgnoredDomains (urls: URL[]): Promise<URL[]> {
  const all = (await prisma.ignoredDomains.findMany({}))
  return _.intersectionWith(urls, all, (a, b) => !(_.isEqual(a.hostname, b.domain)))
}

export async function scanURLs (message: CachedMessage, guild: Guild): Promise<URLDetectionResult | undefined> {
  const account = accountId()
  if (!account) {
    return undefined
  }

  const urls = doExtraction(message.content)
  if (!urls.length) {
    return undefined
  }

  logger.info(`Checking urls ${urls.join(', ')}`)

  const filtered = await filterIgnoredDomains(urls)

  logger.info(`Scanning URLs '${filtered.join(', ')}'`)
  const promises = []
  const alreadyExisted = []

  for (const url of filtered) {
    const existing = await getExistingMatch(url, guild.id)
    if (existing) {
      // Don't log rawResult, it's massive
      const { rawResult: _, ...rest } = existing

      logger.debug(`Found existing scan match: ${JSON.stringify(rest)}`)
      alreadyExisted.push(existing.domain)
      promises.push(Promise.resolve(existing))
    } else {
      if (currentlyScanning.has(url.href)) {
        logger.debug(`Scan already in progress for ${url}, not starting another`)
        continue
      }

      currentlyScanning.add(url.href)
      logger.debug(`No match found for ${url}, scanning`)
      const doScan = scanURL(url, account).then(async scan => {
        // scan will be undefined if the scan could not be created.
        // this could be an intermitent failure, or a retry timeout
        if (scan === undefined) {
          currentlyScanning.delete(url.href)
          throw new Error(`Could not scan ${url}`)
        }

        logger.debug(`Scan started for ${url}`)
        return await pollForResult(scan, account)
      }).then(result => {
        currentlyScanning.delete(url.href)

        // scan will be undefined if the scan could not be fetched.
        // this could be an intermitent failure, or a retry timeout
        if (result === undefined) {
          throw new Error(`Could not get result ${url}`)
        }

        logger.debug(`Scan finished for URL ${url}, verdict: ${result.verdict}`)
        return result
      })

      promises.push(doScan)
    }
  }

  const radarResults = []
  for (const r of (await Promise.allSettled(promises))) {
    if (r.status === 'fulfilled') {
      radarResults.push(r.value)
    }
  }

  const tripped = radarResults
    .filter(r => r.verdict === DomainVerdict.MALICIOUS)

  for (const link of radarResults) {
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
        verdict: link.verdict
      }
    })
  }

  if (tripped.length !== 0) {
    return {
      source: 'url',
      message,
      trippedURLs: tripped,
      guild,
      action: AntiSpamAction.MUTE
    }
  }

  return undefined
}
