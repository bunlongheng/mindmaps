export type DiagramType = 'mindmap' | 'fishbone' | 'tree-vertical' | 'tree-horizontal' | 'timeline'
export type LineStyle = 'straight' | 'curved' | 'orthogonal'

export interface IdeaNode {
  id: string
  title: string
  color: string        // hex base color (inherited from nearest user-set ancestor)
  parentId: string | null
  depth: number
  x: number
  y: number
  width: number
  height: number
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
}

export interface Diagram {
  id: string
  name: string
  type: DiagramType
  lineStyle: LineStyle
  nodes: IdeaNode[]
  createdAt: string
  updatedAt: string
  sharingEnabled?: boolean
  showOrderNumbers?: boolean
}

export interface DiagramMeta {
  id: string
  name: string
  type: DiagramType
  updatedAt: string
}
