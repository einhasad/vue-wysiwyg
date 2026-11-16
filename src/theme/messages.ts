export interface EditorMessages {
  readonly toolbar: string
  readonly bold: string
  readonly italic: string
  readonly underline: string
  readonly heading: string
  readonly bulletList: string
  readonly orderedList: string
  readonly link: string
  readonly undo: string
  readonly redo: string
  readonly linkUrl: string
  readonly linkApply: string
  readonly linkRemove: string
  readonly linkCancel: string
  readonly linkInvalid: string
}

export const defaultMessages: EditorMessages = {
  toolbar: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  heading: 'Heading {level}',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  link: 'Link',
  undo: 'Undo',
  redo: 'Redo',
  linkUrl: 'URL',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
  linkCancel: 'Cancel',
  linkInvalid: 'Enter a valid, safe URL',
}
