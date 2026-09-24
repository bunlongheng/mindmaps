import { L1_PALETTE } from './color.js'

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
    // First 12 are the branch wheel (rebalanceColors uses colors.slice(0, 12)) - kept
    // identical to L1_PALETTE in color.ts so this theme's swatches and initial branch
    // assignment match what the canvas actually renders (the canvas always resolves L1
    // colour from L1_PALETTE by sortOrder, regardless of theme). The trailing 8 are
    // neutrals for backgrounds/root picks and are unchanged.
    colors: [
      ...L1_PALETTE,
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
