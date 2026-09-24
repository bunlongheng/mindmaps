import { describe, it, expect } from 'vitest'
import { computeFishboneLayout } from '../fishbone'
import { computeTimelineLayout } from '../timeline'
import { findOverlaps } from './overlapCheck'
import fixtureRaw from './fixtures/mm-8206.json'
import type { MindmapNode } from '../../../types'

function node(overrides: Partial<MindmapNode> & { id: string }): MindmapNode {
  return {
    title: 'Node',
    color: '#6366f1',
    parentId: null,
    depth: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ...overrides,
  }
}

// Real 52-node map that reproduced the bug: 1 root, 2 L1, 10 L2, 39 L3.
function loadFixture(): MindmapNode[] {
  return (fixtureRaw as { nodes: MindmapNode[] }).nodes
}

// Synthetic worst case: root, 4 L1, 5 L2 each, 6 L3 each (145 nodes).
function syntheticTree(): MindmapNode[] {
  const nodes: MindmapNode[] = [node({ id: 'root', depth: 0, title: 'Root' })]
  for (let i = 0; i < 4; i++) {
    const l1Id = `l1-${i}`
    nodes.push(node({ id: l1Id, parentId: 'root', depth: 1, sortOrder: i, title: `L1 ${i}` }))
    for (let j = 0; j < 5; j++) {
      const l2Id = `l2-${i}-${j}`
      nodes.push(node({ id: l2Id, parentId: l1Id, depth: 2, sortOrder: j, title: `L2 ${i}.${j}` }))
      for (let k = 0; k < 6; k++) {
        nodes.push(node({ id: `l3-${i}-${j}-${k}`, parentId: l2Id, depth: 3, sortOrder: k, title: `L3 ${i}.${j}.${k}` }))
      }
    }
  }
  return nodes
}

describe('fishbone and timeline layouts reserve room for L3 subtrees', () => {
  it('produces 0 overlapping boxes for fishbone on the mm-8206 fixture (was 42)', () => {
    const out = computeFishboneLayout(loadFixture())
    expect(findOverlaps(out)).toHaveLength(0)
  })

  it('produces 0 overlapping boxes for timeline on the mm-8206 fixture (was 62)', () => {
    const out = computeTimelineLayout(loadFixture())
    expect(findOverlaps(out)).toHaveLength(0)
  })

  it('produces 0 overlapping boxes for fishbone on a synthetic 4x5x6 tree', () => {
    const out = computeFishboneLayout(syntheticTree())
    expect(findOverlaps(out)).toHaveLength(0)
  })

  it('produces 0 overlapping boxes for timeline on a synthetic 4x5x6 tree', () => {
    const out = computeTimelineLayout(syntheticTree())
    expect(findOverlaps(out)).toHaveLength(0)
  })

  it('still alternates fishbone L1 heads above and below the spine on the fixture', () => {
    const nodes = loadFixture()
    const out = computeFishboneLayout(nodes)
    const rootId = nodes.find(n => n.parentId === null)!.id
    const l1s = nodes
      .filter(n => n.parentId === rootId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const SPINE_Y = 400
    l1s.forEach((l1, i) => {
      const placed = out.find(n => n.id === l1.id)!
      const cy = placed.y + placed.height / 2
      if (i % 2 === 0) expect(cy).toBeLessThan(SPINE_Y)
      else expect(cy).toBeGreaterThan(SPINE_Y)
    })
  })

  it('still alternates timeline L1 events above and below the spine on the fixture', () => {
    const nodes = loadFixture()
    const out = computeTimelineLayout(nodes)
    const rootId = nodes.find(n => n.parentId === null)!.id
    const l1s = nodes
      .filter(n => n.parentId === rootId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const SPINE_Y = 400
    l1s.forEach((l1, i) => {
      const l2s = nodes.filter(n => n.parentId === l1.id)
      if (l2s.length === 0) return // nothing to check direction against
      const firstL2 = out.find(n => n.id === l2s[0].id)!
      const cy = firstL2.y + firstL2.height / 2
      if (i % 2 === 0) expect(cy).toBeLessThan(SPINE_Y)
      else expect(cy).toBeGreaterThan(SPINE_Y)
    })
  })
})
