import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { CuteToast, showToast, dismissToast } from '../CuteToast'

describe('CuteToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('renders only the keyframes <style> when no toast is active', () => {
    const { container } = render(<CuteToast />)
    const style = container.querySelector('style')
    expect(style).toBeTruthy()
    expect(style?.innerHTML).toContain('cuteToastInOut')
    // no toast pill present
    expect(screen.queryByText(/hello/i)).toBeNull()
  })

  it('shows a toast message when showToast is called', () => {
    render(<CuteToast />)
    act(() => { showToast('Saved!') })
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('auto-dismisses after the default duration', () => {
    render(<CuteToast />)
    act(() => { showToast('Bye soon') })
    expect(screen.getByText('Bye soon')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Bye soon')).toBeNull()
  })

  it('respects a custom duration', () => {
    render(<CuteToast />)
    act(() => { showToast('Quick', { duration: 1000 }) })
    expect(screen.getByText('Quick')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(999) })
    expect(screen.getByText('Quick')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1) })
    expect(screen.queryByText('Quick')).toBeNull()
  })

  it('applies a custom color to the pill', () => {
    render(<CuteToast />)
    act(() => { showToast('Colored', { color: '#ff0000' }) })
    const text = screen.getByText('Colored')
    // walk up to the pill container which carries the background color
    const pill = text.parentElement as HTMLElement
    expect(pill.style.background).toBe('rgb(255, 0, 0)')
  })

  it('renders confetti particles when confetti option is set', () => {
    const { container } = render(<CuteToast />)
    act(() => { showToast('Party', { confetti: true }) })
    // 18 confetti particles use the cuteConfetti animation
    const confettiEls = Array.from(container.querySelectorAll('div')).filter(
      d => d.style.animation.includes('cuteConfetti')
    )
    expect(confettiEls.length).toBe(18)
  })

  it('does not render confetti when option is false', () => {
    const { container } = render(<CuteToast />)
    act(() => { showToast('NoParty', { confetti: false }) })
    const confettiEls = Array.from(container.querySelectorAll('div')).filter(
      d => d.style.animation.includes('cuteConfetti')
    )
    expect(confettiEls.length).toBe(0)
  })

  it('dismissToast hides an active toast immediately', () => {
    render(<CuteToast />)
    act(() => { showToast('Dismiss me') })
    expect(screen.getByText('Dismiss me')).toBeInTheDocument()
    act(() => { dismissToast() })
    expect(screen.queryByText('Dismiss me')).toBeNull()
  })

  it('clears the previous timer when a new toast arrives', () => {
    render(<CuteToast />)
    act(() => { showToast('First', { duration: 3000 }) })
    act(() => { vi.advanceTimersByTime(2000) })
    // second toast resets the timer
    act(() => { showToast('Second', { duration: 3000 }) })
    expect(screen.getByText('Second')).toBeInTheDocument()
    // after 2000ms total elapsed since second, first's timer would have fired -> ensure still visible
    act(() => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText('Second')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByText('Second')).toBeNull()
  })

  it('unsubscribes its listener on unmount', () => {
    const { unmount } = render(<CuteToast />)
    unmount()
    // showToast with no mounted listener should not throw
    expect(() => act(() => { showToast('orphan') })).not.toThrow()
  })
})

describe('CuteToast SSR-safe center fallback', () => {
  it('uses confetti center math even with confetti enabled (window present)', () => {
    vi.useFakeTimers()
    const { container } = render(<CuteToast />)
    act(() => { showToast('Center', { confetti: true, color: '#123456' }) })
    const confettiEls = Array.from(container.querySelectorAll('div')).filter(
      d => d.style.animation.includes('cuteConfetti')
    )
    // first particle should reference custom color in confettiColors set
    expect(confettiEls.length).toBe(18)
    // the toast color is the first confetti color
    expect(confettiEls[0].style.background).toBe('rgb(18, 52, 86)')
    cleanup()
    vi.useRealTimers()
  })
})
