import Cloudflare from 'cloudflare'

export function accountId (): string {
  const { RADAR_ACCOUNT } = process.env
  if (!RADAR_ACCOUNT) {
    throw new TypeError('no radar account configured')
  }

  return RADAR_ACCOUNT
}

export const cloudflare = new Cloudflare({
  apiToken: process.env.RADAR_TOKEN
})
