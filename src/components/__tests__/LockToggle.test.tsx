import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LockToggle } from '../LockToggle'

afterEach(cleanup)

describe('LockToggle', () => {
  it('calls onToggle when clicked', async () => {
    const onToggle = vi.fn()
    render(<LockToggle locked={false} onToggle={onToggle} name="My Map" />)
    await userEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows the locked tooltip and pressed state when locked', () => {
    render(<LockToggle locked onToggle={() => {}} name="My Map" />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveAttribute('title', 'Locked: linked from a README. Unlock to edit or delete.')
    expect(btn).toHaveAccessibleName('Unlock My Map')
  })

  it('shows the unlocked state when not locked', () => {
    render(<LockToggle locked={false} onToggle={() => {}} name="My Map" />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveAccessibleName('Lock My Map')
  })
})
