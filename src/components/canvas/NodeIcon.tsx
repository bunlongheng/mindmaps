import { ICON_MAP } from '../../lib/icons'

interface NodeIconProps {
  icon: string
  x: number
  y: number
  size: number
  color: string
  strokeWidth?: number
}

export function NodeIcon({ icon, x, y, size, color, strokeWidth = 1.8 }: NodeIconProps) {
  const Icon = ICON_MAP[icon]
  if (!Icon) return null
  return (
    <foreignObject x={x} y={y} width={size} height={size} style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <Icon color={color} size={size} strokeWidth={strokeWidth} style={{ display: 'block' }} />
    </foreignObject>
  )
}
