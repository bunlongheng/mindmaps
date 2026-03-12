import type { Diagram } from '../../types'

export function exportToJSON(diagram: Diagram): string {
  return JSON.stringify(diagram, null, 2)
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
