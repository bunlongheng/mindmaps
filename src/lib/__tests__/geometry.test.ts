import { describe, it, expect } from 'vitest'
import {
  nodeRect, nodeCenterRight, nodeCenterLeft, nodeCenterBottom,
  nodeCenterTop, nodeCenter, buildStraightPath, buildCurvedPath, buildOrthogonalPath,
} from '../geometry'
import type { MindmapNode } from '../../types'

const makeNode = (overrides: Partial<MindmapNode> = {}): MindmapNode => ({
  id: 'test', title: 'Test', color: '#000', parentId: null,
  depth: 0, x: 100, y: 200, width: 300, height: 50,
  ...overrides,
})

describe('nodeRect', () => {
  it('returns bounding rect', () => {
    const n = makeNode()
    expect(nodeRect(n)).toEqual({ x: 100, y: 200, w: 300, h: 50 })
  })
})

describe('node center/edge points', () => {
  const n = makeNode()

  it('nodeCenterRight', () => {
    expect(nodeCenterRight(n)).toEqual({ x: 400, y: 225 })
  })
  it('nodeCenterLeft', () => {
    expect(nodeCenterLeft(n)).toEqual({ x: 100, y: 225 })
  })
  it('nodeCenterBottom', () => {
    expect(nodeCenterBottom(n)).toEqual({ x: 250, y: 250 })
  })
  it('nodeCenterTop', () => {
    expect(nodeCenterTop(n)).toEqual({ x: 250, y: 200 })
  })
  it('nodeCenter', () => {
    expect(nodeCenter(n)).toEqual({ x: 250, y: 225 })
  })
})

describe('path builders', () => {
  const src = { x: 0, y: 0 }
  const tgt = { x: 100, y: 50 }

  it('buildStraightPath', () => {
    const path = buildStraightPath(src, tgt)
    expect(path).toBe('M 0 0 L 100 50')
  })

  it('buildCurvedPath contains cubic bezier', () => {
    const path = buildCurvedPath(src, tgt)
    expect(path).toMatch(/^M 0 0 C .+ .+ .+ .+ 100 50$/)
  })

  it('buildOrthogonalPath', () => {
    const path = buildOrthogonalPath(src, tgt)
    expect(path).toBe('M 0 0 H 50 V 50 H 100')
  })
})
