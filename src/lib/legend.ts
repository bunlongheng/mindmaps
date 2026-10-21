import type { LegendItem, MindmapNode } from '../types'

/** A node belongs to a legend row when it carries that row's dot (emoji) or swatch colour. */
export function matchesLegend(n: MindmapNode, row: LegendItem): boolean {
  return (!!row.emoji && n.emoji === row.emoji) || (!row.emoji && !!row.color && n.color === row.color)
}

/**
 * Ids to hide while legend rows are focused: everything except the nodes that match a
 * focused row and the ancestors that carry them (so each kept feature stays on its branch).
 */
export function legendHidden(nodes: MindmapNode[], legend: LegendItem[], focus: number[]): Set<string> {
  const rows = focus.map(i => legend[i]).filter(Boolean)
  if (!rows.length) return new Set()
  const byId = new Map(nodes.map(n => [n.id, n]))
  const keep = new Set<string>()
  for (const n of nodes) {
    if (n.parentId !== null && !rows.some(r => matchesLegend(n, r))) continue
    for (let c: MindmapNode | undefined = n; c && !keep.has(c.id); c = c.parentId ? byId.get(c.parentId) : undefined) keep.add(c.id)
  }
  return new Set(nodes.filter(n => !keep.has(n.id)).map(n => n.id))
}
