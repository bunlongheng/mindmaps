import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { NodeIcon, getLucideIcon } from '../NodeIcon'

afterEach(cleanup)

describe('getLucideIcon', () => {
  it('returns undefined for an empty name', () => {
    expect(getLucideIcon('')).toBeUndefined()
  })

  it('resolves a curated ICON_MAP name (kebab-case)', () => {
    expect(getLucideIcon('git-branch')).toBeTruthy()
  })

  it('resolves a curated single-word name', () => {
    expect(getLucideIcon('bot')).toBeTruthy()
  })

  it('falls back to any Lucide icon by PascalCase conversion', () => {
    // Not in ICON_MAP but a valid Lucide icon name
    const icon = getLucideIcon('anchor')
    expect(icon).toBeTruthy()
  })

  it('falls back to a Heroicons outline icon (name + Icon suffix)', () => {
    // 'academic-cap' is not in ICON_MAP nor a Lucide name, but is a Heroicon
    const icon = getLucideIcon('academic-cap')
    expect(icon).toBeTruthy()
  })

  it('returns undefined for a completely unknown name', () => {
    expect(getLucideIcon('totally-not-a-real-icon-xyz')).toBeUndefined()
  })
})

describe('NodeIcon', () => {
  it('renders a foreignObject with the resolved icon for a known name', () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="bot" x={5} y={10} size={24} color="#ff0000" />
      </svg>
    )
    const fo = container.querySelector('foreignObject')
    expect(fo).toBeTruthy()
    expect(fo?.getAttribute('x')).toBe('5')
    expect(fo?.getAttribute('y')).toBe('10')
    expect(fo?.getAttribute('width')).toBe('24')
    expect(fo?.getAttribute('height')).toBe('24')
    // the lucide icon renders an inner svg
    expect(fo?.querySelector('svg')).toBeTruthy()
  })

  it('renders nothing for an unknown icon name', () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="no-such-icon-xyz" x={0} y={0} size={20} color="#000" />
      </svg>
    )
    expect(container.querySelector('foreignObject')).toBeNull()
  })

  it('accepts a custom strokeWidth without error', () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="zap" x={0} y={0} size={18} color="#00f" strokeWidth={3} />
      </svg>
    )
    expect(container.querySelector('foreignObject')).toBeTruthy()
  })

  it('renders an empty-name icon as null', () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="" x={0} y={0} size={16} color="#000" />
      </svg>
    )
    expect(container.querySelector('foreignObject')).toBeNull()
  })
})
