import { describe, it, expect, vi } from 'vitest'
import { exportToJSON, importFromJSON, downloadJSON } from '../export/json'
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

  it('serializes bold, italic, and non-center textAlign extras', () => {
    const styled: MindmapNode = { ...child1, bold: true, italic: true, textAlign: 'left' }
    const diagram = makeDiagram([root, styled])
    const parsed = JSON.parse(exportToJSON(diagram))
    const child = parsed['Test Map'][0]
    expect(child[styled.title]).toBeNull() // leaf with extras: title key maps to null
    expect(child.bold).toBe(true)
    expect(child.italic).toBe(true)
    expect(child.textAlign).toBe('left')
  })

  it('omits textAlign when it is "center" (default)', () => {
    const centered: MindmapNode = { ...child1, textAlign: 'center' }
    const diagram = makeDiagram([root, centered])
    const parsed = JSON.parse(exportToJSON(diagram))
    // center default → treated as no extras → plain string title
    expect(parsed['Test Map'][0]).toBe('Child 1')
  })

  it('emits root icon and emoji at the top level', () => {
    const styledRoot: MindmapNode = { ...root, icon: 'home', emoji: '🏠' }
    const diagram = makeDiagram([styledRoot, child1])
    const parsed = JSON.parse(exportToJSON(diagram))
    expect(parsed.icon).toBe('home')
    expect(parsed.emoji).toBe('🏠')
  })

  it('nests children under a parent with extras', () => {
    const parent: MindmapNode = { ...child1, icon: 'folder' }
    const grandchild: MindmapNode = {
      id: 'gc', title: 'Grandchild', color: '#00f', parentId: 'c1',
      depth: 2, x: 0, y: 0, width: 100, height: 40, sortOrder: 0,
    }
    const diagram = makeDiagram([root, parent, grandchild])
    const parsed = JSON.parse(exportToJSON(diagram))
    const node = parsed['Test Map'][0]
    expect(node['Child 1']).toEqual(['Grandchild'])
    expect(node.icon).toBe('folder')
  })

  it('defaults missing sortOrder to 0 when sorting', () => {
    const noOrderA: MindmapNode = { ...child1, sortOrder: undefined }
    const noOrderB: MindmapNode = { ...child2, sortOrder: undefined }
    const diagram = makeDiagram([root, noOrderA, noOrderB])
    expect(() => exportToJSON(diagram)).not.toThrow()
    const parsed = JSON.parse(exportToJSON(diagram))
    expect(parsed['Test Map']).toHaveLength(2)
  })

  it('handles empty diagram (root only)', () => {
    const diagram = makeDiagram([root])
    const parsed = JSON.parse(exportToJSON(diagram))
    expect(parsed['Test Map']).toEqual([])
  })

  it('uses null parent fallback when no root node exists', () => {
    // No node with parentId === null → root?.id ?? null path
    const orphan: MindmapNode = { ...child1, parentId: 'missing' }
    const diagram = makeDiagram([orphan])
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

describe('downloadJSON', () => {
  it('creates a blob URL, triggers download anchor, and revokes the URL', () => {
    const diagram = makeDiagram([root, child1])
    diagram.name = 'My Cool Map'

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    let clicked: HTMLAnchorElement | null = null
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicked = this
      })

    downloadJSON(diagram)

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(clicked!.href).toContain('blob:mock-url')
    // spaces replaced with underscores + .json extension
    expect(clicked!.download).toBe('My_Cool_Map.json')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
    clickSpy.mockRestore()
  })
})
