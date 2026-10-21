export type DiagramType = 'logic-chart' | 'mindmap' | 'graph' | 'fishbone' | 'timeline' | 'honeycomb'
export type LineStyle = 'straight' | 'curved' | 'orthogonal'

export interface MindmapNode {
  id: string
  title: string
  color: string        // hex base color (inherited from nearest user-set ancestor)
  colorMode?: 'auto' | 'manual'  // 'manual': color wins for this node and its branch; absent/'auto': wheel-driven
  parentId: string | null
  depth: number
  x: number
  y: number
  width: number
  height: number
  widthMode?: 'auto' | 'manual'  // absent/'auto' = width fits the longest label at this depth;
                                  // 'manual' = width was dragged by hand and keeps its own value
  manuallyPositioned?: boolean
  sortOrder?: number
  fontSize?: number
  bold?: boolean
  italic?: boolean
  textAlign?: 'left' | 'center' | 'right'
  borderColor?: string
  borderWidth?: number
  icon?: string
  emoji?: string
  branchGap?: number
  shape?: 'rect' | 'rounded' | 'pill' | 'circle'   // box shape; absent keeps the diagram's default look
  gloss?: boolean      // root node only: opt-in top-of-box gloss for root, L1 and L2 across the whole map
  combSize?: 'outward' | 'inward'  // root node only, honeycomb web style: cells grow outward (default) or shrink outward
  combStyle?: 'mesh' | 'web'       // root node only, honeycomb: 'mesh' tiles equal cells edge to edge with no lines (default); 'web' rings cells around the root with connectors
  ringSize?: 'inward' | 'outward'  // root node only, graph: 'inward' grows circles toward the root (default, today's look); 'outward' swaps the bands so they grow away from it
  collapsed?: boolean  // its children (and their subtrees) are hidden on the canvas
  url?: string         // optional hyperlink — clicking the node opens it
  note?: MapNote        // root node only: the card at the top left of the canvas
  legend?: LegendItem[] // root node only: the key at the bottom left of the canvas
  showLegend?: boolean  // root node only: false hides the legend card but keeps its rows
}

export interface MapNote { title?: string; body?: string }
// One key row: a dot (emoji, e.g. a status circle) or a colour swatch, then its meaning
export interface LegendItem { label: string; emoji?: string; color?: string }

export interface Diagram {
  id: string
  name: string
  type: DiagramType
  lineStyle: LineStyle
  nodes: MindmapNode[]
  createdAt: string
  updatedAt: string
  sharingEnabled?: boolean
  hasPasscode?: boolean  // the share link opens to a lock screen until the passcode is typed
  passcode?: string      // owner only: the current passcode, for the Lock menu's box
  showOrderNumbers?: boolean
  themeId?: string
  tags?: string[]
}

export interface DiagramMeta {
  id: string
  name: string
  type: DiagramType
  updatedAt: string
  isPublic?: boolean
  tags?: string[]
}
