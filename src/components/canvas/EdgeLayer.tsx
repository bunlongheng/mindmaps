import type { MindNode } from '../../types'
import type { LineStyle, DiagramType } from '../../types'
import { Edge } from './Edge'

interface EdgeLayerProps {
  nodes: MindNode[]
  lineStyle: LineStyle
  diagramType: DiagramType
}

function BraceConnector({ root, children }: { root: MindNode; children: MindNode[] }) {
  if (children.length === 0) return null

  const rx = root.x + root.width
  const ry = root.y + root.height / 2

  if (children.length === 1) {
    const c = children[0]
    const cx = c.x
    const cy = c.y + c.height / 2
    const mx = (rx + cx) / 2
    return (
      <path
        d={`M ${rx} ${ry} C ${mx} ${ry} ${mx} ${cy} ${cx} ${cy}`}
        stroke={c.color}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
    )
  }

  const firstCY = children[0].y + children[0].height / 2
  const lastCY = children[children.length - 1].y + children[children.length - 1].height / 2
  const midY = (firstCY + lastCY) / 2
  const spineX = rx + 32
  const knotX = spineX - 10
  const cr = 10

  return (
    <g>
      {/* Connector: root right → brace knot */}
      <path
        d={`M ${rx} ${ry} C ${rx + 20} ${ry} ${knotX + 4} ${midY} ${knotX} ${midY}`}
        stroke="#94a3b8"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Brace top half */}
      <path
        d={`M ${knotX} ${midY} Q ${spineX} ${midY} ${spineX} ${midY - cr} L ${spineX} ${firstCY + cr} Q ${spineX} ${firstCY} ${spineX + cr} ${firstCY}`}
        stroke="#94a3b8"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Brace bottom half */}
      <path
        d={`M ${knotX} ${midY} Q ${spineX} ${midY} ${spineX} ${midY + cr} L ${spineX} ${lastCY - cr} Q ${spineX} ${lastCY} ${spineX + cr} ${lastCY}`}
        stroke="#94a3b8"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Individual branches from brace tip to each child */}
      {children.map(child => {
        const cy = child.y + child.height / 2
        return (
          <path
            key={child.id}
            d={`M ${spineX + cr} ${cy} H ${child.x}`}
            stroke={child.color}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
          />
        )
      })}
    </g>
  )
}

export function EdgeLayer({ nodes, lineStyle, diagramType }: EdgeLayerProps) {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  if (diagramType === 'mindmap') {
    const root = nodes.find(n => n.parentId === null)
    if (!root) return null
    const directChildren = nodes.filter(n => n.parentId === root.id)

    // Deeper edges (grandchildren+) use regular curved lines
    const deepEdges: Array<{ parent: MindNode; child: MindNode }> = []
    for (const node of nodes) {
      if (node.parentId && node.parentId !== root.id && nodeMap.has(node.parentId)) {
        deepEdges.push({ parent: nodeMap.get(node.parentId)!, child: node })
      }
    }

    return (
      <g>
        <BraceConnector root={root} children={directChildren} />
        {deepEdges.map(({ parent, child }) => {
          const px = parent.x + parent.width
          const py = parent.y + parent.height / 2
          const cx = child.x
          const cy = child.y + child.height / 2
          const mx = (px + cx) / 2
          return (
            <path
              key={child.id}
              d={`M ${px} ${py} C ${mx} ${py} ${mx} ${cy} ${cx} ${cy}`}
              stroke={child.color}
              strokeWidth={1.8}
              fill="none"
              strokeLinecap="round"
            />
          )
        })}
      </g>
    )
  }

  if (diagramType === 'fishbone') {
    const root = nodes.find(n => n.parentId === null)
    const edges = nodes.filter(n => n.parentId && nodeMap.has(n.parentId))
      .map(n => ({ parent: nodeMap.get(n.parentId!)!, child: n }))
    if (root) {
      const spineY = root.y + root.height / 2
      return (
        <g>
          <line x1={100} y1={spineY} x2={root.x + root.width} y2={spineY} stroke="#94a3b8" strokeWidth={3} strokeLinecap="round" />
          {edges.map(({ parent, child }) => (
            <Edge key={child.id} parent={parent} child={child} lineStyle={lineStyle} diagramType={diagramType} />
          ))}
        </g>
      )
    }
  }

  const edges = nodes.filter(n => n.parentId && nodeMap.has(n.parentId))
    .map(n => ({ parent: nodeMap.get(n.parentId!)!, child: n }))

  return (
    <g>
      {edges.map(({ parent, child }) => (
        <Edge key={child.id} parent={parent} child={child} lineStyle={lineStyle} diagramType={diagramType} />
      ))}
    </g>
  )
}
