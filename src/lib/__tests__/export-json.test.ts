import { describe, it, expect } from 'vitest'
import { exportToJSON, importFromJSON } from '../export/json'
import type { Diagram, MindmapNode } from '../../types'

function makeDiagram(nodes: MindmapNode[]): Diagram {
  return {
    id: 'test-id', name: 'Test Map', type: 'logic-chart', lineStyle: 'orthogonal',
    nodes, createdAt: '2024-01-01', updatedAt: '2024-01-01',
  }
}

const root: MindmapNode = {
  id: 'root', title: 'Root', color: '#000', parentId: null,
  depth: 0, x: 0, y: 0, width: 180, height: 180,
}
const child1: MindmapNode = {
  id: 'c1', title: 'Child 1', color: '#f00', parentId: 'root',
  depth: 1, x: 300, y: 0, width: 200, height: 40, sortOrder: 0,
}
const child2: MindmapNode = {
  id: 'c2', title: 'Child 2', color: '#0f0', parentId: 'root',
  depth: 1, x: 300, y: 60, width: 200, height: 40, sortOrder: 1,
}

describe('exportToJSON', () => {
  it('produces valid JSON string', () => {
    const diagram = makeDiagram([root, child1, child2])
    const json = exportToJSON(diagram)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('uses diagram name as root key', () => {
    const diagram = makeDiagram([root, child1])
    const parsed = JSON.parse(exportToJSON(diagram))
    expect(parsed).toHaveProperty('Test Map')
  })

  it('preserves child order by sortOrder', () => {
    const diagram = makeDiagram([root, child2, child1]) // reversed in array
    const parsed = JSON.parse(exportToJSON(diagram))
    const children = parsed['Test Map']
    expect(children[0]).toBe('Child 1')
    expect(children[1]).toBe('Child 2')
  })

  it('includes extras like icon and emoji', () => {
    const withIcon: MindmapNode = { ...child1, icon: 'rocket', emoji: '🚀' }
    const diagram = makeDiagram([root, withIcon])
    const parsed = JSON.parse(exportToJSON(diagram))
    const child = parsed['Test Map'][0]
    expect(child.icon).toBe('rocket')
    expect(child.emoji).toBe('🚀')
  })

  it('handles empty diagram (root only)', () => {
    const diagram = makeDiagram([root])
    const parsed = JSON.parse(exportToJSON(diagram))
    expect(parsed['Test Map']).toEqual([])
  })
})

describe('importFromJSON', () => {
  it('returns null for invalid JSON', () => {
    expect(importFromJSON('not json')).toBeNull()
  })

  it('returns null for JSON missing required fields', () => {
    expect(importFromJSON('{"name": "test"}')).toBeNull() // no id or nodes
  })

  it('returns null for empty string', () => {
    expect(importFromJSON('')).toBeNull()
  })

  it('parses valid diagram JSON', () => {
    const diagram = makeDiagram([root, child1])
    const json = JSON.stringify(diagram)
    const result = importFromJSON(json)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('test-id')
    expect(result!.nodes).toHaveLength(2)
  })
})
