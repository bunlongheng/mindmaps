export type FlatOutlineItem = { title: string; indent: number }

// Node shape produced by the outline -> nodes pipelines (API import + AI generate).
// Structurally compatible with the app's MindmapNode (src/types) - sortOrder and
// manuallyPositioned are required here because these pipelines always set them.
export interface OutlineNode {
  id: string
  title: string
  parentId: string | null
  depth: number
  x: number
  y: number
  width: number
  height: number
  color: string
  sortOrder: number
  manuallyPositioned: boolean
  icon?: string
  emoji?: string
}

// Keys that are metadata on a JSON outline node, never the node's title.
// Shared by the store paste-import and the API import endpoint.
export const OUTLINE_META_KEYS = new Set([
  'icon', 'emoji', 'bold', 'italic', 'fontSize', 'textAlign',
  'title', 'name', 'children', 'type', 'lineStyle', 'color',
])

// Auto-detects the indent unit instead of assuming a fixed width, so 2-space, 4-space,
// or tab-indented text all parse to the same tree. Previously the API import endpoint
// treated 2 spaces as one level, the client paste-import treated 4 spaces as one level,
// and the paste-import gate rejected 2-space outlines outright - the same outline text
// produced a different tree (or was refused) depending on which entry point received it.
export function parseIndentedOutline(text: string): FlatOutlineItem[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return []

  const raw = lines
    .map(line => {
      const m = line.match(/^(\s*)(.+)$/)
      return m ? { ws: m[1], title: m[2].trim() } : null
    })
    .filter((x): x is { ws: string; title: string } => x !== null)

  // The indent unit is the smallest nonzero run of leading spaces across lines that
  // don't use tabs (tabs are always counted one-per-level, matching prior behavior).
  const spaceWidths = raw.filter(r => !r.ws.includes('\t') && r.ws.length > 0).map(r => r.ws.length)
  const unit = spaceWidths.length ? Math.min(...spaceWidths) : 4

  return raw.map(r => ({
    title: r.title,
    indent: r.ws.includes('\t') ? (r.ws.match(/\t/g)?.length ?? 0) : Math.floor(r.ws.length / unit),
  }))
}

// Shift indents so the minimum is 0, then, if several items sit at indent 0, nest
// everything one level down under a single synthetic root titled after the first item.
// Mutates and returns the same array (both callers previously did this in place).
export function normalizeOutlineRoots<T extends FlatOutlineItem>(items: T[]): T[] {
  if (!items.length) return items
  const minIndent = Math.min(...items.map(p => p.indent))
  if (minIndent > 0) items.forEach(p => { p.indent -= minIndent })
  const rootCount = items.filter(p => p.indent === 0).length
  if (rootCount > 1) {
    const rootTitle = items[0].title
    items.forEach(p => { p.indent += 1 })
    items.unshift({ title: rootTitle, indent: 0 } as T)
  }
  return items
}

export interface OutlineAssembly {
  /** Index into the items array of each item's parent, or null for the root. */
  parentIndex: (number | null)[]
  depths: number[]
  /** Per-item order among its siblings: 0,1,2,... */
  sortOrders: number[]
  /** Total child count per parent index (null key = top level). */
  siblingTotals: Map<number | null, number>
}

// Turn a normalized flat indent list into parent/depth/sibling-order arrays using a
// parent stack. Pure index math - callers attach their own ids, colors, and widths.
export function assembleOutlineTree(items: FlatOutlineItem[]): OutlineAssembly {
  const parentIndex: (number | null)[] = []
  const depths: number[] = []
  const sortOrders: number[] = []
  const siblingTotals = new Map<number | null, number>()
  const stack: number[] = []

  for (let i = 0; i < items.length; i++) {
    const { indent } = items[i]
    while (stack.length > 0 && items[stack[stack.length - 1]].indent >= indent) {
      stack.pop()
    }
    const parent = stack.length > 0 ? stack[stack.length - 1] : null
    const order = siblingTotals.get(parent) ?? 0
    siblingTotals.set(parent, order + 1)
    parentIndex.push(parent)
    depths.push(indent)
    sortOrders.push(order)
    stack.push(i)
  }

  return { parentIndex, depths, sortOrders, siblingTotals }
}

// --- Node-width formulas -----------------------------------------------------------
// These 3 intentionally differ: each entry point shipped with its own formula and the
// stored widths feed the saved layout, so unifying them would visibly resize existing
// map styles. Single source of truth for the formulas lives here; do not merge them
// without re-deriving what every layout expects.

/** Editor-canonical width - font sizes must match Node.tsx. Used by the store. */
export function computeNodeWidth(title: string, depth: number, hasIcon: boolean): number {
  const fontSize = depth === 1 ? 22 : depth === 2 ? 16 : depth === 3 ? 13 : 11
  const charW = fontSize * 0.64
  const textPad = 24
  const textW = Math.ceil(title.length * charW) + textPad
  // icon zone takes ~20% of node width, so text zone = 80% of total
  const total = hasIcon ? Math.ceil(textW / 0.8) : textW
  return Math.max(140, Math.min(400, total))
}

/** API import endpoint variant (api/ai/mindmaps): flat 7.5px/char, cap 260. */
export function computeImportNodeWidth(title: string, depth: number): number {
  if (depth === 0) return 180
  const base = Math.max(100, title.length * 7.5 + 32)
  return Math.min(base, 260)
}

/** AI generate endpoint variant (api/ai/generate-mindmap): per-depth char width, cap 300. */
export function computeGeneratedNodeWidth(title: string, depth: number): number {
  if (depth === 0) return 180
  const charW = depth === 1 ? 10.24 : depth === 2 ? 8.19 : 7.04
  return Math.max(120, Math.min(300, Math.ceil(title.length * charW) + 32))
}

// --- JSON-tree flatten (API endpoints) ---------------------------------------------

export interface JsonOutlineOptions {
  /** Keys treated as metadata, never as a node title. */
  metaKeys: Set<string>
  computeWidth: (title: string, depth: number) => number
  /** Color of the depth-0 root node. */
  rootColor: string
  /** Color for the i-th depth-1 branch; total = number of branches (after the cap). */
  branchColor: (branchIdx: number, branchTotal: number) => string
  /** Honor a node's own "color" value as an override (import endpoint only). */
  useExplicitColor?: boolean
  /** Pass a node's "emoji" value through to the output (import endpoint only). */
  useEmoji?: boolean
}

// Flatten a { "Root": [ { icon, "Branch": ["leaf", ...] }, ... ] } tree into positioned
// OutlineNodes (x/y left at 0 for the client layout pass). Caps: 12 branches, 10
// children per node. Colors flow parent -> child; depth-1 branches get branchColor.
export function flattenJsonOutline(
  json: unknown,
  opts: JsonOutlineOptions,
): { title: string; nodes: OutlineNode[] } | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const entries = Object.entries(json as Record<string, unknown>)
  if (!entries.length) return null

  const [rootKey, rootChildren] = entries[0]
  const nodes: OutlineNode[] = []
  let branchIdx = 0
  const colorById = new Map<string, string>()
  const rootId = crypto.randomUUID()
  colorById.set(rootId, opts.rootColor)

  nodes.push({
    id: rootId, title: rootKey.trim(), parentId: null, depth: 0,
    x: 0, y: 0, width: 180, height: 180,
    color: opts.rootColor, sortOrder: 0, manuallyPositioned: false,
  })

  const branchTotal = Array.isArray(rootChildren) ? Math.min(rootChildren.length, 12) : 0

  function flattenNode(obj: Record<string, unknown> | string, parentId: string, depth: number, sortOrder: number) {
    const parentColor = colorById.get(parentId) ?? opts.rootColor

    if (typeof obj === 'string') {
      const id = crypto.randomUUID()
      colorById.set(id, parentColor)
      nodes.push({
        id, title: obj.trim(), parentId, depth,
        x: 0, y: 0, width: opts.computeWidth(obj.trim(), depth), height: 40,
        color: parentColor, sortOrder, manuallyPositioned: false,
      })
      return
    }

    const titleKey = Object.keys(obj).find(k => !opts.metaKeys.has(k))
    if (!titleKey) return

    const id = crypto.randomUUID()
    const autoColor = depth === 1 ? opts.branchColor(branchIdx++, branchTotal) : parentColor
    const color = (opts.useExplicitColor && typeof obj.color === 'string' && obj.color.trim())
      ? obj.color.trim()
      : autoColor
    colorById.set(id, color)

    nodes.push({
      id, title: titleKey.trim(), parentId, depth,
      x: 0, y: 0, width: opts.computeWidth(titleKey.trim(), depth), height: 40,
      color, sortOrder, manuallyPositioned: false,
      icon: obj.icon as string | undefined,
      emoji: opts.useEmoji ? obj.emoji as string | undefined : undefined,
    })

    const kids = obj[titleKey]
    if (Array.isArray(kids)) {
      kids.slice(0, 10).forEach((child, i) => flattenNode(child as Record<string, unknown> | string, id, depth + 1, i))
    }
  }

  if (Array.isArray(rootChildren)) {
    rootChildren.slice(0, 12).forEach((child, i) => flattenNode(child as Record<string, unknown> | string, rootId, 1, i))
  }

  return { title: rootKey.trim(), nodes }
}
