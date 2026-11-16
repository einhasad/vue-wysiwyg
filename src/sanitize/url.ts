import type { UrlPolicy } from '../core/types.js'

export const DEFAULT_URL_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel']

export function safeUrl(
  value: string,
  policy: UrlPolicy = { urlSchemes: DEFAULT_URL_SCHEMES } as UrlPolicy,
): string | null {
  const trimmed = value.replace(/[\t\n\r]/g, '').trim()
  const url = trimmed.replace(/[\u0000- \u007f-\u009f]/g, '')
  const scheme = /^([a-z][\w+.-]*):/i.exec(url)?.[1]
  return (
    scheme
      ? policy.urlSchemes.includes(scheme.toLowerCase())
      : policy.allowProtocolRelative || !/^[\\/]{2}/.test(url)
  )
    ? trimmed
    : null
}
