import type { Diagram } from '../../types/index.js'

// The map as an indented Markdown outline - the shape an AI agent reads best.
export function toOutline(diagram: Diagram): string {
  const kids = (pid: string | null) => diagram.nodes
    .filter(n => n.parentId === pid)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const walk = (pid: string, depth: number): string[] => kids(pid).flatMap(n =>
    [`${'  '.repeat(depth)}- ${n.emoji ? `${n.emoji} ` : ''}${n.title}${n.url ? ` (${n.url})` : ''}`, ...walk(n.id, depth + 1)])
  const root = kids(null)[0]
  // The note and legend lead, so an agent knows what the map is and what each dot means
  const note = root?.note ? [root.note.title && `**${root.note.title}**`, root.note.body].filter(Boolean).join('\n\n') + '\n\n' : ''
  const legend = root?.legend?.length
    ? `Legend:\n${root.legend.map(r => `- ${r.emoji ?? r.color ?? ''} ${r.label}`.replace('-  ', '- ')).join('\n')}\n\n` : ''
  return `# ${diagram.name}\n\n${note}${legend}${root ? walk(root.id, 0).join('\n') : ''}\n`
}
