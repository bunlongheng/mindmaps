export interface Theme {
  id: string
  label: string
  canvasBg: string
  colors: string[]
}

export const THEMES: Theme[] = [
  {
    id: 'default',
    label: 'Rainbow Light',
    canvasBg: '#ffffff',
    colors: [
      '#ef4444', '#f97316', '#f59e0b', '#eab308',
      '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
      '#ffffff', '#f1f5f9', '#94a3b8', '#475569',
      '#1e293b', '#1a1d2e', '#000000', '#fde68a',
    ],
  },
  {
    id: 'retro',
    label: 'Retro B&W',
    canvasBg: '#faf7f0',
    colors: [
      '#000000', '#1c1c1c', '#383838', '#555555',
      '#717171', '#8d8d8d', '#aaaaaa', '#c3c3c3',
      '#dadada', '#eeeeee', '#f7f7f7', '#ffffff',
      '#faf7f0', '#ede6d3', '#d5c9ad', '#bdb086',
      '#9e8f68', '#7f6e4b', '#5e4e2f', '#3d2f14',
    ],
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk Neon',
    canvasBg: '#080b1a',
    colors: [
      '#00ffe7', '#ff0090', '#7f00ff', '#ff6600',
      '#00ff41', '#ff003c', '#0066ff', '#ffdd00',
      '#ff00ff', '#00ccff', '#ff3300', '#33ff00',
      '#1a0533', '#0d1f33', '#001a33', '#330d1a',
      '#0a0f1f', '#1a1a2e', '#16213e', '#0f3460',
    ],
  },
  {
    id: 'monokai',
    label: 'Monokai',
    canvasBg: '#272822',
    colors: [
      '#f92672', '#fd971f', '#e6db74', '#a6e22e',
      '#66d9e8', '#ae81ff', '#f8f8f2', '#75715e',
      '#49483e', '#3e3d32', '#272822', '#1e1f1c',
      '#cc6633', '#819c00', '#0086b3', '#9b44ac',
      '#e0c04c', '#80a090', '#f4bf75', '#2d9ac2',
    ],
  },
]

export const THEME_MAP = Object.fromEntries(THEMES.map(t => [t.id, t]))

export function getTheme(id: string): Theme {
  return THEME_MAP[id] ?? THEMES[0]
}

// True when a hex background is dark enough to need light text on top of it.
export function isDarkBg(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}
