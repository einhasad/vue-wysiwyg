import type { Editor } from '@einhasad-vue/vue-wysiwyg'

export const XSS_SAMPLE = [
  '<p>Pasted <strong onmouseover="alert(1)">bold</strong> and',
  ' <a href="javascript:alert(2)" onclick="alert(3)">a scripted link</a>',
  ' <img src="x" onerror="alert(4)"></p>',
  '<script>alert(5)</script>',
  '<iframe src="javascript:alert(6)"></iframe>',
  '<p style="background:url(javascript:alert(7))">styled <svg onload="alert(8)"></svg>text</p>',
  '<form action="https://evil.example"><button formaction="javascript:alert(9)">send</button></form>',
].join('')

const placeCaretAtEnd = (editor: Editor): void => {
  let node: Node = editor.root
  while (node.lastChild) {
    node = node.lastChild
  }
  const document = editor.root.ownerDocument
  const range = document.createRange()
  if (node instanceof Text) {
    range.setStart(node, node.length)
  } else if (node === editor.root) {
    range.setStart(node, 0)
  } else {
    range.setStartBefore(node)
  }
  document.getSelection()?.removeAllRanges()
  document.getSelection()?.addRange(range)
}

export function pasteHTML(editor: Editor, html: string): void {
  editor.focus()
  placeCaretAtEnd(editor)
  const clipboardData = new DataTransfer()
  clipboardData.setData('text/html', html)
  clipboardData.setData('text/plain', html)
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: clipboardData })
  editor.root.dispatchEvent(event)
}
