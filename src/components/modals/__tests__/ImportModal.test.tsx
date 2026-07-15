import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ImportModal } from '../ImportModal'

describe('ImportModal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    // Remove the navigator.clipboard override so each test starts clean
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })

  function setClipboard(impl?: { writeText: (s: string) => Promise<void> }) {
    Object.defineProperty(navigator, 'clipboard', { value: impl, configurable: true })
  }

  it('renders all import format rows', () => {
    render(<ImportModal onClose={() => {}} />)
    expect(screen.getByText('Import Formats')).toBeTruthy()
    expect(screen.getByText('1. Generate with AI')).toBeTruthy()
    expect(screen.getByText('2. Paste (⌘V) anywhere')).toBeTruthy()
    expect(screen.getByText('3. POST via API')).toBeTruthy()
    expect(screen.getByText('AI agents - how to discover this API')).toBeTruthy()
  })

  it('uses the placeholder when no userId is supplied', () => {
    render(<ImportModal onClose={() => {}} />)
    // The curl example embeds the placeholder uid
    expect(screen.getByText(/<your-user-id>/)).toBeTruthy()
  })

  it('uses the provided userId in the curl example', () => {
    render(<ImportModal onClose={() => {}} userId="abc-123" />)
    expect(screen.getByText(/abc-123/)).toBeTruthy()
  })

  it('uses null userId fallback', () => {
    render(<ImportModal onClose={() => {}} userId={null} />)
    expect(screen.getByText(/<your-user-id>/)).toBeTruthy()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ImportModal onClose={onClose} />)
    // The outermost div is the backdrop
    const backdrop = container.firstChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when the inner panel is clicked (stopPropagation)', () => {
    const onClose = vi.fn()
    render(<ImportModal onClose={onClose} />)
    fireEvent.click(screen.getByText('Import Formats'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when the X button is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<ImportModal onClose={onClose} />)
    // Last header button is the X (close)
    const buttons = container.querySelectorAll('button')
    fireEvent.click(buttons[buttons.length === 0 ? 0 : 1] as HTMLButtonElement)
    expect(onClose).toHaveBeenCalled()
  })

  it('copyAll uses navigator.clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    render(<ImportModal onClose={() => {}} />)
    const copyBtn = screen.getByTitle('Copy all instructions for AI')
    await act(async () => {
      fireEvent.click(copyBtn)
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Import Guide for AI Agents'))
    // "Copied!" label appears
    expect(screen.getByText('Copied!')).toBeTruthy()
    // After 1800ms it resets
    act(() => { vi.advanceTimersByTime(1800) })
    expect(screen.getByText('Copy for AI')).toBeTruthy()
  })

  it('copyAll falls back to execCommand when clipboard rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    setClipboard({ writeText })
    const exec = vi.fn()
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    render(<ImportModal onClose={() => {}} />)
    await act(async () => {
      fireEvent.click(screen.getByTitle('Copy all instructions for AI'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(exec).toHaveBeenCalledWith('copy')
    expect(screen.getByText('Copied!')).toBeTruthy()
  })

  it('copyAll falls back to execCommand when clipboard is unavailable', () => {
    setClipboard(undefined)
    const exec = vi.fn()
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    render(<ImportModal onClose={() => {}} />)
    act(() => {
      fireEvent.click(screen.getByTitle('Copy all instructions for AI'))
    })
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('CodeBlock copy button copies via clipboard and toggles the Check icon', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    const { container } = render(<ImportModal onClose={() => {}} />)
    // Copyable CodeBlocks render a button with title="Copy"
    const copyButtons = Array.from(container.querySelectorAll('button[title="Copy"]'))
    expect(copyButtons.length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(copyButtons[0] as HTMLButtonElement)
      await Promise.resolve()
    })
    // It copies the paste JSON example
    expect(writeText).toHaveBeenCalled()
    // After timeout the copied state resets
    act(() => { vi.advanceTimersByTime(1800) })
  })

  it('CodeBlock copy falls back to execCommand on clipboard rejection', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('no'))
    setClipboard({ writeText })
    const exec = vi.fn()
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    const { container } = render(<ImportModal onClose={() => {}} />)
    const copyButtons = Array.from(container.querySelectorAll('button[title="Copy"]'))
    await act(async () => {
      fireEvent.click(copyButtons[0] as HTMLButtonElement)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(exec).toHaveBeenCalledWith('copy')
  })

  it('CodeBlock copy falls back to execCommand when clipboard missing', () => {
    setClipboard(undefined)
    const exec = vi.fn()
    ;(document as unknown as { execCommand: typeof exec }).execCommand = exec
    const { container } = render(<ImportModal onClose={() => {}} />)
    const copyButtons = Array.from(container.querySelectorAll('button[title="Copy"]'))
    act(() => {
      fireEvent.click(copyButtons[0] as HTMLButtonElement)
    })
    expect(exec).toHaveBeenCalledWith('copy')
  })
})
