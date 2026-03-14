import { ICON_MAP } from '../../lib/icons'

interface NodeIconProps {
  icon: string
  x: number
  y: number
  size: number
  color: string
}

export function NodeIcon({ icon, x, y, size, color }: NodeIconProps) {
  const Icon = ICON_MAP[icon]
  if (!Icon) return null
  return (
    <foreignObject x={x} y={y} width={size} height={size} style={{ pointerEvents: 'none', overflow: 'visible' }}>
      <Icon style={{ width: size, height: size, color, display: 'block', strokeWidth: 1.8 }} />
    </foreignObject>
  )
}
