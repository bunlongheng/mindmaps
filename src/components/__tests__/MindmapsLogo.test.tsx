import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MindmapsLogo } from '../MindmapsLogo'

afterEach(cleanup)

describe('MindmapsLogo', () => {
  it('renders the icon image at the default size of 32', () => {
    const { container } = render(<MindmapsLogo />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('width')).toBe('32')
    expect(img?.getAttribute('height')).toBe('32')
    expect(img?.getAttribute('alt')).toBe('Mindmaps')
  })

  it('renders with a custom size', () => {
    const { container } = render(<MindmapsLogo size={64} />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('width')).toBe('64')
    expect(img?.getAttribute('height')).toBe('64')
  })

  it('points at the generated PWA icon', () => {
    const { container } = render(<MindmapsLogo size={48} />)
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/icons/')
  })
})
