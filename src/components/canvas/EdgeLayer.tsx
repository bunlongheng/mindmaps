import type { MindmapNode } from '../../types'
import type { LineStyle, DiagramType } from '../../types'
import { Edge } from './Edge'
import { FISHBONE_SLANT } from '../../lib/layout/fishbone'
import { useMindmapStore } from '../../store/mindmapStore'


interface EdgeLayerProps {
  nodes: MindmapNode[]
  lineStyle: LineStyle
  diagramType: DiagramType
}

/** Curved bezier connecting parent center-edge to child center-edge (auto-detects direction) */
function CurvedEdge({ parent, child, goRight = true }: { parent: MindmapNode; child: MindmapNode; goRight?: boolean }) {
  const x1 = goRight ? parent.x + parent.width : parent.x
  const y1 = parent.y + parent.height / 2
  const x2 = goRight ? child.x : child.x + child.width
  const y2 = child.y + child.height / 2
  const cx = (x1 + x2) / 2
  return (
    <path
      d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
      stroke={child.color}
      strokeWidth={2}
      fill="none"
      strokeLinecap="round"
    />
  )
}

/** Curly-brace connector — renders an actual { shape between parent and its children */
function BracketConnector({ parent, children, goRight = true, showOrderNumbers = false }: { parent: MindmapNode; children: MindmapNode[]; goRight?: boolean; showOrderNumbers?: boolean }) {
  if (children.length === 0) return null

  const sorted = [...children].sort((a, b) => a.y - b.y)

  // Single child: simple bezier, no brace needed
  if (children.length === 1) {
    return <CurvedEdge parent={parent} child={sorted[0]} goRight={goRight} />
  }

  const px = goRight ? parent.x + parent.width : parent.x
  const py = parent.y + parent.height / 2
  const topY  = sorted[0].y + sorted[0].height / 2
  const botY  = sorted[sorted.length - 1].y + sorted[sorted.length - 1].height / 2
  const midY  = (topY + botY) / 2
  const h     = botY - topY
  const tip   = Math.max(10, Math.min(20, h * 0.1))   // protrusion of the { tip
  const r     = Math.min(14, h * 0.22)                // corner radius of the curves

  // braceX = the "spine" of the { (where stubs to children attach)
  // tipX   = the pointy middle of the {
  const childEdgeX = goRight ? sorted[0].x : sorted[0].x + sorted[0].width
  const gap = Math.abs(childEdgeX - px)
  const braceX = goRight ? childEdgeX - Math.max(12, gap * 0.3) : childEdgeX + Math.max(12, gap * 0.3)
  const tipX   = goRight ? braceX - tip : braceX + tip

  // Curly brace path: top arm → tip → bottom arm
  const d = [
    `M ${braceX} ${topY}`,
    `C ${braceX} ${topY + r}, ${tipX} ${midY - r}, ${tipX} ${midY}`,
    `C ${tipX} ${midY + r}, ${braceX} ${botY - r}, ${braceX} ${botY}`,
  ].join(' ')

  const braceColor = sorted[Math.floor(sorted.length / 2)].color

  return (
    <g>
      {/* Horizontal connector: parent edge → brace tip */}
      <line x1={px} y1={py} x2={tipX} y2={midY}
        stroke={braceColor} strokeWidth={2} strokeLinecap="round" />
      {/* The curly brace */}
      <path d={d} stroke={braceColor} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Stubs: brace spine → each child */}
      {sorted.map(child => {
        const cy  = child.y + child.height / 2
        const cx2 = goRight ? child.x : child.x + child.width
        const midX = (braceX + cx2) / 2
        return (
          <g key={child.id}>
            <line x1={braceX} y1={cy} x2={cx2} y2={cy}
              stroke={child.color} strokeWidth={2} strokeLinecap="round" />
            {showOrderNumbers && parent.depth === 0 && (
              <>
                <circle cx={midX} cy={cy} r={13} fill={child.color} />
                <text x={midX} y={cy + 5}
                  textAnchor="middle" fontSize={13} fontWeight="700"
                  fontFamily="Inter, system-ui, sans-serif" fill="#fff"
                  style={{ pointerEvents: 'none' }}>
                  {(child.sortOrder ?? 0) + 1}
                </text>
              </>
            )}
          </g>
        )
      })}
    </g>
  )
}

export function EdgeLayer({ nodes, lineStyle, diagramType }: EdgeLayerProps) {
  const showOrderNumbers = useMindmapStore(s => s.showOrderNumbers)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // ── Logic Chart ───────────────────────────────────────────────────────────
  if (diagramType === 'logic-chart') {
    const root = nodes.find(n => n.parentId === null)
    if (!root) return null

    const l1Nodes = nodes.filter(n => n.parentId === root.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    const rootRightX = root.x + root.width
    const rootCY = root.y + root.height / 2
    const l1LeftX = l1Nodes.length > 0 ? l1Nodes[0].x : rootRightX + 120
    const barX = l1LeftX - 60
    const sortedL1 = [...l1Nodes].sort((a, b) => a.y - b.y)
    const l1MidY = sortedL1.length > 0
      ? ((sortedL1[0].y + sortedL1[0].height / 2) + (sortedL1[sortedL1.length - 1].y + sortedL1[sortedL1.length - 1].height / 2)) / 2
      : rootCY
    const trunk = l1Nodes.length > 0 && (
      <>
        <line x1={rootRightX} y1={l1MidY} x2={barX} y2={l1MidY}
          stroke="#1a1d2e" strokeWidth={4} strokeLinecap="round" />
        {l1Nodes.length > 1 && l1Nodes.map((l1, i) => {
          if (i === l1Nodes.length - 1) return null
          const nextL1 = l1Nodes[i + 1]
          return (
            <line key={`vbar-${l1.id}`}
              x1={barX} y1={l1.y + l1.height / 2}
              x2={barX} y2={nextL1.y + nextL1.height / 2}
              stroke={l1.color} strokeWidth={4} strokeLinecap="square" />
          )
        })}
        {l1Nodes.map(l1 => {
          const stubY = l1.y + l1.height / 2
          const midX = (barX + l1.x) / 2
          return (
            <g key={l1.id}>
              <line x1={barX} y1={stubY} x2={l1.x} y2={stubY}
                stroke={l1.color} strokeWidth={4} strokeLinecap="round" />
              {showOrderNumbers && (
                <>
                  <circle cx={midX} cy={stubY} r={13} fill={l1.color} />
                  <text x={midX} y={stubY + 5}
                    textAnchor="middle" fontSize={13} fontWeight="700"
                    fontFamily="Inter, system-ui, sans-serif" fill="#fff"
                    style={{ pointerEvents: 'none' }}>
                    {(l1.sortOrder ?? 0) + 1}
                  </text>
                </>
              )}
            </g>
          )
        })}
      </>
    )

    if (lineStyle === 'curved') {
      // Brace: BracketConnector from root down through every level
      const allParents = nodes.filter(n => nodes.some(c => c.parentId === n.id))
      return (
        <g>
          {allParents.map(parent => {
            const children = nodes.filter(n => n.parentId === parent.id)
            return <BracketConnector key={parent.id} parent={parent} children={children} showOrderNumbers={showOrderNumbers} />
          })}
        </g>
      )
    }

    const deeperEdges = nodes.filter(n => n.parentId && n.parentId !== root.id && nodeMap.has(n.parentId))
    return (
      <g>
        {trunk}
        {deeperEdges.map(n => (
          <Edge key={n.id} parent={nodeMap.get(n.parentId!)!} child={n} lineStyle={lineStyle} diagramType={diagramType} />
        ))}
      </g>
    )
  }

  // ── Mindmap (radial) ──────────────────────────────────────────────────────
  if (diagramType === 'mindmap') {
    const edges = nodes.filter(n => n.parentId && nodeMap.has(n.parentId))
    return (
      <g>
        {edges.map(n => {
          const parent = nodeMap.get(n.parentId!)!
          const x1 = parent.x + parent.width / 2
          const y1 = parent.y + parent.height / 2
          const x2 = n.x + n.width / 2
          const y2 = n.y + n.height / 2

          const isL1 = n.depth === 1
          const isL2 = n.depth === 2
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.hypot(dx, dy) || 1
          const ux = dx / len, uy = dy / len

          // Ellipse perimeter intersection: r = 1/sqrt((ux/a)^2 + (uy/b)^2)
          function edgeR(w: number, h: number) {
            const a = w / 2, b = h / 2
            const d = Math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
            return d === 0 ? a : 1 / d
          }
          const parentR = edgeR(parent.width, parent.height)
          const childR = edgeR(n.width, n.height)

          // Edge endpoints touch the node perimeter
          const sx = x1 + ux * parentR
          const sy = y1 + uy * parentR
          const ex = x2 - ux * childR
          const ey = y2 - uy * childR
          const mx = (sx + ex) / 2
          const my = (sy + ey) / 2

          const numDist = parentR + 16
          const ox = x1 + ux * numDist
          const oy = y1 + uy * numDist

          const edgePath = lineStyle === 'straight'
            ? `M ${sx} ${sy} L ${ex} ${ey}`
            : `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`

          return (
            <g key={n.id}>
              <path
                d={edgePath}
                stroke={n.color} strokeWidth={isL1 ? 3 : isL2 ? 2.5 : 2}
                fill="none" strokeLinecap="round"
              />
              {isL1 && showOrderNumbers && (
                <g style={{ pointerEvents: 'none' }}>
                  <circle cx={ox} cy={oy} r={11} fill={n.color} />
                  <text x={ox} y={oy} textAnchor="middle" dominantBaseline="central"
                    fontSize={11} fontWeight="700"
                    fontFamily="Inter, system-ui, sans-serif" fill="#fff"
                  >{(n.sortOrder ?? 0) + 1}</text>
                </g>
              )}
            </g>
          )
        })}
      </g>
    )
  }

  // ── Fishbone ──────────────────────────────────────────────────────────────
  if (diagramType === 'fishbone') {
    const root = nodes.find(n => n.parentId === null)
    if (!root) return null
    const spineY = root.y + root.height / 2
    const l1s = nodes.filter(n => n.depth === 1)

    // Spine extends to the rightmost L1 attachment point
    const spineEndX = l1s.length > 0
      ? Math.max(...l1s.map(n => n.x + n.width / 2 - FISHBONE_SLANT)) + FISHBONE_SLANT * 1.3
      : root.x + root.width + 400

    return (
      <g>
        {/* Spine */}
        <line x1={root.x + root.width} y1={spineY} x2={spineEndX} y2={spineY}
          stroke="#64748b" strokeWidth={3} strokeLinecap="round" />

        {/* L1: colored diagonal from spine attachment to L1 */}
        {l1s.map(l1 => {
          const l1CX = l1.x + l1.width / 2
          const l1CY = l1.y + l1.height / 2
          const attachX = l1CX - FISHBONE_SLANT
          const above = l1CY < spineY
          const l1EdgeY = above ? l1.y + l1.height : l1.y
          return (
            <line key={l1.id}
              x1={attachX} y1={spineY}
              x2={l1CX} y2={l1EdgeY}
              stroke={l1.color} strokeWidth={2.5} strokeLinecap="round" />
          )
        })}

        {/* L2: short horizontal stub from diagonal to node left edge */}
        {nodes.filter(n => n.depth === 2).map(l2 => {
          const l1 = nodeMap.get(l2.parentId!)
          if (!l1) return null
          const l1CX = l1.x + l1.width / 2
          const l1CY = l1.y + l1.height / 2
          const attachX = l1CX - FISHBONE_SLANT
          const above = l1CY < spineY
          // Use the near EDGE of L1 — exactly where the diagonal line terminates
          const l1EdgeY = above ? l1.y + l1.height : l1.y
          const boneEdgeH = Math.abs(l1EdgeY - spineY)
          const l2CY = l2.y + l2.height / 2
          const t = above
            ? (spineY - l2CY) / boneEdgeH
            : (l2CY - spineY) / boneEdgeH
          const diagX = attachX + FISHBONE_SLANT * t
          return (
            <line key={l2.id}
              x1={diagX} y1={l2CY}
              x2={l2.x} y2={l2CY}
              stroke={l2.color} strokeWidth={1.5} strokeLinecap="round" />
          )
        })}

        {/* L3+: horizontal from parent right to child left */}
        {nodes.filter(n => n.depth >= 3).map(n => {
          const parent = nodeMap.get(n.parentId!)
          if (!parent) return null
          return (
            <line key={n.id}
              x1={parent.x + parent.width} y1={parent.y + parent.height / 2}
              x2={n.x} y2={n.y + n.height / 2}
              stroke={n.color} strokeWidth={1.5} strokeLinecap="round" />
          )
        })}
      </g>
    )
  }

  // ── Timeline ──────────────────────────────────────────────────────────────
  if (diagramType === 'timeline') {
    const root = nodes.find(n => n.parentId === null)
    if (!root) return null
    const l1s = nodes.filter(n => n.depth === 1).sort((a, b) => a.x - b.x)
    const spineY = root.y + root.height / 2
    const spineEndX = l1s.length > 0
      ? l1s[l1s.length - 1].x + l1s[l1s.length - 1].width + 24
      : root.x + root.width + 400

    return (
      <g>
        {/* Horizontal spine */}
        <line x1={root.x + root.width} y1={spineY} x2={spineEndX} y2={spineY}
          stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" />

        {/* Per L1: spine tick + vertical branch through all descendants (L2+L3 centered at l1CX) */}
        {l1s.map(l1 => {
          const branchX = l1.x  // vertical branch runs at left edge of L1

          const descendants = nodes.filter(n => {
            let cur = nodeMap.get(n.parentId ?? '')
            while (cur) {
              if (cur.id === l1.id) return true
              cur = nodeMap.get(cur.parentId ?? '')
            }
            return false
          })

          const above = descendants.length > 0 && descendants.some(n => n.y + n.height < spineY)
          const l1SpineEdge = above ? l1.y : l1.y + l1.height

          // Use node centers so branch ends flush with the outermost connector, not beyond it
          const farY = descendants.length > 0
            ? above
              ? Math.min(...descendants.map(n => n.y + n.height / 2))
              : Math.max(...descendants.map(n => n.y + n.height / 2))
            : l1SpineEdge

          return (
            <g key={`branch-${l1.id}`}>
              {/* Vertical branch from L1 edge through all descendants */}
              {descendants.length > 0 && (
                <line x1={branchX} y1={l1SpineEdge} x2={branchX} y2={farY}
                  stroke={l1.color} strokeWidth={1.8} strokeLinecap="round" />
              )}
              {/* Orthogonal horizontal connector from branch line to each node's left-center */}
              {descendants.map(n => {
                const nodeCY = n.y + n.height / 2
                return (
                  <line key={`h-${n.id}`}
                    x1={branchX} y1={nodeCY} x2={n.x} y2={nodeCY}
                    stroke={l1.color} strokeWidth={1.5} strokeLinecap="round" />
                )
              })}
            </g>
          )
        })}
      </g>
    )
  }

// ── Tree / default ────────────────────────────────────────────────────────
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
