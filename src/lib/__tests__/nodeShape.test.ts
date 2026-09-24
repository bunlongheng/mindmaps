import { describe, it, expect } from 'vitest'
import type { MindmapNode } from '../../types'
import { shapeRx, shapedNodeSize, NODE_SHAPES, type NodeShape } from '../nodeShape'

function mk(over: Partial<MindmapNode> = {}): MindmapNode {
  return { id: 'n', title: 'Regression analysis', color: '#ef4444', parentId: 'p', depth: 2, x: 0, y: 0, width: 110, height: 38, ...over }
}

describe('NodeShape type', () => {
  it('accepts the 4 shapes on a node', () => {
    const shapes: NodeShape[] = ['rect', 'rounded', 'pill', 'circle']
    expect(NODE_SHAPES).toEqual(shapes)
    for (const shape of shapes) {
      const node = mk({ shape })
      expect(node.shape).toBe(shape)
    }
  })
})

describe('shapeRx', () => {
  it('squares the corners for rect', () => {
    expect(shapeRx('rect', 40, 3)).toBe(0)
  })

  it('keeps the default radius for rounded and for no shape at all', () => {
    expect(shapeRx('rounded', 40, 3)).toBe(3)
    expect(shapeRx(undefined, 40, 3)).toBe(3)
  })

  it('fully rounds the ends for pill and circle', () => {
    expect(shapeRx('pill', 40, 3)).toBe(20)
    expect(shapeRx('circle', 80, 3)).toBe(40)
  })
})

describe('shapedNodeSize', () => {
  it('leaves the box alone when no shape is set', () => {
    expect(shapedNodeSize(mk(), 16, 110, 38)).toEqual({ w: 110, h: 38 })
  })

  it('leaves the box alone for rect, rounded and pill', () => {
    for (const shape of ['rect', 'rounded', 'pill'] as const) {
      expect(shapedNodeSize(mk({ shape }), 16, 110, 38)).toEqual({ w: 110, h: 38 })
    }
  })

  it('squares the box for circle and never shrinks below it', () => {
    const { w, h } = shapedNodeSize(mk({ shape: 'circle' }), 16, 110, 38)
    expect(w).toBe(h)
    expect(w).toBeGreaterThanOrEqual(110)
  })

  it('grows the circle to fit a longer label', () => {
    const short = shapedNodeSize(mk({ shape: 'circle', title: 'Hi' }), 16, 40, 38).w
    const long = shapedNodeSize(mk({ shape: 'circle', title: 'A considerably longer node label here' }), 16, 40, 38).w
    expect(long).toBeGreaterThan(short)
  })

  it('never reshapes the root', () => {
    expect(shapedNodeSize(mk({ depth: 0, shape: 'circle' }), 28, 180, 90)).toEqual({ w: 180, h: 90 })
  })
})
