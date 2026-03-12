import type { MindNode } from '../../types'
import type { LineStyle } from '../../types'
import { nodeCenterRight, nodeCenterLeft, nodeCenterBottom, nodeCenterTop, nodeCenter, buildStraightPath, buildCurvedPath, buildOrthogonalPath } from '../../lib/geometry'
import { applyDepthTransparency } from '../../lib/color'

interface EdgeProps {
  parent: MindNode
  child: MindNode
  lineStyle: LineStyle
  diagramType: string
}

export function Edge({ parent, child, lineStyle, diagramType }: EdgeProps) {
  let src, tgt
  if (diagramType === 'tree-vertical') {
    src = nodeCenterBottom(parent)
    tgt = nodeCenterTop(child)
  } else if (diagramType === 'tree-horizontal') {
    src = nodeCenterRight(parent)
    tgt = nodeCenterLeft(child)
  } else if (diagramType === 'fishbone') {
    src = nodeCenter(parent)
    tgt = nodeCenter(child)
  } else {
    // mindmap — connect center of parent to center of child
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

  const stroke = applyDepthTransparency(child.color, child.depth)

  return (
    <path
      d={d}
      stroke={stroke}
      strokeWidth={child.depth === 1 ? 2.5 : 1.5}
      fill="none"
      strokeLinecap="round"
    />
  )
}
