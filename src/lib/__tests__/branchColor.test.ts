import { describe, it, expect } from 'vitest'
import { computeBranchColors, type BranchColorNode } from '../branchColor'
import { L1_PALETTE } from '../color'

describe('computeBranchColors', () => {
  it('resolves depth-1 nodes to the wheel colour by sortOrder by default', () => {
    const root: BranchColorNode = { id: 'root', parentId: null, depth: 0, color: '#6366f1' }
    const l1a: BranchColorNode = { id: 'a', parentId: 'root', depth: 1, sortOrder: 0, color: '#ef4444' }
    const l1b: BranchColorNode = { id: 'b', parentId: 'root', depth: 1, sortOrder: 3, color: '#ef4444' }
    const colors = computeBranchColors([root, l1a, l1b])
    expect(colors.get('a')).toBe(L1_PALETTE[0])
    expect(colors.get('b')).toBe(L1_PALETTE[3])
    expect(colors.get('root')).toBeNull()
  })

  it('a manual colour wins for that node over the wheel', () => {
    const root: BranchColorNode = { id: 'root', parentId: null, depth: 0, color: '#6366f1' }
    const l1: BranchColorNode = { id: 'a', parentId: 'root', depth: 1, sortOrder: 0, color: '#123456', colorMode: 'manual' }
    const colors = computeBranchColors([root, l1])
    expect(colors.get('a')).toBe('#123456')
    expect(colors.get('a')).not.toBe(L1_PALETTE[0])
  })

  it('descendants inherit the nearest manual ancestor colour', () => {
    const root: BranchColorNode = { id: 'root', parentId: null, depth: 0, color: '#6366f1' }
    const l1: BranchColorNode = { id: 'a', parentId: 'root', depth: 1, sortOrder: 0, color: '#123456', colorMode: 'manual' }
    const l2: BranchColorNode = { id: 'b', parentId: 'a', depth: 2, color: '#ef4444' }
    const l3: BranchColorNode = { id: 'c', parentId: 'b', depth: 3, color: '#ef4444' }
    const colors = computeBranchColors([root, l1, l2, l3])
    expect(colors.get('b')).toBe('#123456')
    expect(colors.get('c')).toBe('#123456')
  })

  it('a manual node deeper in the tree overrides its own subtree, not its ancestor', () => {
    const root: BranchColorNode = { id: 'root', parentId: null, depth: 0, color: '#6366f1' }
    const l1: BranchColorNode = { id: 'a', parentId: 'root', depth: 1, sortOrder: 0, color: '#ef4444' }
    const l2: BranchColorNode = { id: 'b', parentId: 'a', depth: 2, color: '#00ff00', colorMode: 'manual' }
    const l3: BranchColorNode = { id: 'c', parentId: 'b', depth: 3, color: '#ef4444' }
    const colors = computeBranchColors([root, l1, l2, l3])
    expect(colors.get('a')).toBe(L1_PALETTE[0])
    expect(colors.get('b')).toBe('#00ff00')
    expect(colors.get('c')).toBe('#00ff00')
  })

  it('an existing map with no colorMode field renders exactly as before (auto)', () => {
    const root: BranchColorNode = { id: 'root', parentId: null, depth: 0, color: '#6366f1' }
    const l1: BranchColorNode = { id: 'a', parentId: 'root', depth: 1, sortOrder: 5, color: '#ef4444' }
    const l2: BranchColorNode = { id: 'b', parentId: 'a', depth: 2, color: '#ef4444' }
    const colors = computeBranchColors([root, l1, l2])
    expect(colors.get('a')).toBe(L1_PALETTE[5])
    expect(colors.get('b')).toBe(L1_PALETTE[5])
  })

  it('returns null when no L1 ancestor exists (broken chain)', () => {
    const orphan: BranchColorNode = { id: 'g', parentId: 'ghost', depth: 2, color: '#ef4444' }
    const colors = computeBranchColors([orphan])
    expect(colors.get('g')).toBeNull()
  })
})
