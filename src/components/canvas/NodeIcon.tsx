/* eslint-disable react-refresh/only-export-components, react-hooks/static-components -- dynamic icon component chosen at runtime */
import { Suspense, lazy } from 'react'
import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ICON_MAP,
  LUCIDE_FALLBACK_STEMS,
  LUCIDE_FALLBACK_ALIASES,
  HERO_FALLBACK_NAMES,
} from '../../lib/icons'

/** Convert kebab-case icon name to PascalCase component name */
function toPascal(name: string): string {
  return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

/** PascalCase/camelCase to kebab-case (e.g. 'GitBranch' -> 'git-branch') */
function toKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

type FallbackRef = { source: 'lucide' | 'hero'; key: string }

/**
 * Resolve a kebab-case name against the generated fallback registries.
 * Mirrors the old namespace lookup order: any lucide export first (canonical
 * stems, legacy aliases, and the barrel's 'lucide-' / '-icon' affix exports),
 * then heroicons outline (name + 'Icon' suffix).
 */
function resolveFallback(name: string): FallbackRef | undefined {
  const candidates = [name]
  if (name.startsWith('lucide-')) candidates.push(name.slice(7))
  if (name.endsWith('-icon')) candidates.push(name.slice(0, -5))
  for (const c of candidates) {
    if (LUCIDE_FALLBACK_STEMS.has(c)) return { source: 'lucide', key: c }
    const stem = LUCIDE_FALLBACK_ALIASES[c]
    if (stem) return { source: 'lucide', key: stem }
  }
  if (HERO_FALLBACK_NAMES.has(name)) return { source: 'hero', key: toPascal(name) + 'Icon' }
  return undefined
}

const NullIcon = (() => null) as unknown as LucideIcon
const fallbackCache = new Map<string, LucideIcon>()

/**
 * Wrap a fallback icon in a lazily-loaded component. The heavy icon sets live
 * in src/lib/icons.lazy.ts, which Vite splits into its own async chunk —
 * it only downloads the first time a non-curated icon actually renders.
 */
function lazyFallbackIcon(ref: FallbackRef): LucideIcon {
  const cacheKey = `${ref.source}:${ref.key}`
  const cached = fallbackCache.get(cacheKey)
  if (cached) return cached
  const Inner = lazy(async () => {
    const m = await import('../../lib/icons.lazy')
    const Icon = ref.source === 'lucide' ? m.LUCIDE_LAZY[ref.key] : m.HERO_LAZY[ref.key]
    return { default: (Icon ?? NullIcon) as LucideIcon }
  })
  const Wrapper = ((props: ComponentProps<LucideIcon>) => (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  )) as unknown as LucideIcon
  fallbackCache.set(cacheKey, Wrapper)
  return Wrapper
}

/** Resolve any icon by name — tries our map, then any Lucide icon, then any Heroicons outline icon */
export function getLucideIcon(name: string): LucideIcon | undefined {
  if (!name) return undefined
  // 1. Curated ICON_MAP (fastest, statically bundled)
  if (ICON_MAP[name]) return ICON_MAP[name]
  // 2. Any Lucide icon, then any Heroicons outline icon (lazy async chunk)
  let ref = resolveFallback(name)
  if (!ref && /[A-Z]/.test(name)) {
    // PascalCase/camelCase input (e.g. 'GitBranch') — normalize and retry
    const kebab = toKebab(name)
    if (ICON_MAP[kebab]) return ICON_MAP[kebab]
    ref = resolveFallback(kebab)
  }
  return ref ? lazyFallbackIcon(ref) : undefined
}

interface NodeIconProps {
  icon: string
  x: number
  y: number
  size: number
  color: string
  strokeWidth?: number
}

export function NodeIcon({ icon, x, y, size, color, strokeWidth = 1.8 }: NodeIconProps) {
  const Icon = getLucideIcon(icon)
  if (!Icon) return null
  return (
    <foreignObject x={x} y={y} width={size} height={size} style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <Icon color={color} size={size} strokeWidth={strokeWidth} style={{ display: 'block' }} />
    </foreignObject>
  )
}
