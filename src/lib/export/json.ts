import type { Diagram } from '../../types'

export function exportToJSON(diagram: Diagram): string {
  type NodeEntry = string | Record<string, unknown>

  function buildTree(parentId: string | null): NodeEntry[] {
    return diagram.nodes
      .filter(n => n.parentId === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(n => {
        const children = buildTree(n.id)
        const hasExtras = n.icon || n.bold || n.italic || n.fontSize || (n.textAlign && n.textAlign !== 'center')
        if (!children.length && !hasExtras) return n.title
        const node: Record<string, unknown> = { [n.title]: children.length ? children : undefined }
        if (n.icon) node.icon = n.icon
        if (n.bold) node.bold = n.bold
        if (n.italic) node.italic = n.italic
        if (n.fontSize) node.fontSize = n.fontSize
        if (n.textAlign && n.textAlign !== 'center') node.textAlign = n.textAlign
        return node
      })
  }

  const root = diagram.nodes.find(n => n.parentId === null)
  const result: Record<string, unknown> = { [diagram.name]: buildTree(root?.id ?? null) }
  if (root?.icon) result.icon = root.icon
  return JSON.stringify(result, null, 2)
}

export function downloadJSON(diagram: Diagram) {
  const blob = new Blob([exportToJSON(diagram)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${diagram.name.replace(/\s+/g, '_')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importFromJSON(json: string): Diagram | null {
  try {
    const d = JSON.parse(json)
    if (!d.id || !d.nodes || !Array.isArray(d.nodes)) return null
    return d as Diagram
  } catch {
    return null
  }
}
