import type { MindNode } from '../../types'
import type { LineStyle, DiagramType } from '../../types'
import { Edge } from './Edge'

interface EdgeLayerProps {
  nodes: MindNode[]
  lineStyle: LineStyle
  diagramType: DiagramType
}

export function EdgeLayer({ nodes, lineStyle, diagramType }: EdgeLayerProps) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges: Array<{ parent: MindNode; child: MindNode }> = []

  for (const node of nodes) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      edges.push({ parent: nodeMap.get(node.parentId)!, child: node })
    }
  }

  if (diagramType === 'fishbone') {
    const root = nodes.find(n => n.parentId === null)
    if (root) {
      const spineEndX = root.x
      const spineY = root.y + root.height / 2
      return (
        <g>
          {/* Spine */}
          <line
            x1={100} y1={spineY}
            x2={spineEndX + root.width} y2={spineY}
            stroke="#94a3b8" strokeWidth={3} strokeLinecap="round"
          />
          {edges.map(({ parent, child }) => (
            <Edge key={child.id} parent={parent} child={child} lineStyle={lineStyle} diagramType={diagramType} />
          ))}
        </g>
      )
    }
  }

  return (
    <g>
      {edges.map(({ parent, child }) => (
        <Edge key={child.id} parent={parent} child={child} lineStyle={lineStyle} diagramType={diagramType} />
      ))}
    </g>
  )
}
