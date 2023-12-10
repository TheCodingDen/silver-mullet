import { DomainType, Domain } from '@prisma/client'
import decancer from 'decancer'
import urlRegex from 'url-regex-safe'
import _ from 'lodash'
import { CachedMessage } from '../clients/redis'
import prisma from '../clients/prisma'
import { resolveRedirectChain } from '../clients/redirect-tracer'

export interface BannedLinkDetectionResult {
  bannedLink: URL
  trippedFilter: Domain
  message: CachedMessage
  guildId: string
}

export async function executeBannedLinkDetection (message: CachedMessage, guildId: string): Promise<BannedLinkDetectionResult | undefined> {
  const content = decancer(message.content).toString()

  const linksInMessage = content.match(urlRegex({
    strict: true,
    localhost: false,
    ipv4: false,
    ipv6: false
  })) ?? []

  // Target only links Discord would actually embed = just http/s
  const validLinks = linksInMessage.filter(link => link.startsWith('http'))

  if (validLinks.length === 0) {
    return
  }

  const [ignored, actionable] = _.partition(
    await prisma.domain.findMany({}),
    domain => domain.type === DomainType.IGNORED
  )

  if (actionable.length === 0) {
    // No banned domains, so no need to check anything
    return
  }

  for (const link of validLinks) {
    let url: URL

    try {
      url = new URL(link)
    } catch (err) {
      console.warn(`url-regex-safe picked up a malformed link (${link}). Link cannot be processed.`)
      continue
    }

    if (ignored.some(d => d.domain === url.hostname)) {
      continue
    }

    let redirectChain: URL[]

    try {
      redirectChain = (await resolveRedirectChain(url)).map(redirect => redirect.url)
    } catch (err) {
      console.warn(`Could not resolve contacted domains for ${link}. Matching on sent link only.`)
      redirectChain = [url]
    }

    for (const redirect of redirectChain) {
      const maybeActionable = actionable.find(d => d.domain === redirect.hostname)

      if (maybeActionable) {
        return {
          bannedLink: url,
          trippedFilter: maybeActionable,
          message,
          guildId
        }
      }
    }
  }
}
