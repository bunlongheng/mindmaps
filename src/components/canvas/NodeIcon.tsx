import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import * as HeroOutline from '@heroicons/react/24/outline'
import { ICON_MAP } from '../../lib/icons'

/** Convert kebab-case icon name to PascalCase component name */
function toPascal(name: string): string {
  return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

/** Resolve any icon by name — tries our map, then any Lucide icon, then any Heroicons outline icon */
export function getLucideIcon(name: string): LucideIcon | undefined {
  if (!name) return undefined
  // 1. Curated ICON_MAP (fastest)
  if (ICON_MAP[name]) return ICON_MAP[name]
  // 2. Any Lucide icon by PascalCase name
  const lucide = (LucideIcons as Record<string, unknown>)[toPascal(name)] as LucideIcon | undefined
  if (lucide) return lucide
  // 3. Heroicons outline — name + 'Icon' suffix (e.g. 'academic-cap' → 'AcademicCapIcon')
  const hero = (HeroOutline as Record<string, unknown>)[toPascal(name) + 'Icon'] as LucideIcon | undefined
  return hero
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
