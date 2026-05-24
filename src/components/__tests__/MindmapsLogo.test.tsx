import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MindmapsLogo } from '../MindmapsLogo'

afterEach(cleanup)

describe('MindmapsLogo', () => {
  it('renders an svg with the default size of 32', () => {
    const { container } = render(<MindmapsLogo />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('width')).toBe('32')
    expect(svg?.getAttribute('height')).toBe('32')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 32 36')
  })

  it('renders with a custom size', () => {
    const { container } = render(<MindmapsLogo size={64} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('64')
    expect(svg?.getAttribute('height')).toBe('64')
  })

  it('contains all gradient defs and the five shapes', () => {
    const { container } = render(<MindmapsLogo size={48} />)
    expect(container.querySelectorAll('radialGradient').length).toBe(4)
    expect(container.querySelectorAll('linearGradient').length).toBe(1)
    expect(container.querySelectorAll('rect').length).toBe(3)
    expect(container.querySelector('circle')).toBeTruthy()
    expect(container.querySelector('path')).toBeTruthy()
  })
})
