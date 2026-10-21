import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'
import { LockMenu } from '../LockMenu'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function setup(over: Partial<React.ComponentProps<typeof LockMenu>> = {}) {
  const onSetPasscode = vi.fn().mockResolvedValue(true)
  const utils = render(<LockMenu hasPasscode={false} passcode="" onSetPasscode={onSetPasscode} isMobile={false} {...over} />)
  return { onSetPasscode, ...utils }
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /Lock/ , expanded: false }))

describe('LockMenu', () => {
  it('shows Lock when unlocked and Locked when a passcode is set', () => {
    const { unmount } = setup()
    expect(screen.getByText('Lock')).toBeInTheDocument()
    expect(screen.getByLabelText('Add a passcode to the share link')).toHaveAttribute('aria-pressed', 'false')
    unmount()
    setup({ hasPasscode: true, passcode: 'abc' })
    expect(screen.getByText('Locked')).toBeInTheDocument()
    expect(screen.getByLabelText('Passcode on: change or remove it')).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides the key pill and the label on mobile', () => {
    setup({ isMobile: true })
    expect(screen.queryByLabelText('Add a passcode to the share link')).not.toBeInTheDocument()
    expect(screen.queryByText('Lock')).not.toBeInTheDocument()
  })

  it('opens and closes the menu from the main button and the key pill', () => {
    setup()
    openMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Anyone with the link views it')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Lock'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Add a passcode to the share link'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes on an outside pointerdown but not an inside one', () => {
    setup()
    openMenu()
    fireEvent.pointerDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens the passcode box when Lock access is switched on, and closes it on a second click', () => {
    setup()
    openMenu()
    const sw = screen.getByRole('menuitemcheckbox')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByPlaceholderText('Choose a passcode')).toBeInTheDocument()
    fireEvent.click(sw)
    expect(screen.queryByLabelText('Passcode')).not.toBeInTheDocument()
  })

  it('keeps Set disabled until text is typed, lowercases it, and saves it', async () => {
    const { onSetPasscode } = setup()
    openMenu()
    fireEvent.click(screen.getByRole('menuitemcheckbox'))
    const set = screen.getByRole('button', { name: 'Set' })
    expect(set).toBeDisabled()
    const input = screen.getByLabelText('Passcode') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'a' })
    fireEvent.change(input, { target: { value: '  SeCret ' } })
    expect(input.value).toBe('  secret ')
    expect(set).toBeEnabled()
    await act(async () => { fireEvent.submit(input.closest('form')!) })
    expect(onSetPasscode).toHaveBeenCalledWith('secret')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('keeps the menu open when the save is refused', async () => {
    const { onSetPasscode } = setup()
    onSetPasscode.mockResolvedValue(false)
    openMenu()
    fireEvent.click(screen.getByRole('menuitemcheckbox'))
    fireEvent.change(screen.getByLabelText('Passcode'), { target: { value: 'x' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Set' })) })
    expect(onSetPasscode).toHaveBeenCalledWith('x')
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByLabelText('Passcode')).toBeInTheDocument()
  })

  it('ignores a submit with nothing new to save', async () => {
    const { onSetPasscode } = setup({ hasPasscode: true, passcode: 'abc' })
    openMenu()
    const input = screen.getByLabelText('Passcode') as HTMLInputElement
    expect(input.value).toBe('abc')
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled()
    await act(async () => { fireEvent.submit(input.closest('form')!) })
    expect(onSetPasscode).not.toHaveBeenCalled()
  })

  it('updates a passcode and syncs the box when the prop changes', async () => {
    const { onSetPasscode, rerender } = setup({ hasPasscode: true, passcode: 'abc' })
    openMenu()
    expect(screen.getByText('Viewers need the passcode')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Passcode'), { target: { value: 'new' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Update' })) })
    expect(onSetPasscode).toHaveBeenCalledWith('new')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    rerender(<LockMenu hasPasscode passcode="zzz" onSetPasscode={onSetPasscode} isMobile={false} />)
    openMenu()
    expect((screen.getByLabelText('Passcode') as HTMLInputElement).value).toBe('zzz')
  })

  it('removes the passcode when Lock access is switched off', () => {
    const { onSetPasscode } = setup({ hasPasscode: true, passcode: 'abc' })
    openMenu()
    fireEvent.click(screen.getByRole('menuitemcheckbox'))
    expect(onSetPasscode).toHaveBeenCalledWith('')
  })

  it('masks and unmasks the passcode with the eye button', () => {
    setup({ hasPasscode: true, passcode: 'abc' })
    openMenu()
    fireEvent.click(screen.getByLabelText('Hide passcode'))
    expect(screen.getByLabelText('Show passcode')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Show passcode'))
    expect(screen.getByLabelText('Hide passcode')).toBeInTheDocument()
  })

  it('clamps the menu inside a narrow window', () => {
    window.innerWidth = 300
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 60, top: 0, bottom: 30, width: 50, height: 30, x: 10, y: 0, toJSON: () => ({}) })
    setup()
    openMenu()
    expect(screen.getByRole('menu')).toHaveStyle({ left: '8px', top: '40px' })
    window.innerWidth = 1024
  })

  it('clamps the menu to the right edge on a wide window', () => {
    window.innerWidth = 1000
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 960, right: 990, top: 0, bottom: 30, width: 30, height: 30, x: 960, y: 0, toJSON: () => ({}) })
    setup()
    openMenu()
    expect(screen.getByRole('menu')).toHaveStyle({ left: '650px' })
    window.innerWidth = 1024
  })
})
