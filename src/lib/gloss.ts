// Shared "gloss" overlay: a soft highlight across the top of a box that reads as a
// slightly domed surface, without changing the base fill or text contrast. Only the
// root, depth-1 and depth-2 boxes carry it - depth 3+ are already pale, so a gloss
// would be lost in the fill. Both renderers draw from these exact numbers so the
// canvas (DiagramCanvas.tsx defines the gradients once, Node.tsx references them)
// and the server renderer (render-svg.ts) show the same sheen on a card preview and
// the opened map alike. Feel matched to the Sequences app's boxOverlay:"gloss"
// (lib/svg-renderer.ts): a top-heavy white gradient fading out by mid-box.

/** Stable ids - defined once per render, referenced by every eligible box. */
export const GLOSS_LINEAR_ID = 'node-gloss-linear'
export const GLOSS_RADIAL_ID = 'node-gloss-radial'

/** Radial center offset toward the top-left, for circle nodes (root circle, radial
 *  mind map circles, explicit circle-shaped boxes). */
export const GLOSS_RADIAL_CX = '32%'
export const GLOSS_RADIAL_CY = '28%'
export const GLOSS_RADIAL_R = '75%'

// One gradient definition carries the strong (dark-background) stops; a light-fill
// box scales the whole thing down via fill-opacity (GLOSS_LIGHT_SCALE) rather than
// a second gradient, so there is exactly one linear and one radial gloss gradient
// per render regardless of how many boxes use it.
const GLOSS_TOP_OPACITY = 0.34
const GLOSS_LIGHT_TOP_OPACITY = 0.28
const GLOSS_MID_OPACITY = 0.06
const GLOSS_MID_OFFSET = '45%'
const GLOSS_END_OFFSET = '55%'

export const GLOSS_STOPS: ReadonlyArray<{ offset: string; opacity: number }> = [
  { offset: '0%', opacity: GLOSS_TOP_OPACITY },
  { offset: GLOSS_MID_OFFSET, opacity: GLOSS_MID_OPACITY },
  { offset: GLOSS_END_OFFSET, opacity: 0 },
]

/** Root, depth-1 and depth-2 carry the gloss; depth 3+ are pale, so it would vanish. */
export function glossApplies(depth: number): boolean {
  return depth <= 2
}

/** fill-opacity for the overlay: full strength (0.34 top stop) on a dark-background
 *  box, scaled down to the softer 0.28 top stop on a light-background one. */
export function glossOpacity(bgIsLight: boolean): number {
  return bgIsLight ? Math.round((GLOSS_LIGHT_TOP_OPACITY / GLOSS_TOP_OPACITY) * 1000) / 1000 : 1
}

/** Raw <defs> markup for the server renderer (resvg-safe primitives only). */
export function glossDefsSvg(): string {
  const stops = GLOSS_STOPS.map(s => `<stop offset="${s.offset}" stop-color="#ffffff" stop-opacity="${s.opacity}"/>`).join('')
  return (
    `<linearGradient id="${GLOSS_LINEAR_ID}" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">${stops}</linearGradient>` +
    `<radialGradient id="${GLOSS_RADIAL_ID}" cx="${GLOSS_RADIAL_CX}" cy="${GLOSS_RADIAL_CY}" r="${GLOSS_RADIAL_R}" gradientUnits="objectBoundingBox">${stops}</radialGradient>`
  )
}
