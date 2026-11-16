export const normalizeKeySpec = (spec: string): string => {
  const parts = spec.split('-')
  const key = parts.pop() as string
  return [...parts.sort(), key.toLowerCase()].join('-')
}

export const keyOf = (event: KeyboardEvent): string => {
  const key =
    event.key.length === 1 && event.key > '\u007f' && event.code.startsWith('Key')
      ? event.code.slice(3)
      : event.key
  return [
    event.altKey && 'Alt',
    (event.ctrlKey || event.metaKey) && 'Mod',
    event.shiftKey && 'Shift',
    key.toLowerCase(),
  ]
    .filter(Boolean)
    .join('-')
}
