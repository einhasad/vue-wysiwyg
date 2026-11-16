import type { UrlPolicy } from '../core/types.js'

export const DEFAULT_URL_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel']

export function safeUrl(
  value: string,
  policy: UrlPolicy = { urlSchemes: DEFAULT_URL_SCHEMES } as UrlPolicy,
): string | null {
  const url = value.replace(/[\u0000- \u007f-\u009f]/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]
  return (
    scheme
      ? policy.urlSchemes.includes(scheme.toLowerCase())
      : policy.allowProtocolRelative || !/^[\\/]{2}/.test(url)
  )
    ? value.replace(/^[\u0000- ]+|[\u0000- ]+$|[\t\n\r]/g, '')
    : null
}
