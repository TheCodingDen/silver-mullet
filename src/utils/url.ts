// https://github.com/huckbit/extract-urls/blob/master/index.js
export function extractURLs (str: string, makeOutputLower = false): URL[] {
  // eslint-disable-next-line no-useless-escape
  const regexp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b([-a-zA-Z0-9()'@:%_\+.~#?!&//=]*)/gi
  const bracketsRegexp = /[()]|\.$/g

  if (typeof str !== 'string') {
    throw new TypeError(`The str argument should be a string, got ${typeof str}`)
  }

  if (str) {
    const urls = str.match(regexp)
    if (urls) {
      return makeOutputLower
        ? urls.map((item) => new URL(item.toLowerCase().replace(bracketsRegexp, '')))
        : urls.map((item) => new URL(item.replace(bracketsRegexp, '')))
    } else {
      return []
    }
  } else {
    return []
  }
};
