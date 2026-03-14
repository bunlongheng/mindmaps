import * as LucideIcons from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ICON_MAP } from '../../lib/icons'

/** Convert kebab-case icon name to PascalCase Lucide component name */
function toPascal(name: string): string {
  return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

/** Resolve any Lucide icon by name — checks our ICON_MAP first, then dynamic lookup */
export function getLucideIcon(name: string): LucideIcon | undefined {
  return ICON_MAP[name] ?? (LucideIcons as Record<string, unknown>)[toPascal(name)] as LucideIcon | undefined
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
