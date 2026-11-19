import type { Diagram, MindmapNode } from '../../types/index.js'

type NodeEntry = string | Record<string, unknown>

function buildEntry(nodes: MindmapNode[], n: MindmapNode): NodeEntry {
  const children = nodes
    .filter(c => c.parentId === n.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(c => buildEntry(nodes, c))
  const hasExtras = n.icon || n.emoji || n.bold || n.italic || (n.textAlign && n.textAlign !== 'center')
  if (!children.length && !hasExtras) return n.title
  const node: Record<string, unknown> = { [n.title]: children.length ? children : null }
  if (n.icon) node.icon = n.icon
  if (n.emoji) node.emoji = n.emoji
  if (n.bold) node.bold = n.bold
  if (n.italic) node.italic = n.italic
  if (n.textAlign && n.textAlign !== 'center') node.textAlign = n.textAlign
  return node
}

/** The given nodes and everything under them, as a JSON array the outline paste reads back. */
export function exportBranchesToJSON(nodes: MindmapNode[], ids: string[]): string {
  return JSON.stringify(ids.flatMap(id => {
    const n = nodes.find(x => x.id === id)
    return n ? [buildEntry(nodes, n)] : []
  }), null, 2)
}

export function exportToJSON(diagram: Diagram): string {
  const root = diagram.nodes.find(n => n.parentId === null)
  const kids = root ? (buildEntry(diagram.nodes, root) as Record<string, unknown>)[root.title] : null
  const result: Record<string, unknown> = { [diagram.name]: Array.isArray(kids) ? kids : [] }
  if (root?.icon) result.icon = root.icon
  if (root?.emoji) result.emoji = root.emoji
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
