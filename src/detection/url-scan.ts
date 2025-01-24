export interface URLScanResult {
  hit: boolean
}

export function scanURLs (urls: URL[]): URLScanResult {
  logger.info(`Scanning URLs ${urls}`)

  return {
    hit: false
  }
}
