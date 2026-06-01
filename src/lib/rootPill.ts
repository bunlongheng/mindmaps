// Canonical sizing for the root "pill" (long-title root node).
//
// The pill width MUST be computed identically by the layout (child spacing +
// trunk origin), the canvas (the drawn pill), and the store (load-time reserve).
// When these drifted, the trunk line started inside the wider translucent pill
// and showed through it. Keep all callers on these helpers.

export const ROOT_PILL_MAX = 720
export const ROOT_PILL_PAD = 80
const CHAR_RATIO = 0.62

// A circle root grows to fit its title; once a fitting circle would exceed this
// diameter the title is too long for a circle and a pill is used instead.
export const ROOT_CIRCLE_MAX = 340
const ROOT_CIRCLE_PAD = 70

/** Diameter that fits the title inside a circle root, clamped to [180, ROOT_CIRCLE_MAX]. */
export function rootCircleDiameter(title: string, baseFontSize = 28): number {
  const len = Math.max(1, title.length)
  const natural = Math.ceil(len * baseFontSize * CHAR_RATIO + ROOT_CIRCLE_PAD)
  return Math.max(180, Math.min(ROOT_CIRCLE_MAX, natural))
}

/** True when a fitting circle would exceed ROOT_CIRCLE_MAX, so a pill is used instead. */
export function rootTitleNeedsPill(title: string, baseFontSize = 28): boolean {
  const len = Math.max(1, title.length)
  return Math.ceil(len * baseFontSize * CHAR_RATIO + ROOT_CIRCLE_PAD) > ROOT_CIRCLE_MAX
}

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
