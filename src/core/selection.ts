export const pathOf = (root: Node, node: Node, offset: number): number[] => {
  const path = [offset]
  for (let current = node; current !== root; current = current.parentNode as Node) {
    path.unshift(Array.prototype.indexOf.call((current.parentNode as Node).childNodes, current))
  }
  return path
}

export const nodeLength = (node: Node): number =>
  node.nodeType === 3 ? (node as Text).length : node.childNodes.length

export const resolvePath = (root: Node, path: readonly number[]): [Node, number] => {
  let node = root
  let depth = 0
  for (; depth < path.length - 1; depth++) {
    const next = node.childNodes[path[depth] as number]
    if (!next) {
      return [node, nodeLength(node)]
    }
    node = next
  }
  return [node, Math.min(path[depth] ?? 0, nodeLength(node))]
}
