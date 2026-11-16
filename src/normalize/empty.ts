const VISIBLE_VOID = 'img,hr,video,audio,iframe,object,embed,svg,canvas'

export const isEmptyNode = (node: Element | DocumentFragment): boolean =>
  !/[^\s\u200b]/.test(node.textContent) && !node.querySelector(VISIBLE_VOID)
