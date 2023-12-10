import { Redirect as NativeRedirect, http, https } from 'follow-redirects'
import UserAgent from 'user-agents'

const ua = new UserAgent()

export interface Redirect {
  url: URL
  headers: NativeRedirect['headers']
  statusCode: NativeRedirect['statusCode']
}

export async function resolveRedirectChain (url: URL): Promise<Redirect[]> {
  return await new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http

    const req = transport.get(
      url.href,
      {
        method: 'HEAD',
        trackRedirects: true,
        timeout: 10000,
        headers: {
          'User-Agent': ua.random().toString()
        }
      },
      res => {
        // Needed so we can consume the response (should be none) and trigger the 'end' event
        res.on('data', () => {})
        res.on('error', err => reject(err))
        res.on('end', () => {
          resolve(
            res.redirects.map(redirect => ({
              ...redirect,
              url: new URL(redirect.url)
            }))
          )
        })
      }
    )

    req.on('timeout', () => reject(new Error('Request timeout')))
  })
}
