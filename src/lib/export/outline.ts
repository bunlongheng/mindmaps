import type { Diagram } from '../../types/index.js'

// The map as an indented Markdown outline - the shape an AI agent reads best.
export function toOutline(diagram: Diagram): string {
  const kids = (pid: string | null) => diagram.nodes
    .filter(n => n.parentId === pid)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const walk = (pid: string, depth: number): string[] => kids(pid).flatMap(n =>
    [`${'  '.repeat(depth)}- ${n.title}${n.url ? ` (${n.url})` : ''}`, ...walk(n.id, depth + 1)])
  const root = kids(null)[0]
  return `# ${diagram.name}\n\n${root ? walk(root.id, 0).join('\n') : ''}\n`
}
