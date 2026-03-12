export type DiagramType = 'mindmap' | 'fishbone' | 'tree-vertical' | 'tree-horizontal'
export type LineStyle = 'straight' | 'curved' | 'orthogonal'

export interface MindNode {
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
}

export interface Diagram {
  id: string
  name: string
  type: DiagramType
  lineStyle: LineStyle
  nodes: MindNode[]
  createdAt: string
  updatedAt: string
}

export interface DiagramMeta {
  id: string
  name: string
  type: DiagramType
  updatedAt: string
}
