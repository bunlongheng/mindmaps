import { describe, it, expect } from 'vitest'
import { legendHidden, matchesLegend } from '../legend'
import type { MindmapNode } from '../../types'

const node = (id: string, parentId: string | null, extra: Partial<MindmapNode> = {}): MindmapNode =>
  ({ id, title: id, color: '#000', parentId, depth: 0, x: 0, y: 0, width: 10, height: 10, ...extra })

const nodes = [
  node('root', null),
  node('a', 'root'), node('a1', 'a', { emoji: '🔴' }), node('a2', 'a', { emoji: '🟢' }),
  node('b', 'root'), node('b1', 'b', { emoji: '🟢' }), node('b2', 'b', { color: '#f00' }),
]
const legend = [{ emoji: '🔴', label: 'Deep' }, { emoji: '🟢', label: 'Light' }, { color: '#f00', label: 'Red' }]

describe('legend', () => {
  it('matches by emoji, or by colour only when the row has no emoji', () => {
    expect(matchesLegend(nodes[2], legend[0])).toBe(true)
    expect(matchesLegend(nodes[6], legend[2])).toBe(true)
    expect(matchesLegend(node('x', 'root', { color: '#f00' }), { emoji: '🔴', color: '#f00', label: 'x' })).toBe(false)
  })

  it('hides nothing with no focus', () => {
    expect(legendHidden(nodes, legend, []).size).toBe(0)
  })

  it('keeps the focused rows, their ancestors and the root', () => {
    expect([...legendHidden(nodes, legend, [0])].sort()).toEqual(['a2', 'b', 'b1', 'b2'])
  })

  it('combines several focused rows and ignores bad indexes', () => {
    expect([...legendHidden(nodes, legend, [0, 2, 9])].sort()).toEqual(['a2', 'b1'])
  })
})
