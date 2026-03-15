import type { Diagram, IdeaNode } from '../../types'

function sanitize(s: string) { return s.replace(/[^a-zA-Z0-9 _-]/g, '') }

function walkUML(nodes: IdeaNode[], parentId: string | null, lines: string[]) {
  nodes.filter(n => n.parentId === parentId).forEach(n => {
    const parent = nodes.find(p => p.id === parentId)
    if (parent) {
      lines.push(`[${sanitize(parent.title)}] --> [${sanitize(n.title)}]`)
    }
    walkUML(nodes, n.id, lines)
  })
}

export function exportToUML(diagram: Diagram): string {
  const lines = ['@startuml', `title ${diagram.name}`, '']
  walkUML(diagram.nodes, null, lines)
  lines.push('', '@enduml')
  return lines.join('\n')
}

export function downloadUML(diagram: Diagram) {
  const blob = new Blob([exportToUML(diagram)], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${diagram.name.replace(/\s+/g, '_')}.puml`
  a.click()
  URL.revokeObjectURL(url)
}
