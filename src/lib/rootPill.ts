// Canonical sizing for the root "pill" (long-title root node).
//
// The pill width MUST be computed identically by the layout (child spacing +
// trunk origin), the canvas (the drawn pill), and the store (load-time reserve).
// When these drifted, the trunk line started inside the wider translucent pill
// and showed through it. Keep all callers on these helpers.

export const ROOT_PILL_MAX = 720
export const ROOT_PILL_PAD = 80
const CHAR_RATIO = 0.62

/** Font size for the root pill: full size until the title would exceed the max
 *  width, then shrink (floor 15px) so the title always fits inside the pill. */
export function rootPillFontSize(title: string, baseFontSize = 28): number {
  const len = Math.max(1, title.length)
  const naturalW = Math.ceil(len * baseFontSize * CHAR_RATIO + ROOT_PILL_PAD)
  return naturalW > ROOT_PILL_MAX
    ? Math.max(15, Math.floor((ROOT_PILL_MAX - ROOT_PILL_PAD) / (len * CHAR_RATIO)))
    : baseFontSize
}

/** Pill width that exactly fits the title at its (possibly shrunk) font, clamped
 *  to [180, ROOT_PILL_MAX]. */
export function rootPillWidth(title: string, baseFontSize = 28): number {
  const len = Math.max(1, title.length)
  const fs = rootPillFontSize(title, baseFontSize)
  return Math.max(180, Math.min(ROOT_PILL_MAX, Math.ceil(len * fs * CHAR_RATIO + ROOT_PILL_PAD)))
}
