import type { MindmapNode } from '../../types'
import type { LineStyle } from '../../types'
import { nodeCenterRight, nodeCenterLeft, nodeCenter, buildStraightPath, buildCurvedPath, buildOrthogonalPath } from '../../lib/geometry'
import { applyDepthTransparency } from '../../lib/color'

interface EdgeProps {
  parent: MindmapNode
  child: MindmapNode
  lineStyle: LineStyle
  diagramType: string
  // Palette colour for the child, so connectors match the node fill (not a stale stored colour)
  color?: string
}

export function Edge({ parent, child, lineStyle, diagramType, color }: EdgeProps) {
  let src, tgt
  if (diagramType === 'fishbone') {
    src = nodeCenter(parent)
    tgt = nodeCenter(child)
  } else {
    // mindmaps — connect center of parent to center of child
    const pc = nodeCenter(parent)
    const cc = nodeCenter(child)
    // exit from the side of parent facing the child
    if (cc.x > pc.x) {
      src = nodeCenterRight(parent)
      tgt = nodeCenterLeft(child)
    } else {
      src = nodeCenterLeft(parent)
      tgt = nodeCenterRight(child)
    }
  }

  let d: string
  switch (lineStyle) {
    case 'straight': d = buildStraightPath(src, tgt); break
    case 'orthogonal': d = buildOrthogonalPath(src, tgt); break
    default: d = buildCurvedPath(src, tgt)
  }

  const stroke = applyDepthTransparency(color ?? child.color, child.depth)

  return (
    <path
      d={d}
      stroke={stroke}
      strokeWidth={1.5}
      fill="none"
      strokeLinecap="round"
    />
  )
}
