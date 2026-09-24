import { describe, it, expect } from 'vitest'
import { levelCounts } from '../nodeCounts'

interface FixtureNode { id: string; parentId: string | null; depth: number; title: string }

function node(id: string, parentId: string | null, depth: number, title = id): FixtureNode {
  return { id, parentId, depth, title }
}

describe('levelCounts', () => {
  it('counts per level, total, deepest, and largest branch', () => {
    const nodes: FixtureNode[] = [
      node('root', null, 0, 'Root'),
      // 3 L1
      node('a', 'root', 1, 'A'),
      node('b', 'root', 1, 'B'),
      node('c', 'root', 1, 'C'),
      // 5 L2 (3 under A, 2 under B, 0 under C)
      node('a1', 'a', 2),
      node('a2', 'a', 2),
      node('a3', 'a', 2),
      node('b1', 'b', 2),
      node('b2', 'b', 2),
      // 2 L3, both under A's subtree
      node('a1x', 'a1', 3),
      node('a2x', 'a2', 3),
    ]

    const result = levelCounts(nodes)

    expect(result.byDepth).toEqual([1, 3, 5, 2])
    expect(result.total).toBe(11)
    expect(result.deepest).toBe(3)
    // A has 5 descendants (a1,a2,a3,a1x,a2x) vs B's 2 and C's 0
    expect(result.largestBranch).toEqual({ title: 'A', count: 5 })
  })

  it('returns total 0 and largestBranch null for empty nodes, without throwing', () => {
    expect(() => levelCounts([])).not.toThrow()
    const result = levelCounts([])
    expect(result.total).toBe(0)
    expect(result.largestBranch).toBeNull()
  })
})
