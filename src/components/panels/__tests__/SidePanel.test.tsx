import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { SidePanel } from '../SidePanel'
import { useMindmapStore } from '../../../store/mindmapStore'
import type { Diagram, MindmapNode } from '../../../types'

// Silence toast DOM noise
vi.mock('../../CuteToast', () => ({
  showToast: vi.fn(),
  dismissToast: vi.fn(),
  CuteToast: () => null,
}))
// Avoid real PDF export (html2canvas/jspdf)
vi.mock('../../../lib/export/exportPdf', () => ({
  exportDiagramAsPdf: vi.fn(),
}))

import { exportDiagramAsPdf } from '../../../lib/export/exportPdf'

// ── Helpers ────────────────────────────────────────────────────────────────
function makeDiagram(overrides: Partial<Diagram> = {}): Diagram {
  const root: MindmapNode = {
    id: 'root', title: 'Root Topic', color: '#6366f1', parentId: null, depth: 0,
    x: 0, y: 0, width: 140, height: 140, sortOrder: 0,
  }
  const child1: MindmapNode = {
    id: 'c1', title: 'Child One', color: '#ef4444', parentId: 'root', depth: 1,
    x: 0, y: 0, width: 160, height: 40, sortOrder: 0,
  }
  const child2: MindmapNode = {
    id: 'c2', title: 'Child Two', color: '#22c55e', parentId: 'root', depth: 1,
    x: 0, y: 0, width: 160, height: 40, sortOrder: 1,
  }
  const grandchild: MindmapNode = {
    id: 'g1', title: 'Grandchild', color: '#22c55e', parentId: 'c1', depth: 2,
    x: 0, y: 0, width: 120, height: 40, sortOrder: 0,
  }
  return {
    id: 'd1', name: 'Root Topic', type: 'logic-chart', lineStyle: 'orthogonal',
    nodes: [root, child1, child2, grandchild],
    createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    themeId: 'default', tags: [],
    ...overrides,
  }
}

function loadDiagram(d: Diagram = makeDiagram()) {
  act(() => { useMindmapStore.getState().setActiveMindmap(d) })
}

function resetStore() {
  const s = useMindmapStore.getState()
  act(() => {
    s.clearDiagram()
    useMindmapStore.setState({
      diagrams: [], selectedNodeIds: [], isDirty: false,
      diagramType: 'logic-chart', lineStyle: 'orthogonal', themeId: 'default',
      showOrderNumbers: true, showChildCount: false, hideDetails: false,
      isImporting: false, past: [], future: [],
    })
  })
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
  vi.clearAllMocks()
  // navigator.clipboard for share copy
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SidePanel — tabs and structure', () => {
  it('renders the three tabs and the close button', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    expect(screen.getByText('Map')).toBeInTheDocument()
    expect(screen.getByText('Style')).toBeInTheDocument()
    expect(screen.getByText('Share')).toBeInTheDocument()
  })

  it('defaults to map tab when no node is selected', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    expect(screen.getByText('Type')).toBeInTheDocument() // map tab content
  })

  it('auto-switches to style tab when a node is selected', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    expect(screen.getByText('Text')).toBeInTheDocument() // style block
  })

  it('clicking close calls onClose', () => {
    loadDiagram()
    const onClose = vi.fn()
    const { container } = render(<SidePanel nodeId={null} onClose={onClose} />)
    // The close button is the X button after the tabs (width 30)
    const buttons = container.querySelectorAll('button')
    const closeBtn = Array.from(buttons).find(b => (b as HTMLElement).style.width === '30px')!
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('switches between tabs on click', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    expect(screen.getByText('Public Link')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Style'))
    expect(screen.getByText(/Select a node to style it/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Map'))
    expect(screen.getByText('Type')).toBeInTheDocument()
  })
})

describe('SidePanel — Style tab', () => {
  it('shows placeholder when style tab active but no node', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Style'))
    expect(screen.getByText(/Select a node to style it/)).toBeInTheDocument()
  })

  it('edits node title via the Label input on Enter', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    const input = screen.getByDisplayValue('Child One') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
    expect(node.title).toBe('Renamed')
  })

  it('saves title on blur when changed', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    const input = screen.getByDisplayValue('Child One') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'BlurName' } })
    fireEvent.blur(input)
    const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
    expect(node.title).toBe('BlurName')
  })

  it('does not save on blur when title unchanged', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    const input = screen.getByDisplayValue('Child One') as HTMLInputElement
    fireEvent.focus(input) // exercise onFocus border handler
    fireEvent.blur(input)
    expect(useMindmapStore.getState().isDirty).toBe(false)
  })

  it('toggles bold and italic', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('B'))
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.bold).toBe(true)
    fireEvent.click(screen.getByText('I'))
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.italic).toBe(true)
  })

  it('sets text alignment', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    // The Format row holds B, I, a divider, then 3 align buttons (left/center/right).
    // Grab the row by the bold "B" button's grandparent and take the last 3 buttons.
    const boldBtn = screen.getByText('B')
    const formatRow = boldBtn.parentElement!
    const rowBtns = Array.from(formatRow.querySelectorAll('button')) as HTMLElement[]
    const alignBtns = rowBtns.slice(-3) // left, center, right
    expect(alignBtns.length).toBe(3)
    fireEvent.click(alignBtns[2]) // right
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.textAlign).toBe('right')
    fireEvent.click(alignBtns[1]) // center
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.textAlign).toBe('center')
    fireEvent.click(alignBtns[0]) // left
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.textAlign).toBe('left')
  })

  it('ColorField swatches change node color', () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    // ColorField swatch buttons have borderRadius 5px and a solid bg color
    const swatches = (Array.from(container.querySelectorAll('button')) as HTMLElement[]).filter(
      b => b.style.borderRadius === '5px' && b.style.background.startsWith('rgb')
    )
    expect(swatches.length).toBe(11)
    fireEvent.click(swatches[1])
    const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
    // default theme color index 1 is #f97316
    expect(node.color).toBe('#f97316')
  })

  it('ColorField custom color input changes color', () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement
    fireEvent.change(colorInput, { target: { value: '#123456' } })
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.color).toBe('#123456')
  })

  it('width slider invokes resizeNodeDepth', () => {
    loadDiagram()
    const spy = vi.spyOn(useMindmapStore.getState(), 'resizeNodeDepth')
    const { container } = render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(slider).toBeTruthy()
    fireEvent.change(slider, { target: { value: '300' } })
    expect(spy).toHaveBeenCalledWith(1, 300)
    spy.mockRestore()
  })

  it('hides width slider for mindmap shallow nodes', () => {
    loadDiagram(makeDiagram({ type: 'mindmap' }))
    const { container } = render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    // depth 1 in mindmap → width row hidden
    expect(container.querySelector('input[type="range"]')).toBeNull()
  })

  it('renders root-only Branch block with shape + line for non-mindmap', () => {
    loadDiagram()
    render(<SidePanel nodeId="root" onClose={vi.fn()} />)
    expect(screen.getByText('Branch')).toBeInTheDocument()
    expect(screen.getByText('Circle')).toBeInTheDocument()
    expect(screen.getByText('Pill')).toBeInTheDocument()
    expect(screen.getByText('Brace')).toBeInTheDocument()
    expect(screen.getByText('Straight')).toBeInTheDocument()
    expect(screen.getByText('Square')).toBeInTheDocument()
  })

  it('clicking shape Pill saves shape and dimensions', () => {
    loadDiagram()
    render(<SidePanel nodeId="root" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Pill'))
    const root = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.parentId === null)!
    expect(root.shape).toBe('pill')
  })

  it('clicking shape Circle saves shape', () => {
    loadDiagram()
    render(<SidePanel nodeId="root" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Circle'))
    const root = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.parentId === null)!
    expect(root.shape).toBe('circle')
  })

  it('clicking line style buttons in Branch block sets lineStyle', () => {
    loadDiagram()
    render(<SidePanel nodeId="root" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Straight'))
    expect(useMindmapStore.getState().lineStyle).toBe('straight')
    fireEvent.click(screen.getByText('Brace'))
    expect(useMindmapStore.getState().lineStyle).toBe('curved')
  })

  it('hides Branch shape/line rows in mindmap mode for root', () => {
    loadDiagram(makeDiagram({ type: 'mindmap' }))
    render(<SidePanel nodeId="root" onClose={vi.fn()} />)
    // In mindmap, shape/line rows hidden — Branch block has no Circle/Pill
    expect(screen.queryByText('Circle')).toBeNull()
  })
})

describe('SidePanel — VisualPickerBlock', () => {
  it('renders icon/emoji/text tabs for non-root node', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    expect(screen.getByText('⬡ Icon')).toBeInTheDocument()
    expect(screen.getByText('😊 Emoji')).toBeInTheDocument()
    expect(screen.getByText('Aa Text')).toBeInTheDocument()
  })

  it('does not render Visual block for root node', () => {
    loadDiagram()
    render(<SidePanel nodeId="root" onClose={vi.fn()} />)
    expect(screen.queryByText('⬡ Icon')).toBeNull()
  })

  it('selects an icon from the icon grid', () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    // First icon button in the 4-col grid
    const iconGrid = container.querySelector('div[style*="repeat(4, 1fr)"]')!
    const firstIconBtn = iconGrid.querySelector('button')!
    fireEvent.click(firstIconBtn)
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.icon).toBeTruthy()
  })

  it('filters icons by search term', async () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    const searchInput = screen.getByPlaceholderText(/Search…/) as HTMLInputElement
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, { target: { value: 'zzznomatch' } })
    fireEvent.blur(searchInput)
    await waitFor(() => {
      const grid = document.querySelector('div[style*="repeat(4, 1fr)"]')!
      expect(grid.querySelectorAll('button').length).toBe(0)
    })
  })

  it('switches to emoji tab and selects an emoji', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('😊 Emoji'))
    fireEvent.click(screen.getByText('⭐'))
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.emoji).toBe('⭐')
  })

  it('emoji tab typing into input saves emoji', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('😊 Emoji'))
    const input = screen.getByPlaceholderText(/Paste or type an emoji/) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '🚀' } })
    fireEvent.blur(input)
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.emoji).toBe('🚀')
  })

  it('text tab typing saves label-as-emoji', () => {
    loadDiagram()
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Aa Text'))
    const input = screen.getByPlaceholderText('L') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'A1' } })
    fireEvent.blur(input)
    expect(useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!.emoji).toBe('A1')
  })

  it('defaults to text tab when node has a short ASCII emoji label', () => {
    const d = makeDiagram()
    d.nodes[1].emoji = 'A1'
    loadDiagram(d)
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    expect((screen.getByPlaceholderText('L') as HTMLInputElement).value).toBe('A1')
  })

  it('defaults to emoji tab when node has a unicode emoji', () => {
    const d = makeDiagram()
    d.nodes[1].emoji = '🔥'
    loadDiagram(d)
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    expect((screen.getByPlaceholderText(/Paste or type an emoji/) as HTMLInputElement).value).toBe('🔥')
  })

  it('defaults to icon tab when node already has an icon', () => {
    const d = makeDiagram()
    d.nodes[1].icon = 'star'
    loadDiagram(d)
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    expect(screen.getByPlaceholderText(/Search…/)).toBeInTheDocument()
  })
})

describe('SidePanel — Map tab', () => {
  it('switches diagram type', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Mind Map'))
    expect(useMindmapStore.getState().diagramType).toBe('mindmap')
    fireEvent.click(screen.getByText('Fishbone'))
    expect(useMindmapStore.getState().diagramType).toBe('fishbone')
    fireEvent.click(screen.getByText('Timeline'))
    expect(useMindmapStore.getState().diagramType).toBe('timeline')
    fireEvent.click(screen.getByText('Logic Chart'))
    expect(useMindmapStore.getState().diagramType).toBe('logic-chart')
  })

  it('shows the Line block for logic-chart and mindmap but not fishbone/timeline', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    // logic-chart → Line block present (Map tab has its own Brace/Straight/Square)
    expect(screen.getAllByText('Brace').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByText('Fishbone'))
    expect(screen.queryByText('Brace')).toBeNull()
  })

  it('changes line style from Map tab', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Straight'))
    expect(useMindmapStore.getState().lineStyle).toBe('straight')
    fireEvent.click(screen.getByText('Square'))
    expect(useMindmapStore.getState().lineStyle).toBe('orthogonal')
  })

  it('toggles Show order # and Show count', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    const before = useMindmapStore.getState().showOrderNumbers
    fireEvent.click(screen.getByText('Show order #').parentElement!.querySelector('button')!)
    expect(useMindmapStore.getState().showOrderNumbers).toBe(!before)
    fireEvent.click(screen.getByText('Show count').parentElement!.querySelector('button')!)
    expect(useMindmapStore.getState().showChildCount).toBe(true)
  })

  it('lists all themes and switches theme', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    expect(screen.getByText('Rainbow Light')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Monokai'))
    expect(useMindmapStore.getState().themeId).toBe('monokai')
  })
})

describe('SidePanel — Auto Icons (AI)', () => {
  it('shows toast and does nothing when all nodes already have icons', async () => {
    const { showToast } = await import('../../CuteToast')
    const d = makeDiagram()
    d.nodes.forEach(n => { if (n.depth > 0) n.icon = 'star' })
    loadDiagram(d)
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('✦ Auto Icons (AI)'))
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('All nodes already have icons', expect.anything()))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('assigns icons from a successful AI response', async () => {
    loadDiagram()
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        outline: JSON.stringify([{ id: 'c1', icon: 'star' }, { id: 'c2', icon: 'rocket' }, { id: 'g1', icon: 'bot' }]),
        usage: { total_tokens: 1500 },
      }),
    })
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByText('✦ Auto Icons (AI)'))
    })
    await waitFor(() => {
      const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
      expect(node.icon).toBe('star')
    }, { timeout: 3000 })
  })

  it('forces icons when AI returns no JSON array (fallback path)', async () => {
    loadDiagram()
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'no array here', tokens: 0 }),
    })
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByText('✦ Auto Icons (AI)'))
    })
    await waitFor(() => {
      const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
      expect(node.icon).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('forces icons when fetch rejects (network error path)', async () => {
    loadDiagram()
    ;(fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'))
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByText('✦ Auto Icons (AI)'))
    })
    await waitFor(() => {
      const node = useMindmapStore.getState().activeMindmap!.nodes.find(n => n.id === 'c1')!
      expect(node.icon).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('assigns AI icons and forces icons for nodes AI missed', async () => {
    loadDiagram()
    ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        // only c1 assigned, c2 + g1 missed; one entry has empty id and invalid icon to hit branches
        result: JSON.stringify([{ id: 'c1', icon: 'definitely-not-an-icon' }, { id: '', icon: 'star' }]),
        usage: { total_tokens: 500 },
      }),
    })
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByText('✦ Auto Icons (AI)'))
    })
    await waitFor(() => {
      const map = useMindmapStore.getState().activeMindmap!
      expect(map.nodes.find(n => n.id === 'c1')!.icon).toBeTruthy()
      expect(map.nodes.find(n => n.id === 'c2')!.icon).toBeTruthy()
      expect(map.nodes.find(n => n.id === 'g1')!.icon).toBeTruthy()
    }, { timeout: 3000 })
  })
})

describe('SidePanel — Share tab', () => {
  it('renders QR code and copy button', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
    expect(screen.getByText('Link disabled')).toBeInTheDocument()
  })

  it('copies the share link', async () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    fireEvent.click(screen.getByText('Copy Link'))
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument())
  })

  it('enabling the public link toggle copies and sets sharingEnabled', async () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    // toggle is the 40x22 button in the Public Link block
    const toggle = Array.from(container.querySelectorAll('button')).find(
      b => (b as HTMLElement).style.width === '40px'
    )!
    fireEvent.click(toggle)
    expect(useMindmapStore.getState().activeMindmap!.sharingEnabled).toBe(true)
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
  })

  it('disabling the public link toggle does not copy', () => {
    loadDiagram(makeDiagram({ sharingEnabled: true }))
    const { container } = render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    expect(screen.getByText('Link active')).toBeInTheDocument()
    const toggle = Array.from(container.querySelectorAll('button')).find(
      b => (b as HTMLElement).style.width === '40px'
    )!
    ;(navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockClear()
    fireEvent.click(toggle)
    expect(useMindmapStore.getState().activeMindmap!.sharingEnabled).toBe(false)
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('Export PDF button calls exportDiagramAsPdf', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    fireEvent.click(screen.getByText('Export PDF'))
    expect(exportDiagramAsPdf).toHaveBeenCalledWith('Root Topic')
  })

  it('delete flow: opens confirm modal, cancel closes it', () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId={null} onClose={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    // trash button (icon-only) in File block
    const trash = Array.from(container.querySelectorAll('button')).find(
      b => (b as HTMLElement).style.border === '1px solid rgb(254, 202, 202)'
    )!
    fireEvent.click(trash)
    expect(screen.getByText('Delete map?')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Delete map?')).toBeNull()
  })

  it('delete flow: confirming calls onDelete', () => {
    loadDiagram()
    const onDelete = vi.fn()
    const { container } = render(<SidePanel nodeId={null} onClose={vi.fn()} onDelete={onDelete} />)
    fireEvent.click(screen.getByText('Share'))
    const trash = Array.from(container.querySelectorAll('button')).find(
      b => (b as HTMLElement).style.border === '1px solid rgb(254, 202, 202)'
    )!
    fireEvent.click(trash)
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalled()
    expect(screen.queryByText('Delete map?')).toBeNull()
  })

  it('clicking modal backdrop closes the delete confirm', () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId={null} onClose={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    const trash = Array.from(container.querySelectorAll('button')).find(
      b => (b as HTMLElement).style.border === '1px solid rgb(254, 202, 202)'
    )!
    fireEvent.click(trash)
    const heading = screen.getByText('Delete map?')
    // The fixed-position element IS the backdrop (it has the close onClick);
    // the inner dialog stops propagation.
    const backdrop = heading.closest('div[style*="position: fixed"]')!
    fireEvent.click(backdrop)
    expect(screen.queryByText('Delete map?')).toBeNull()
  })
})

describe('SidePanel — edge cases', () => {
  it('renders with no active mindmap (share url empty)', () => {
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    // No QR crash; copy button still present
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
  })

  it('save() no-ops when nodeId is null on style tab', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Style'))
    // No node → placeholder, no inputs to save with
    expect(screen.getByText(/Select a node to style it/)).toBeInTheDocument()
  })

  it('batch updates multiple selected nodes', () => {
    loadDiagram()
    act(() => { useMindmapStore.getState().setSelectedNodeIds(['c1', 'c2']) })
    render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('B'))
    const map = useMindmapStore.getState().activeMindmap!
    expect(map.nodes.find(n => n.id === 'c1')!.bold).toBe(true)
    expect(map.nodes.find(n => n.id === 'c2')!.bold).toBe(true)
  })
})

describe('SidePanel — hover handlers and timers (coverage)', () => {
  it('Auto Icons button hover toggles background', () => {
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    const btn = screen.getByText('✦ Auto Icons (AI)')
    fireEvent.mouseEnter(btn)
    fireEvent.mouseLeave(btn)
    expect(btn).toBeInTheDocument()
  })

  it('Export PDF and trash buttons hover handlers', () => {
    loadDiagram()
    const { container } = render(<SidePanel nodeId={null} onClose={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    const pdf = screen.getByText('Export PDF')
    fireEvent.mouseEnter(pdf); fireEvent.mouseLeave(pdf)
    const trash = (Array.from(container.querySelectorAll('button')) as HTMLElement[]).find(
      b => b.style.border === '1px solid rgb(254, 202, 202)'
    )!
    fireEvent.mouseEnter(trash); fireEvent.mouseLeave(trash)
    expect(pdf).toBeInTheDocument()
  })

  it('copyShare resets the Copied state after the timeout', async () => {
    vi.useFakeTimers()
    loadDiagram()
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Share'))
    await act(async () => { fireEvent.click(screen.getByText('Copy Link')) })
    // Resolve the clipboard promise microtask
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('Copied!')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText('Copy Link')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('save() no-ops when no node and selection is single empty', () => {
    loadDiagram()
    // Render style tab via a node, then deselect to null and ensure save guard
    const { rerender } = render(<SidePanel nodeId="c1" onClose={vi.fn()} />)
    act(() => { useMindmapStore.getState().setSelectedNodeIds([]) })
    rerender(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Style'))
    expect(screen.getByText(/Select a node to style it/)).toBeInTheDocument()
  })

  it('Auto Icons no-ops with no active mindmap', () => {
    // No diagram loaded → runAIIcons early-returns on !activeMindmap
    render(<SidePanel nodeId={null} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('✦ Auto Icons (AI)'))
    expect(fetch).not.toHaveBeenCalled()
  })
})
