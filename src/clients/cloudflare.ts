import Cloudflare from 'cloudflare'

export function accountId (): string | undefined {
  const { RADAR_ACCOUNT } = process.env
  if (!RADAR_ACCOUNT) {
    logger.warn('Cannot proceed with Radar integration, no account set')
  }

  return RADAR_ACCOUNT
}

export const cloudflare = new Cloudflare({
  apiToken: process.env.RADAR_TOKEN
})
