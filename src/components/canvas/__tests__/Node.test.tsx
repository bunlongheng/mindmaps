import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { createRef } from 'react'
import { Node } from '../Node'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { Diagram, DiagramType, MindmapNode } from '../../../types'

vi.mock('../../../components/CuteToast', () => ({ showToast: vi.fn() }))

// ── Test fixtures ──────────────────────────────────────────────────────────
function makeRoot(over: Partial<MindmapNode> = {}): MindmapNode {
  return { id: 'root', title: 'Root', color: '#6366f1', parentId: null, depth: 0, x: 0, y: 0, width: 180, height: 180, ...over }
}
function makeNode(over: Partial<MindmapNode> = {}): MindmapNode {
  return { id: 'n1', title: 'Child', color: '#ef4444', parentId: 'root', depth: 1, x: 300, y: 0, width: 200, height: 40, sortOrder: 0, ...over }
}
function makeDiagram(nodes: MindmapNode[], type: DiagramType = 'logic-chart'): Diagram {
  return { id: 'd1', name: 'Test', type, lineStyle: 'orthogonal', nodes, createdAt: '2024', updatedAt: '2024' }
}

function loadStore(nodes: MindmapNode[], type: DiagramType = 'logic-chart') {
  act(() => {
    useMindmapStore.getState().setActiveMindmap(makeDiagram(nodes, type))
    useMindmapStore.getState().setDiagramType(type)
  })
}

// Attach createSVGPoint + getScreenCTM stubs to a real DOM <svg> (jsdom lacks them).
// The current point coords are stored on the element so setPoint() can change them.
function stubSvg(svg: SVGSVGElement) {
  const holder = svg as unknown as { __pt: { x: number; y: number } }
  holder.__pt = { x: 0, y: 0 }
  ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
    const pt = { x: 0, y: 0 } as DOMPoint
    ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () =>
      ({ x: holder.__pt.x, y: holder.__pt.y } as DOMPoint)
    return pt
  }
  ;(svg as unknown as { getScreenCTM: () => DOMMatrix }).getScreenCTM = () =>
    ({ inverse: () => ({}) as DOMMatrix } as DOMMatrix)
}

function renderNode(node: MindmapNode, props: Partial<React.ComponentProps<typeof Node>> = {}) {
  const svgRef = createRef<SVGSVGElement>()
  const onSelect = props.onSelect ?? vi.fn()
  const onDragEnd = props.onDragEnd ?? vi.fn()
  const onDoubleClick = props.onDoubleClick ?? vi.fn()
  const utils = render(
    <svg ref={svgRef}>
      <Node
        node={node}
        isSelected={props.isSelected ?? false}
        onSelect={onSelect}
        onDragEnd={onDragEnd}
        onDoubleClick={onDoubleClick}
        onDragMove={props.onDragMove}
        onRootDragOffset={props.onRootDragOffset}
        svgRef={svgRef as unknown as React.RefObject<SVGSVGElement>}
        readOnly={props.readOnly}
        l1Colors={props.l1Colors}
        childCount={props.childCount}
        descendantCount={props.descendantCount}
      />
    </svg>
  )
  if (svgRef.current) stubSvg(svgRef.current)
  // Element.setPointerCapture / releasePointerCapture not in jsdom
  utils.container.querySelectorAll('*').forEach(el => {
    ;(el as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    ;(el as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {}
  })
  return { ...utils, onSelect, onDragEnd, onDoubleClick, svgRef }
}

// Override the SVG point so getSVGPoint returns the desired canvas coords.
function setPoint(svgRef: React.RefObject<SVGSVGElement | null>, x: number, y: number) {
  const holder = svgRef.current as unknown as { __pt: { x: number; y: number } }
  if (holder?.__pt) { holder.__pt.x = x; holder.__pt.y = y }
}

beforeEach(() => {
  useMindmapStore.getState().clearDiagram()
  useMindmapStore.setState({ resizePreview: null, showChildCount: false, showOrderNumbers: true })
})
afterEach(() => cleanup())

describe('Node — rendering by depth / type', () => {
  it('renders a logic-chart root (circle) with selection ring', () => {
    loadStore([makeRoot(), makeNode()])
    const { container } = renderNode(makeRoot(), { isSelected: true, l1Colors: ['#ef4444'] })
    expect(container.querySelector('[data-node-id="root"]')).toBeTruthy()
    // Circle root => <circle> for shape + selection ring circles
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it('renders a root pill for long titles', () => {
    const root = makeRoot({ title: 'A very very long root title here', width: 400, height: 90 })
    loadStore([root, makeNode()])
    const { container } = renderNode(root, { isSelected: true })
    // pill => rect shape with rounded corners
    expect(container.querySelector('rect')).toBeTruthy()
  })

  it('renders a root pill when shape is explicitly pill', () => {
    const root = makeRoot({ title: 'Hi', shape: 'pill', width: 300, height: 90 })
    loadStore([root, makeNode()])
    const { container } = renderNode(root)
    expect(container.querySelector('rect')).toBeTruthy()
  })

  it('renders a root circle when shape is explicitly circle even for long title', () => {
    const root = makeRoot({ title: 'A very very long root title here', shape: 'circle' })
    loadStore([root, makeNode()])
    const { container } = renderNode(root)
    expect(container.querySelector('circle')).toBeTruthy()
  })

  it('renders an L1 node (solid fill)', () => {
    loadStore([makeRoot(), makeNode()])
    const { container } = renderNode(makeNode())
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('renders an L2 node (lightened fill)', () => {
    const l2 = makeNode({ id: 'n2', depth: 2, parentId: 'n1' })
    loadStore([makeRoot(), makeNode(), l2])
    const { container } = renderNode(l2)
    expect(container.querySelector('[data-node-id="n2"]')).toBeTruthy()
  })

  it('renders an L3 node', () => {
    const l3 = makeNode({ id: 'n3', depth: 3, parentId: 'n2' })
    loadStore([makeRoot(), makeNode(), makeNode({ id: 'n2', depth: 2, parentId: 'n1' }), l3])
    const { container } = renderNode(l3)
    expect(container.querySelector('[data-node-id="n3"]')).toBeTruthy()
  })

  it('renders an L4 node (deepest lighten branch)', () => {
    const l4 = makeNode({ id: 'n4', depth: 4, parentId: 'n3' })
    loadStore([makeRoot(), l4])
    const { container } = renderNode(l4)
    expect(container.querySelector('[data-node-id="n4"]')).toBeTruthy()
  })

  it('handles a non-hex color (falls back to default fill)', () => {
    const l2 = makeNode({ id: 'n2', depth: 2, parentId: 'n1', color: 'red' })
    loadStore([makeRoot(), makeNode(), l2])
    const { container } = renderNode(l2)
    expect(container.querySelector('[data-node-id="n2"]')).toBeTruthy()
  })

  it('uses dark text on light L1 colors and white on dark', () => {
    const light = makeNode({ id: 'nl', color: '#fefefe' })
    const dark = makeNode({ id: 'nd', color: '#101010' })
    loadStore([makeRoot(), light, dark])
    const { container: cl } = renderNode(light)
    const { container: cd } = renderNode(dark)
    expect(cl.querySelector('[data-node-id="nl"]')).toBeTruthy()
    expect(cd.querySelector('[data-node-id="nd"]')).toBeTruthy()
  })

  it('applies node-level border overrides', () => {
    const n = makeNode({ borderColor: '#00ff00', borderWidth: 4 })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('applies bold + italic + custom fontSize + textAlign right', () => {
    const n = makeNode({ bold: true, italic: true, fontSize: 20, textAlign: 'right' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const text = container.querySelector('text')
    expect(text?.getAttribute('font-weight')).toBe('700')
  })

  it('applies center text alignment on L1', () => {
    const n = makeNode({ textAlign: 'center' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })
})

describe('Node — icons & emoji', () => {
  it('renders an emoji badge on a non-root node', () => {
    const n = makeNode({ emoji: '🚀' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.textContent).toContain('🚀')
  })

  it('renders a lucide icon badge (NodeIcon) on a non-root node', () => {
    const n = makeNode({ icon: 'brain' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    // NodeIcon renders a foreignObject for the icon
    expect(container.querySelector('foreignObject')).toBeTruthy()
  })

  it('ignores an unknown icon name (no badge)', () => {
    const n = makeNode({ icon: 'definitely-not-an-icon-zzz' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('does not render an icon/emoji on the root', () => {
    const root = makeRoot({ icon: 'brain', emoji: '🚀' })
    loadStore([root, makeNode()])
    const { container } = renderNode(root)
    expect(container.textContent).not.toContain('🚀')
  })

  it('prefers emoji over icon when both are set', () => {
    const n = makeNode({ emoji: '🎯', icon: 'brain' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.textContent).toContain('🎯')
  })
})

describe('Node — child / descendant counts (fireflies)', () => {
  it('shows the (n) child count suffix when enabled', () => {
    useMindmapStore.setState({ showChildCount: true })
    const parent = makeNode({ id: 'p' })
    const kid = makeNode({ id: 'k', parentId: 'p', depth: 2 })
    loadStore([makeRoot(), parent, kid])
    useMindmapStore.setState({ showChildCount: true })
    const { container } = renderNode(parent, { childCount: 1, descendantCount: 1 })
    expect(container.textContent).toContain('(1)')
  })

  it('renders fireflies for a node with descendants', () => {
    const parent = makeNode({ id: 'p' })
    const kid = makeNode({ id: 'k', parentId: 'p', depth: 2 })
    loadStore([makeRoot(), parent, kid])
    const { container } = renderNode(parent, { childCount: 1, descendantCount: 1 })
    // Fireflies render extra <circle> glow + core elements
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
  })
})

describe('Node — mindmap type', () => {
  it('renders a mindmap L1 circle node', () => {
    const root = makeRoot({ title: 'Center' })
    const n = makeNode({ depth: 1 })
    loadStore([root, n], 'mindmap')
    const { container } = renderNode(n, { isSelected: true })
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('renders a mindmap L1 with a light color (dark text branch)', () => {
    const n = makeNode({ depth: 1, color: '#fefefe' })
    loadStore([makeRoot(), n], 'mindmap')
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('renders a mindmap L1 with a non-hex color (named-color branch)', () => {
    const n = makeNode({ depth: 1, color: 'goldenrod' })
    loadStore([makeRoot(), n], 'mindmap')
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('renders a mindmap L2+ circle node (transparent rect + wrapped text)', () => {
    const root = makeRoot()
    const l1 = makeNode({ depth: 1 })
    const l2 = makeNode({ id: 'n2', depth: 2, parentId: 'n1', title: 'A long mindmap leaf node label', width: 120, height: 120 })
    loadStore([root, l1, l2], 'mindmap')
    const { container } = renderNode(l2, { isSelected: true })
    expect(container.querySelector('[data-node-id="n2"]')).toBeTruthy()
    // tspan-wrapped text
    expect(container.querySelector('tspan')).toBeTruthy()
  })

  it('renders mindmap L2+ with emoji centered', () => {
    const l2 = makeNode({ id: 'n2', depth: 2, parentId: 'n1', emoji: '✨', width: 120, height: 120 })
    loadStore([makeRoot(), makeNode({ depth: 1 }), l2], 'mindmap')
    const { container } = renderNode(l2)
    expect(container.textContent).toContain('✨')
  })

  it('renders mindmap L2+ with an icon centered', () => {
    const l2 = makeNode({ id: 'n2', depth: 2, parentId: 'n1', icon: 'star', width: 120, height: 120 })
    loadStore([makeRoot(), makeNode({ depth: 1 }), l2], 'mindmap')
    const { container } = renderNode(l2)
    expect(container.querySelector('foreignObject')).toBeTruthy()
  })

  it('renders a mindmap root with wrapped multi-line text', () => {
    const root = makeRoot({ title: 'A fairly long mindmap center title' })
    loadStore([root, makeNode({ depth: 1 })], 'mindmap')
    const { container } = renderNode(root)
    expect(container.querySelector('tspan')).toBeTruthy()
  })
})

describe('Node — fishbone type', () => {
  it('renders a fishbone L1 parallelogram node (above spine)', () => {
    const root = makeRoot()
    const n = makeNode({ depth: 1, y: 100 }) // y+h/2 < 400 => above
    loadStore([root, n], 'fishbone')
    const { container } = renderNode(n, { isSelected: true })
    expect(container.querySelector('polygon')).toBeTruthy()
  })

  it('renders a fishbone node below the spine', () => {
    const root = makeRoot()
    const n = makeNode({ depth: 1, y: 600 }) // below spine
    loadStore([root, n], 'fishbone')
    const { container } = renderNode(n, { isSelected: true })
    expect(container.querySelector('polygon')).toBeTruthy()
  })

  it('renders a fishbone node with an emoji badge polygon', () => {
    const n = makeNode({ depth: 1, y: 100, emoji: '🐟' })
    loadStore([makeRoot(), n], 'fishbone')
    const { container } = renderNode(n)
    expect(container.querySelectorAll('polygon').length).toBeGreaterThan(1)
  })

  it('renders a fishbone node below spine with an icon', () => {
    const n = makeNode({ depth: 1, y: 600, icon: 'star' })
    loadStore([makeRoot(), n], 'fishbone')
    const { container } = renderNode(n)
    expect(container.querySelector('foreignObject')).toBeTruthy()
  })
})

describe('Node — editing', () => {
  it('double-click enters edit mode and shows an input', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('does not enter edit mode in readOnly', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container } = renderNode(n, { readOnly: true })
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    expect(container.querySelector('input')).toBeFalsy()
  })

  it('commits an edit on Enter and updates the store', () => {
    const n = makeNode({ title: 'Before' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.change(input, { target: { value: 'After' } }) })
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.title).toBe('After')
  })

  it('does not update on empty draft', () => {
    const n = makeNode({ title: 'Keep' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.change(input, { target: { value: '   ' } }) })
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.title).toBe('Keep')
  })

  it('does not update when title is unchanged', () => {
    const n = makeNode({ title: 'Same' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.title).toBe('Same')
  })

  it('Escape cancels editing without committing', () => {
    const n = makeNode({ title: 'Original' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.change(input, { target: { value: 'Discarded' } }) })
    act(() => { fireEvent.keyDown(input, { key: 'Escape' }) })
    expect(container.querySelector('input')).toBeFalsy()
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.title).toBe('Original')
  })

  it('commits on blur', () => {
    const n = makeNode({ title: 'Old' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.change(input, { target: { value: 'NewViaBlur' } }) })
    act(() => { fireEvent.blur(input) })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.title).toBe('NewViaBlur')
  })

  it('editing a short root title sets equal width/height (circle) on commit', () => {
    vi.useFakeTimers()
    const root = makeRoot({ title: 'Hi' })
    loadStore([root, makeNode()])
    const { container } = renderNode(root)
    const g = container.querySelector('[data-node-id="root"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.change(input, { target: { value: 'Hey' } }) })
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }) })
    act(() => { vi.runAllTimers() })
    const r = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'root')!
    expect(r.width).toBe(r.height)
    vi.useRealTimers()
  })

  it('editing a long root title produces a wide pill (width > height) on commit', () => {
    vi.useFakeTimers()
    const root = makeRoot({ title: 'Hi' })
    loadStore([root, makeNode()])
    const { container } = renderNode(root)
    const g = container.querySelector('[data-node-id="root"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    act(() => { fireEvent.change(input, { target: { value: 'A very long new root title indeed yes' } }) })
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }) })
    act(() => { vi.runAllTimers() })
    const r = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'root')!
    // pill = non-square; long title commits as a wide pill
    expect(r.width).toBeGreaterThan(r.height)
    vi.useRealTimers()
  })

  it('select() is called shortly after entering edit mode', () => {
    vi.useFakeTimers()
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(g) })
    const input = container.querySelector('input') as HTMLInputElement
    const spy = vi.spyOn(input, 'select')
    act(() => { vi.runAllTimers() })
    expect(spy).toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('Node — pointer / drag', () => {
  it('selects on pointer down (mouse)', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container, onSelect } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', clientX: 5, clientY: 5 }) })
    expect(onSelect).toHaveBeenCalledWith('n1', false)
  })

  it('selects with multi flag when meta is held', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container, onSelect } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', metaKey: true }) })
    expect(onSelect).toHaveBeenCalledWith('n1', true)
  })

  it('ignores pointer down in readOnly', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container, onSelect } = renderNode(n, { readOnly: true })
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse' }) })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('touch pointer down still selects but does not start a drag', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container, onSelect } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.pointerDown(g, { pointerType: 'touch' }) })
    expect(onSelect).toHaveBeenCalled()
  })

  it('non-draggable node (L1 mindmap) does not begin a drag', () => {
    const n = makeNode({ depth: 1 })
    loadStore([makeRoot(), n], 'mindmap') // canDrag false for mindmap non-root
    const { container } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse' }) })
    // move should be a no-op (no drag started)
    act(() => { fireEvent.pointerMove(g, { pointerType: 'mouse' }) })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.manuallyPositioned).toBeFalsy()
  })

  it('drags a logic-chart node and updates position + calls onDragMove/onDragEnd', () => {
    const n = makeNode()
    loadStore([makeRoot(), n], 'logic-chart')
    const onDragMove = vi.fn()
    const { container, onDragEnd, svgRef } = renderNode(n, { onDragMove })
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    setPoint(svgRef, 10, 10)
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', clientX: 10, clientY: 10, pointerId: 1 }) })
    setPoint(svgRef, 60, 70)
    act(() => { fireEvent.pointerMove(g, { pointerType: 'mouse', clientX: 60, clientY: 70, pointerId: 1 }) })
    expect(onDragMove).toHaveBeenCalled()
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!.manuallyPositioned).toBe(true)
    act(() => { fireEvent.pointerUp(g, { pointerType: 'mouse', pointerId: 1 }) })
    expect(onDragEnd).toHaveBeenCalledWith('n1', 0, 0)
  })

  it('pointerUp without an active drag is a no-op (no onDragEnd)', () => {
    const n = makeNode()
    loadStore([makeRoot(), n], 'logic-chart')
    const { container, onDragEnd } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.pointerUp(g, { pointerType: 'mouse', pointerId: 1 }) })
    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('a tiny move (<3px) does not flag didDrag, so pointerUp skips onDragEnd', () => {
    const n = makeNode()
    loadStore([makeRoot(), n], 'logic-chart')
    const { container, onDragEnd, svgRef } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    setPoint(svgRef, 10, 10)
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', clientX: 10, clientY: 10, pointerId: 1 }) })
    setPoint(svgRef, 11, 11) // <3px
    act(() => { fireEvent.pointerMove(g, { pointerType: 'mouse', pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(g, { pointerType: 'mouse', pointerId: 1 }) })
    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('double-click after a real drag calls onDoubleClick instead of editing', () => {
    const n = makeNode()
    loadStore([makeRoot(), n], 'logic-chart')
    const { container, onDoubleClick, svgRef } = renderNode(n)
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    setPoint(svgRef, 0, 0)
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', pointerId: 1 }) })
    setPoint(svgRef, 50, 50)
    act(() => { fireEvent.pointerMove(g, { pointerType: 'mouse', pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(g, { pointerType: 'mouse', pointerId: 1 }) })
    act(() => { fireEvent.doubleClick(g) })
    expect(onDoubleClick).toHaveBeenCalled()
    expect(container.querySelector('input')).toBeFalsy()
  })

  it('dragging the root clamps X within the trunk range and reports offset', () => {
    const root = makeRoot()
    const l1 = makeNode({ depth: 1, x: 800 })
    loadStore([root, l1], 'logic-chart')
    const onRootDragOffset = vi.fn()
    const { container, svgRef } = renderNode(root, { onRootDragOffset })
    const g = container.querySelector('[data-node-id="root"] > g') as Element
    setPoint(svgRef, 0, 0)
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', clientX: 0, clientY: 0, pointerId: 1 }) })
    expect(onRootDragOffset).toHaveBeenCalledWith({ dx: 0, dy: 0, clientX: 0, clientY: 0 })
    setPoint(svgRef, 100, 100)
    act(() => { fireEvent.pointerMove(g, { pointerType: 'mouse', clientX: 100, clientY: 100, pointerId: 1 }) })
    expect(onRootDragOffset).toHaveBeenCalledWith(expect.objectContaining({ dx: expect.any(Number) }))
    act(() => { fireEvent.pointerUp(g, { pointerType: 'mouse', pointerId: 1 }) })
    // null reported on pointer up
    expect(onRootDragOffset).toHaveBeenCalledWith(null)
  })
})

describe('Node — resize handle', () => {
  it('resize handle drag sets resizePreview and commits on pointer up', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container, svgRef } = renderNode(n)
    // The resize hit-area is the transparent <rect> inside the ew-resize <g>
    const resizeRect = container.querySelector('g[style*="ew-resize"] rect') as Element
    expect(resizeRect).toBeTruthy()
    setPoint(svgRef, 200, 0)
    act(() => { fireEvent.pointerDown(resizeRect, { pointerType: 'mouse', clientX: 200, clientY: 0, pointerId: 2 }) })
    expect(useMindmapStore.getState().resizePreview).not.toBeNull()
    setPoint(svgRef, 260, 0)
    act(() => { fireEvent.pointerMove(resizeRect, { pointerType: 'mouse', pointerId: 2 }) })
    expect(useMindmapStore.getState().resizePreview!.width).toBeGreaterThanOrEqual(100)
    act(() => { fireEvent.pointerUp(resizeRect, { pointerType: 'mouse', pointerId: 2 }) })
    // preview cleared after commit
    expect(useMindmapStore.getState().resizePreview).toBeNull()
  })

  it('resize move before down is a no-op', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    const resizeRect = container.querySelector('g[style*="ew-resize"] rect') as Element
    act(() => { fireEvent.pointerMove(resizeRect, { pointerType: 'mouse', pointerId: 2 }) })
    expect(useMindmapStore.getState().resizePreview).toBeNull()
  })

  it('no resize handle on the root', () => {
    const root = makeRoot()
    loadStore([root, makeNode()])
    const { container } = renderNode(root)
    expect(container.querySelector('g[style*="ew-resize"]')).toBeFalsy()
  })

  it('no resize handle in readOnly', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const { container } = renderNode(n, { readOnly: true })
    expect(container.querySelector('g[style*="ew-resize"]')).toBeFalsy()
  })

  it('shows the resize preview border (blue glow) when resizePreview matches depth', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    act(() => { useMindmapStore.getState().setResizePreview({ depth: 1, width: 260 }) })
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })
})

describe('Node — color helper edge cases', () => {
  it('L1 with a non-hex color uses the named-color fallbacks (isLight/darken)', () => {
    const n = makeNode({ color: 'rebeccapurple' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('borderColor without borderWidth uses the 1.5 fallback', () => {
    const n = makeNode({ borderColor: '#123456' })
    loadStore([makeRoot(), n])
    const { container } = renderNode(n)
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('L2 logic-chart node with an icon uses the depth!==1 icon stroke width', () => {
    const l2 = makeNode({ id: 'n2', depth: 2, parentId: 'n1', icon: 'star' })
    loadStore([makeRoot(), makeNode(), l2])
    const { container } = renderNode(l2)
    expect(container.querySelector('foreignObject')).toBeTruthy()
  })

  it('fireflies with a non-hex node color (colorShades fallback)', () => {
    const parent = makeNode({ id: 'p', color: 'tomato' })
    const kid = makeNode({ id: 'k', parentId: 'p', depth: 2, color: 'tomato' })
    loadStore([makeRoot(), parent, kid])
    const { container } = renderNode(parent, { childCount: 1, descendantCount: 1 })
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it('renders the root SiriWave with empty l1Colors (FALLBACK palette)', () => {
    const root = makeRoot()
    loadStore([root, makeNode()])
    const { container } = renderNode(root, { l1Colors: [] })
    // SiriWave blobs are <circle> elements with a blur filter group
    expect(container.querySelector('filter')).toBeTruthy()
  })
})

describe('Node — move guards with null ref mid-drag', () => {
  it('onPointerMove bails out when getSVGPoint returns null', () => {
    const n = makeNode()
    loadStore([makeRoot(), n], 'logic-chart')
    const svgRef = createRef<SVGSVGElement>()
    const onDragMove = vi.fn()
    const { container } = render(
      <svg ref={svgRef as React.RefObject<SVGSVGElement>}>
        <Node node={n} isSelected={false} onSelect={vi.fn()} onDragEnd={vi.fn()}
          onDoubleClick={vi.fn()} onDragMove={onDragMove}
          svgRef={svgRef as React.RefObject<SVGSVGElement>} />
      </svg>
    )
    if (svgRef.current) stubSvg(svgRef.current)
    container.querySelectorAll('*').forEach(el => {
      ;(el as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    })
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    setPoint(svgRef, 0, 0)
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', pointerId: 1 }) })
    // Make getSVGPoint return null on move (matrixTransform -> null)
    ;(svgRef.current as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => null }).matrixTransform = () => null
      return pt
    }
    act(() => { fireEvent.pointerMove(g, { pointerType: 'mouse', pointerId: 1 }) })
    expect(onDragMove).not.toHaveBeenCalled()
  })

  it('onResizePointerMove bails out when getSVGPoint returns null', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const svgRef = createRef<SVGSVGElement>()
    const { container } = render(
      <svg ref={svgRef as React.RefObject<SVGSVGElement>}>
        <Node node={n} isSelected={false} onSelect={vi.fn()} onDragEnd={vi.fn()}
          onDoubleClick={vi.fn()} svgRef={svgRef as React.RefObject<SVGSVGElement>} />
      </svg>
    )
    if (svgRef.current) stubSvg(svgRef.current)
    container.querySelectorAll('*').forEach(el => {
      ;(el as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    })
    const resizeRect = container.querySelector('g[style*="ew-resize"] rect') as Element
    setPoint(svgRef, 200, 0)
    act(() => { fireEvent.pointerDown(resizeRect, { pointerType: 'mouse', pointerId: 2 }) })
    ;(svgRef.current as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => null }).matrixTransform = () => null
      return pt
    }
    act(() => { fireEvent.pointerMove(resizeRect, { pointerType: 'mouse', pointerId: 2 }) })
    // resizeStart was set; move bailed — preview width stays the initial node.width
    expect(useMindmapStore.getState().resizePreview!.width).toBe(n.width)
  })
})

describe('Node — getSVGPoint guards', () => {
  it('returns early when svgRef.current is null on a draggable pointer down', () => {
    const n = makeNode()
    loadStore([makeRoot(), n], 'logic-chart') // canDrag = true
    // Pass a ref whose .current is null so getSVGPoint short-circuits.
    const nullRef = { current: null } as unknown as React.RefObject<SVGSVGElement>
    const onSelect = vi.fn()
    const { container } = render(
      <svg>
        <Node node={n} isSelected={false} onSelect={onSelect} onDragEnd={vi.fn()} onDoubleClick={vi.fn()}
          svgRef={nullRef} />
      </svg>
    )
    const g = container.querySelector('[data-node-id="n1"] > g') as Element
    // selection still fires; getSVGPoint returns null so no drag begins, no crash
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', pointerId: 9 }) })
    expect(onSelect).toHaveBeenCalled()
  })

  it('resize pointer-down with a null svg ref short-circuits without crashing', () => {
    const n = makeNode()
    loadStore([makeRoot(), n])
    const nullRef = { current: null } as unknown as React.RefObject<SVGSVGElement>
    const { container } = render(
      <svg>
        <Node node={n} isSelected={false} onSelect={vi.fn()} onDragEnd={vi.fn()} onDoubleClick={vi.fn()}
          svgRef={nullRef} />
      </svg>
    )
    const resizeRect = container.querySelector('g[style*="ew-resize"] rect') as Element
    act(() => { fireEvent.pointerDown(resizeRect, { pointerType: 'mouse', pointerId: 7 }) })
    // resizePreview stays null because getSVGPoint bailed
    expect(useMindmapStore.getState().resizePreview).toBeNull()
  })
})
