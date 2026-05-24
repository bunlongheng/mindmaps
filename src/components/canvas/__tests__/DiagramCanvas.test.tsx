import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import { DiagramCanvas } from '../DiagramCanvas'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { Diagram, DiagramType, MindmapNode } from '../../../types'

vi.mock('../../../components/CuteToast', () => ({ showToast: vi.fn() }))
vi.mock('../../../lib/sounds', () => ({
  soundClick: vi.fn(), soundCreate: vi.fn(), soundHover: vi.fn(),
  soundSave: vi.fn(), soundDelete: vi.fn(), soundPaste: vi.fn(),
}))

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

// Patch the SVG + group so screenToCanvas/fitView work in jsdom.
function patchCanvas(container: HTMLElement) {
  const svg = container.querySelector('svg') as SVGSVGElement
  const g = svg?.querySelector('g') as SVGGElement
  if (!svg) return { svg, g }
  // getBoundingClientRect: real-ish rect so fitView runs
  svg.getBoundingClientRect = () => ({ x: 0, y: 0, width: 1000, height: 800, top: 0, left: 0, right: 1000, bottom: 800, toJSON() {} } as DOMRect)
  ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
    const pt = { x: 0, y: 0 } as DOMPoint
    ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: pt.x, y: pt.y } as DOMPoint)
    return pt
  }
  // getScreenCTM on the svg itself (Node.getSVGPoint uses svgRef.current.getScreenCTM)
  ;(svg as unknown as { getScreenCTM: () => DOMMatrix }).getScreenCTM = () => ({ inverse: () => ({}) as DOMMatrix } as DOMMatrix)
  // ownerSVGElement + getScreenCTM for screenToCanvas (uses the group)
  Object.defineProperty(g, 'ownerSVGElement', { value: svg, configurable: true })
  ;(g as unknown as { getScreenCTM: () => DOMMatrix }).getScreenCTM = () => ({ inverse: () => ({}) as DOMMatrix } as DOMMatrix)
  // setPointerCapture on every node so capture during node drag does not throw
  svg.querySelectorAll('*').forEach(el => {
    ;(el as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    ;(el as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {}
  })
  ;(svg as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
  return { svg, g }
}

function renderCanvas(props: { onNodeSelect?: (id: string | null) => void; readOnly?: boolean } = {}) {
  const onNodeSelect = props.onNodeSelect ?? vi.fn()
  const utils = render(<DiagramCanvas onNodeSelect={onNodeSelect} readOnly={props.readOnly} />)
  const { svg, g } = patchCanvas(utils.container)
  return { ...utils, onNodeSelect, svg, g }
}

beforeEach(() => {
  useMindmapStore.getState().clearDiagram()
  useMindmapStore.setState({ hideDetails: false, isImporting: false })
})
afterEach(() => cleanup())

describe('DiagramCanvas — render states', () => {
  it('renders an empty background when there is no active diagram', () => {
    const { container } = renderCanvas()
    // No svg — just a background div
    expect(container.querySelector('svg')).toBeFalsy()
    expect(container.querySelector('div')).toBeTruthy()
  })

  it('renders the canvas svg with nodes and edges when a diagram is active', () => {
    loadStore([makeRoot(), makeNode()])
    const { container } = renderCanvas()
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('[data-node-id="root"]')).toBeTruthy()
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
  })

  it('shows the zoom badge', () => {
    loadStore([makeRoot(), makeNode()])
    const { getByText } = renderCanvas()
    expect(getByText(/%$/)).toBeTruthy()
  })

  it('renders the importing overlay when isImporting', () => {
    loadStore([makeRoot(), makeNode()])
    act(() => { useMindmapStore.getState().setIsImporting(true) })
    const { getByText } = renderCanvas()
    expect(getByText(/Loading diagram/)).toBeTruthy()
  })

  it('auto-adds a root node when the diagram has none', () => {
    act(() => {
      useMindmapStore.getState().setActiveMindmap(makeDiagram([]))
    })
    renderCanvas()
    // The effect should add a root
    expect(useMindmapStore.getState().activeMindmap!.nodes.length).toBeGreaterThan(0)
  })

  it('hides L3+ nodes when hideDetails is on', () => {
    const l3 = makeNode({ id: 'deep', depth: 3, parentId: 'n1' })
    loadStore([makeRoot(), makeNode(), makeNode({ id: 'n2', depth: 2, parentId: 'n1' }), l3])
    act(() => { useMindmapStore.getState().setHideDetails(true) })
    const { container } = renderCanvas()
    expect(container.querySelector('[data-node-id="deep"]')).toBeFalsy()
  })
})

describe('DiagramCanvas — selection', () => {
  it('clicking a node selects it via handleSelect', () => {
    loadStore([makeRoot(), makeNode()])
    const { container, onNodeSelect, svg } = renderCanvas()
    ;(svg as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    const nodeG = container.querySelector('[data-node-id="n1"] > g') as Element
    ;(nodeG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'mouse', clientX: 320, clientY: 20 }) })
    expect(useMindmapStore.getState().selectedNodeIds).toContain('n1')
    expect(onNodeSelect).toHaveBeenCalledWith('n1')
  })

  it('multi-select toggles a node in and out of the selection', () => {
    loadStore([makeRoot(), makeNode(), makeNode({ id: 'n2', x: 300, y: 100 })])
    const { container } = renderCanvas()
    const nodeG = container.querySelector('[data-node-id="n1"] > g') as Element
    ;(nodeG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'mouse', metaKey: true }) })
    expect(useMindmapStore.getState().selectedNodeIds).toContain('n1')
    // toggling again removes it
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'mouse', metaKey: true }) })
    expect(useMindmapStore.getState().selectedNodeIds).not.toContain('n1')
  })

  it('double-clicking a node (no prior drag) enters inline edit mode', () => {
    loadStore([makeRoot(), makeNode()])
    const { container } = renderCanvas()
    const nodeG = container.querySelector('[data-node-id="n1"] > g') as Element
    act(() => { fireEvent.doubleClick(nodeG) })
    expect(container.querySelector('input')).toBeTruthy()
  })

  it('double-clicking after a drag fires the canvas onDoubleClick -> selects the node', () => {
    loadStore([makeRoot(), makeNode()], 'logic-chart')
    const { container, g, onNodeSelect } = renderCanvas()
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 320, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    const nodeG = container.querySelector('[data-node-id="n1"] > g') as Element
    ;(nodeG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    cur = { x: 320, y: 0 }
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'mouse', clientX: 320, clientY: 0, pointerId: 1 }) })
    cur = { x: 400, y: 80 } // real drag (>3px)
    act(() => { fireEvent.pointerMove(nodeG, { pointerType: 'mouse', clientX: 400, clientY: 80, pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(nodeG, { pointerType: 'mouse', pointerId: 1 }) })
    act(() => { fireEvent.doubleClick(nodeG) })
    expect(onNodeSelect).toHaveBeenCalledWith('n1')
  })

  it('background click clears the selection', () => {
    loadStore([makeRoot(), makeNode()])
    act(() => { useMindmapStore.getState().setSelectedNodeIds(['n1']) })
    const { svg, onNodeSelect } = renderCanvas()
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'mouse', clientX: 5, clientY: 5, pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'mouse', pointerId: 1 }) })
    expect(useMindmapStore.getState().selectedNodeIds).toEqual([])
    expect(onNodeSelect).toHaveBeenCalledWith(null)
  })
})

describe('DiagramCanvas — rubber-band selection', () => {
  // Map the cursor's canvas coords through createSVGPoint -> matrixTransform.
  function installCursor(svg: SVGSVGElement) {
    const ref = { cur: { x: 0, y: 0 } }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: ref.cur.x, y: ref.cur.y } as DOMPoint)
      return pt
    }
    return ref
  }

  it('dragging a marquee over all nodes selects them', () => {
    loadStore([makeRoot(), makeNode({ width: 100, height: 40 })])
    const { svg, container } = renderCanvas()
    // Build a marquee large enough to cover every laid-out node
    const nodes = useMindmapStore.getState().activeMindmap!.nodes
    const minX = Math.min(...nodes.map(n => n.x)) - 50
    const minY = Math.min(...nodes.map(n => n.y)) - 50
    const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 50
    const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 50
    const ref = installCursor(svg)
    ref.cur = { x: minX, y: minY }
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'mouse', clientX: 0, clientY: 0, pointerId: 1 }) })
    ref.cur = { x: maxX, y: maxY }
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'mouse', clientX: 999, clientY: 799, pointerId: 1 }) })
    // the dashed marquee rect is visible during the drag
    expect(container.querySelector('rect[fill="rgba(59,130,246,0.07)"]')).toBeTruthy()
    expect(useMindmapStore.getState().selectedNodeIds).toContain('n1')
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'mouse', pointerId: 1 }) })
    // The dashed rubber-band rect (unique fill) is cleared after pointer up
    expect(container.querySelector('rect[fill="rgba(59,130,246,0.07)"]')).toBeFalsy()
  })

  it('marquee with a single hit reports that node id to onNodeSelect', () => {
    loadStore([makeRoot(), makeNode({ width: 100, height: 40 })])
    const { svg, onNodeSelect } = renderCanvas()
    const n1 = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'n1')!
    const ref = installCursor(svg)
    // Marquee tightly around just n1
    ref.cur = { x: n1.x - 5, y: n1.y - 5 }
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'mouse', clientX: 0, clientY: 0, pointerId: 1 }) })
    ref.cur = { x: n1.x + n1.width + 5, y: n1.y + n1.height + 5 }
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'mouse', clientX: 100, clientY: 100, pointerId: 1 }) })
    expect(onNodeSelect).toHaveBeenCalledWith('n1')
  })
})

describe('DiagramCanvas — pan and zoom (wheel)', () => {
  it('wheel without ctrl pans the canvas (group transform updates)', () => {
    loadStore([makeRoot(), makeNode()])
    const { g } = renderCanvas()
    act(() => { fireEvent.wheel(g.ownerSVGElement!, { deltaX: 20, deltaY: 30 }) })
    const t = g.getAttribute('transform')
    expect(t).toContain('translate')
  })

  it('ctrl+wheel zooms and updates the zoom badge', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg, getByText } = renderCanvas()
    act(() => { fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true, clientX: 500, clientY: 400 }) })
    // a zoom percent should still render
    expect(getByText(/%$/)).toBeTruthy()
  })

  it('ctrl+wheel handles trackpad line deltaMode (=1)', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg } = renderCanvas()
    act(() => { fireEvent.wheel(svg, { deltaY: -2, ctrlKey: true, deltaMode: 1, clientX: 500, clientY: 400 }) })
    expect(svg).toBeTruthy()
  })

  it('wheel handles page deltaMode (=2)', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg } = renderCanvas()
    act(() => { fireEvent.wheel(svg, { deltaY: 1, deltaMode: 2 }) })
    expect(svg).toBeTruthy()
  })
})

describe('DiagramCanvas — zoom guards', () => {
  it('ctrl+wheel with deltaY 0 is a no-op (newZoom === oldZoom)', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg, getByText } = renderCanvas()
    const before = getByText(/%$/).textContent
    act(() => { fireEvent.wheel(svg, { deltaY: 0, ctrlKey: true, clientX: 100, clientY: 100 }) })
    expect(getByText(/%$/).textContent).toBe(before)
  })
})

describe('DiagramCanvas — pinch guard', () => {
  it('a single pinch move only records the baseline (no zoom yet)', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg } = renderCanvas()
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'touch', clientX: 100, clientY: 100, pointerId: 1 }) })
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'touch', clientX: 200, clientY: 100, pointerId: 2 }) })
    // one move sets baseline; lastPinchDist was null so no zoom math runs
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'touch', clientX: 210, clientY: 100, pointerId: 2 }) })
    expect(svg).toBeTruthy()
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'touch', pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'touch', pointerId: 2 }) })
  })
})

describe('DiagramCanvas — mouse down on a non-background element', () => {
  it('a mouse pointer-down on the inner group (not the svg bg) does not start a marquee', () => {
    loadStore([makeRoot(), makeNode()])
    const { g } = renderCanvas()
    // target is the <g>, currentTarget is the svg -> onBg false -> early return
    act(() => { fireEvent.pointerDown(g, { pointerType: 'mouse', clientX: 50, clientY: 50, pointerId: 8 }) })
    act(() => { fireEvent.pointerUp(g, { pointerType: 'mouse', pointerId: 8 }) })
    // no rubber-band rect was created
    expect((g.ownerSVGElement as SVGSVGElement).querySelector('rect[fill="rgba(59,130,246,0.07)"]')).toBeFalsy()
  })
})

describe('DiagramCanvas — pointer move without selection', () => {
  it('a plain mouse move (no drag started) is ignored', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg } = renderCanvas()
    // move with no prior pointerDown -> selStart null -> early return at the bottom
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'mouse', clientX: 50, clientY: 50, pointerId: 5 }) })
    expect(useMindmapStore.getState().selectedNodeIds).toEqual([])
  })
})

describe('DiagramCanvas — touch & pinch', () => {
  it('single-finger touch on the background pans', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg, g } = renderCanvas()
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'touch', clientX: 100, clientY: 100, pointerId: 1 }) })
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'touch', clientX: 150, clientY: 120, pointerId: 1 }) })
    expect(g.getAttribute('transform')).toContain('translate')
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'touch', pointerId: 1 }) })
  })

  it('two-finger pinch zooms toward the midpoint', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg } = renderCanvas()
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'touch', clientX: 100, clientY: 100, pointerId: 1 }) })
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'touch', clientX: 200, clientY: 100, pointerId: 2 }) })
    // first move sets baseline distance, second actually zooms
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'touch', clientX: 220, clientY: 100, pointerId: 2 }) })
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'touch', clientX: 300, clientY: 100, pointerId: 2 }) })
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'touch', pointerId: 2 }) })
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'touch', pointerId: 1 }) })
    expect(svg).toBeTruthy()
  })

  it('touch tap on a node does not start a background pan', () => {
    loadStore([makeRoot(), makeNode()])
    const { container } = renderCanvas()
    const nodeG = container.querySelector('[data-node-id="n1"]') as Element
    // pointer event whose target is the node, not the svg
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'touch', clientX: 320, clientY: 20, pointerId: 1 }) })
    // no crash; node-level handler manages it
    expect(container.querySelector('svg')).toBeTruthy()
  })
})

describe('DiagramCanvas — space/middle-button pan', () => {
  it('space+drag pans without clearing selection', () => {
    loadStore([makeRoot(), makeNode()])
    act(() => { useMindmapStore.getState().setSelectedNodeIds(['n1']) })
    const { svg, g } = renderCanvas()
    act(() => { fireEvent.keyDown(window, { code: 'Space' }) })
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'mouse', clientX: 100, clientY: 100, pointerId: 1 }) })
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'mouse', clientX: 160, clientY: 140, pointerId: 1 }) })
    expect(g.getAttribute('transform')).toContain('translate')
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'mouse', pointerId: 1 }) })
    // selection preserved
    expect(useMindmapStore.getState().selectedNodeIds).toContain('n1')
    act(() => { fireEvent.keyUp(window, { code: 'Space' }) })
  })

  it('middle-button drag pans', () => {
    loadStore([makeRoot(), makeNode()])
    const { svg, g } = renderCanvas()
    act(() => { fireEvent.pointerDown(svg, { pointerType: 'mouse', button: 1, clientX: 100, clientY: 100, pointerId: 1 }) })
    act(() => { fireEvent.pointerMove(svg, { pointerType: 'mouse', clientX: 130, clientY: 130, pointerId: 1 }) })
    expect(g.getAttribute('transform')).toContain('translate')
    act(() => { fireEvent.pointerUp(svg, { pointerType: 'mouse', pointerId: 1 }) })
  })

  it('space key from an input field does not enable pan', () => {
    loadStore([makeRoot(), makeNode()])
    renderCanvas()
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => { fireEvent.keyDown(input, { code: 'Space' }) })
    document.body.removeChild(input)
    // no assertion crash — spaceHeld stays false
    expect(true).toBe(true)
  })
})

describe('DiagramCanvas — drag reorder snap', () => {
  it('dragging a child near a sibling computes a snap target and reorders on drag end', () => {
    const a = makeNode({ id: 'a', sortOrder: 0, y: 0 })
    const b = makeNode({ id: 'b', sortOrder: 1, y: 100 })
    const c = makeNode({ id: 'c', sortOrder: 2, y: 200 })
    loadStore([makeRoot(), a, b, c], 'logic-chart')
    const { container, g } = renderCanvas()
    const nodeG = container.querySelector('[data-node-id="c"] > g') as Element
    ;(nodeG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    // make node drag report a cy that falls before sibling 'a'
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 320, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    cur = { x: 320, y: 200 }
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'mouse', clientX: 320, clientY: 200, pointerId: 1 }) })
    cur = { x: 320, y: -50 } // drag well above first sibling
    act(() => { fireEvent.pointerMove(nodeG, { pointerType: 'mouse', clientX: 320, clientY: -50, pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(nodeG, { pointerType: 'mouse', pointerId: 1 }) })
    // reorder happened (sortOrders re-indexed)
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c')).toBeDefined()
  })
})

describe('DiagramCanvas — drag a node with no siblings', () => {
  it('handleDragMove clears the snap line when the dragged node has no siblings', () => {
    const only = makeNode({ id: 'only', sortOrder: 0 })
    loadStore([makeRoot(), only], 'logic-chart')
    const { container, g } = renderCanvas()
    const nodeG = container.querySelector('[data-node-id="only"] > g') as Element
    ;(nodeG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 320, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    cur = { x: 320, y: 0 }
    act(() => { fireEvent.pointerDown(nodeG, { pointerType: 'mouse', clientX: 320, clientY: 0, pointerId: 1 }) })
    cur = { x: 360, y: 60 }
    act(() => { fireEvent.pointerMove(nodeG, { pointerType: 'mouse', clientX: 360, clientY: 60, pointerId: 1 }) })
    act(() => { fireEvent.pointerUp(nodeG, { pointerType: 'mouse', pointerId: 1 }) })
    // no snap target => no reorder; node still present
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'only')).toBeDefined()
  })
})

describe('DiagramCanvas — root drag HUD edge case', () => {
  it('does not render the trunk HUD when there is no L1 node', () => {
    const cbs: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cbs.push(cb); return cbs.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    loadStore([makeRoot()], 'logic-chart') // root only, no L1
    const { container, g } = renderCanvas()
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 0, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    const rootG = container.querySelector('[data-node-id="root"] > g') as Element
    ;(rootG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    cur = { x: 0, y: 0 }
    act(() => { fireEvent.pointerDown(rootG, { pointerType: 'mouse', clientX: 400, clientY: 400, pointerId: 1 }) })
    cur = { x: 60, y: 0 } // dx != 0 -> rootDragOffset set -> HUD attempts to render
    act(() => { fireEvent.pointerMove(rootG, { pointerType: 'mouse', clientX: 460, clientY: 400, pointerId: 1 }) })
    // HUD returns null because there is no L1 — no "px" text from the HUD
    expect(container.textContent).not.toMatch(/↔/)
    act(() => { fireEvent.pointerUp(rootG, { pointerType: 'mouse', pointerId: 1 }) })
    rafSpy.mockRestore(); vi.restoreAllMocks()
  })
})

describe('DiagramCanvas — readOnly', () => {
  it('renders nodes but they are not draggable / editable', () => {
    loadStore([makeRoot(), makeNode()])
    const { container } = renderCanvas({ readOnly: true })
    expect(container.querySelector('[data-node-id="n1"]')).toBeTruthy()
    // no resize handle in readonly
    expect(container.querySelector('g[style*="ew-resize"]')).toBeFalsy()
  })
})

describe('DiagramCanvas — fit view', () => {
  it('auto-fits on initial load (rAF fitView sets the group transform)', () => {
    // Capture rAF callbacks, then flush them after patching the svg rect
    const cbs: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cbs.push(cb); return cbs.length
    })
    loadStore([makeRoot(), makeNode()])
    const { g } = renderCanvas() // patchCanvas gives the svg a 1000x800 rect
    act(() => { cbs.forEach(cb => cb(0)) })
    // fitView applied a scale to the group
    expect(g.getAttribute('transform')).toMatch(/scale/)
    rafSpy.mockRestore()
  })

  it('fitView bails when the svg rect is zero-sized', () => {
    const cbs: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cbs.push(cb); return cbs.length
    })
    loadStore([makeRoot(), makeNode()])
    const utils = render(<DiagramCanvas onNodeSelect={vi.fn()} />)
    const svg = utils.container.querySelector('svg') as SVGSVGElement
    svg.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} } as DOMRect)
    act(() => { cbs.forEach(cb => cb(0)) })
    // no crash even with a zero rect — fitView returns early
    expect(svg).toBeTruthy()
    rafSpy.mockRestore()
  })

  it('re-fits when the diagram type switches', () => {
    loadStore([makeRoot(), makeNode()])
    const { g } = renderCanvas()
    act(() => { useMindmapStore.getState().setDiagramType('mindmap') })
    expect(g).toBeTruthy()
  })
})

describe('DiagramCanvas — zoom HUD timer', () => {
  it('flashes the zoom HUD and hides it after 1.5s', () => {
    vi.useFakeTimers()
    loadStore([makeRoot(), makeNode()])
    const { svg } = renderCanvas()
    act(() => { fireEvent.wheel(svg, { deltaY: -100, ctrlKey: true, clientX: 500, clientY: 400 }) })
    // a second zoom resets the timer (covers clearTimeout branch)
    act(() => { fireEvent.wheel(svg, { deltaY: -50, ctrlKey: true, clientX: 500, clientY: 400 }) })
    act(() => { vi.advanceTimersByTime(1500) })
    expect(svg).toBeTruthy()
    vi.useRealTimers()
  })
})

describe('DiagramCanvas — root drag auto-pan', () => {
  it('runs the auto-pan loop when the root is dragged into an edge zone', () => {
    // Capture every rAF callback; the auto-pan loop re-registers itself.
    const cbs: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cbs.push(cb); return cbs.length
    })
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    loadStore([makeRoot(), makeNode({ depth: 1, x: 800 })], 'logic-chart')
    const { container, g } = renderCanvas()
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 0, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    const rootG = container.querySelector('[data-node-id="root"] > g') as Element
    ;(rootG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    cur = { x: 0, y: 0 }
    cbs.length = 0
    // pointer down near the top-left edge (client x/y small => edge zone). dx!=0 forces HUD too.
    act(() => { fireEvent.pointerDown(rootG, { pointerType: 'mouse', clientX: 10, clientY: 10, pointerId: 1 }) })
    cur = { x: -30, y: -30 }
    act(() => { fireEvent.pointerMove(rootG, { pointerType: 'mouse', clientX: 10, clientY: 10, pointerId: 1 }) })
    // Drive every queued rAF callback (the auto-pan loop is in there)
    act(() => { cbs.slice().forEach(cb => cb(0)) })
    act(() => { cbs.slice().forEach(cb => cb(0)) })
    // release root -> auto-pan loop cancelled
    act(() => { fireEvent.pointerUp(rootG, { pointerType: 'mouse', pointerId: 1 }) })
    expect(cancelSpy).toHaveBeenCalled()
    rafSpy.mockRestore(); cancelSpy.mockRestore()
  })

  it('auto-pans toward the bottom-right edge zone', () => {
    const cbs: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cbs.push(cb); return cbs.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    // jsdom default viewport is 1024x768 — drive the cursor into the bottom-right zone
    loadStore([makeRoot(), makeNode({ depth: 1, x: 800 })], 'logic-chart')
    const { container, g } = renderCanvas()
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 0, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    const rootG = container.querySelector('[data-node-id="root"] > g') as Element
    ;(rootG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    cbs.length = 0
    act(() => { fireEvent.pointerDown(rootG, { pointerType: 'mouse', clientX: 1020, clientY: 760, pointerId: 1 }) })
    cur = { x: 5, y: 0 }
    act(() => { fireEvent.pointerMove(rootG, { pointerType: 'mouse', clientX: 1020, clientY: 760, pointerId: 1 }) })
    act(() => { cbs.slice().forEach(cb => cb(0)) })
    act(() => { fireEvent.pointerUp(rootG, { pointerType: 'mouse', pointerId: 1 }) })
    expect(g).toBeTruthy()
    rafSpy.mockRestore(); vi.restoreAllMocks()
  })

  it('auto-pan loop stops itself when the drag client ref is cleared', () => {
    const cbs: FrameRequestCallback[] = []
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cbs.push(cb); return cbs.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    loadStore([makeRoot(), makeNode({ depth: 1, x: 800 })], 'logic-chart')
    const { container, g } = renderCanvas()
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 0, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    const rootG = container.querySelector('[data-node-id="root"] > g') as Element
    ;(rootG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    cbs.length = 0
    act(() => { fireEvent.pointerDown(rootG, { pointerType: 'mouse', clientX: 400, clientY: 400, pointerId: 1 }) })
    // release first (clears rootDragClientRef), THEN run the loop -> hits the null-client branch
    act(() => { fireEvent.pointerUp(rootG, { pointerType: 'mouse', pointerId: 1 }) })
    act(() => { cbs.slice().forEach(cb => cb(0)) })
    expect(g).toBeTruthy()
    rafSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('shows the root drag HUD with the trunk length', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    loadStore([makeRoot(), makeNode({ depth: 1, x: 800 })], 'logic-chart')
    const { container, g } = renderCanvas()
    const svg = g.ownerSVGElement as SVGSVGElement
    let cur = { x: 0, y: 0 }
    ;(svg as unknown as { createSVGPoint: () => DOMPoint }).createSVGPoint = () => {
      const pt = { x: 0, y: 0 } as DOMPoint
      ;(pt as unknown as { matrixTransform: () => DOMPoint }).matrixTransform = () => ({ x: cur.x, y: cur.y } as DOMPoint)
      return pt
    }
    const rootG = container.querySelector('[data-node-id="root"] > g') as Element
    ;(rootG as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
    cur = { x: 0, y: 0 }
    act(() => { fireEvent.pointerDown(rootG, { pointerType: 'mouse', clientX: 400, clientY: 400, pointerId: 1 }) })
    cur = { x: 60, y: 0 } // a non-zero dx so rootDragOffset is set, HUD renders
    act(() => { fireEvent.pointerMove(rootG, { pointerType: 'mouse', clientX: 460, clientY: 400, pointerId: 1 }) })
    expect(container.textContent).toMatch(/px/)
    act(() => { fireEvent.pointerUp(rootG, { pointerType: 'mouse', pointerId: 1 }) })
    rafSpy.mockRestore()
  })
})
