export type DiagramType = 'logic-chart' | 'mindmap' | 'fishbone' | 'timeline'
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
  url?: string         // optional hyperlink — clicking the node opens it
}

export interface Diagram {
  id: string
  name: string
  type: DiagramType
  lineStyle: LineStyle
  nodes: MindmapNode[]
  createdAt: string
  updatedAt: string
  sharingEnabled?: boolean
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
