import { CachedMessage } from '../clients/redis'
import { URLDetectionResult } from '../detection/types'
import { extractURLs } from '../utils/url'
import { Guild } from 'discord.js'

const BASE_URL = 'https://api.cloudflare.com/client/v4'
const account = process.env.RADAR_ACCOUNT

function makeAPIURL (): string {
  return `${BASE_URL}/accounts/${account}/urlscanner/v2/scan`
}

function makeSearchURL (url: URL): string {
  return `${BASE_URL}/accounts/${account}/urlscanner/v2/search?q=task.url:"${url.toString()}"`
}

export interface RadarSubmission {
  uuid: string
  api: string
  visibility: string
  url: string
  message: string
  status?: number
}

export interface RadarResult {
  task: {
    uuid: string
    url: string
  }
  verdicts: {
    overall: {
      malicious: boolean
      tags: string[]
    }
  }
}

// We will use it in future
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchForURL (url: URL): Promise<RadarResult | undefined> {
  const apiURL = makeSearchURL(url)
  const token = process.env.RADAR_TOKEN
  if (token === undefined || token === 'disabled') {
    return undefined
  }

  const res = await fetch(apiURL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
    .then(async b => await b.json())
    .then(b => b as RadarResult)

  console.log(JSON.stringify(res, undefined, 2))
  return res
}

async function scanURL (url: URL): Promise<RadarSubmission | undefined> {
  const apiURL = makeAPIURL()
  const token = process.env.RADAR_TOKEN
  if (token === undefined || token === 'disabled') {
    return undefined
  }

  const body = {
    url: url.toString()
  }

  const res = await fetch(apiURL, {
    body: JSON.stringify(body),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }
  })
    .then(async b => await b.json())
    .then(b => (b as RadarSubmission))

  if (res.status && res.status === 409) {
    logger.warn('409 when trying to scan')
    return undefined
    // TODO: return await searchForURL(url)
  }

  return res
}

async function pollForResult (submission: RadarSubmission): Promise<RadarResult> {
  const token = process.env.RADAR_TOKEN

  return await new Promise((resolve, reject) => {
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(submission.api, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        })
        if (response.status !== 404) {
          const data = await response.json()
          resolve(data as RadarResult)
        } else {
          // Retry after 5 seconds
          logger.debug(`Retrying for ${submission.url}`)

          // This is fine
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          setTimeout(poll, 5_000)
        }
      } catch (error) {
        reject(error)
      }
    }

    void poll()
  })
}

export async function scanURLs (message: CachedMessage, guild: Guild): Promise<URLDetectionResult | undefined> {
  const urls = extractURLs(message.content)
  if (!urls.length) {
    return undefined
  }

  logger.info(`Scanning URLs ${urls}`)
  const promises = []
  for (const url of urls) {
    promises.push(scanURL(url).then(async x => {
      if (x !== undefined) {
        return await pollForResult(x)
      }
      return undefined
    }))
  }

  const radarResults = (await Promise.all(promises))
    .filter(x => x !== undefined)

  const tripped = radarResults
    .filter(r => {
      return (r as RadarResult).verdicts.overall.malicious
    })
    .map(r => {
      return (r as RadarResult).task.url
    })

  if (tripped.length) {
    return {
      source: 'url',
      message,
      trippedURLs: urls,
      guild,
      action: 'MUTE'
    }
  }

  return undefined
}
