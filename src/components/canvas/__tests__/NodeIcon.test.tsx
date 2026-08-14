import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import * as Lucide from 'lucide-react'
import * as HeroOutline from '@heroicons/react/24/outline'
import { NodeIcon, getLucideIcon } from '../NodeIcon'
import { LUCIDE_FALLBACK_STEMS, LUCIDE_FALLBACK_ALIASES, HERO_FALLBACK_NAMES } from '../../../lib/icons'
import { LUCIDE_LAZY, HERO_LAZY } from '../../../lib/icons.lazy'

/** PascalCase to kebab-case, same shape the app stores icon names in */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

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

  it('renders a non-curated Lucide icon via the lazy chunk', async () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="anchor" x={0} y={0} size={20} color="#000" />
      </svg>
    )
    await waitFor(() => expect(container.querySelector('foreignObject svg')).toBeTruthy())
  })

  it('renders a legacy Lucide alias name via the lazy chunk', async () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="bar-chart-2" x={0} y={0} size={20} color="#000" />
      </svg>
    )
    await waitFor(() => expect(container.querySelector('foreignObject svg')).toBeTruthy())
  })

  it('renders a Heroicons outline icon via the lazy chunk', async () => {
    const { container } = render(
      <svg>
        <NodeIcon icon="academic-cap" x={0} y={0} size={20} color="#000" />
      </svg>
    )
    await waitFor(() => expect(container.querySelector('foreignObject svg')).toBeTruthy())
  })
})

describe('fallback registry stays in sync with the installed packages', () => {
  const NON_ICON_EXPORTS = new Set(['icons', 'createLucideIcon', 'Icon'])

  it('resolves every lucide-react export by kebab-case name', () => {
    const missing: string[] = []
    for (const name of Object.keys(Lucide)) {
      if (NON_ICON_EXPORTS.has(name) || !/^[A-Z]/.test(name)) continue
      if (!getLucideIcon(kebab(name))) missing.push(name)
    }
    expect(missing).toEqual([])
  })

  it('resolves every @heroicons outline export by kebab-case name', () => {
    const missing: string[] = []
    for (const name of Object.keys(HeroOutline)) {
      if (!name.endsWith('Icon')) continue
      if (!getLucideIcon(kebab(name.slice(0, -4)))) missing.push(name)
    }
    expect(missing).toEqual([])
  })

  it('lazy registry has a component for every registered name', () => {
    for (const stem of LUCIDE_FALLBACK_STEMS) {
      expect(LUCIDE_LAZY[stem], `lucide stem ${stem}`).toBeTruthy()
    }
    for (const stem of Object.values(LUCIDE_FALLBACK_ALIASES)) {
      expect(LUCIDE_LAZY[stem], `lucide alias target ${stem}`).toBeTruthy()
    }
    for (const name of HERO_FALLBACK_NAMES) {
      const key = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Icon'
      expect(HERO_LAZY[key], `hero ${name} -> ${key}`).toBeTruthy()
    }
  })
})
