// A deleted card comes apart into dust: a couple of hundred specks, none bigger
// than two pixels, thrown in their own directions and gone in four seconds.
// Nothing here is a picture of what was deleted, only the fact that it left.
//
// Ported from the drops board. Same physics and palette; driven by the Web
// Animations API rather than CSS keyframes so it stays self-contained.

const MAX_SPECKS = 240
const AREA_PER_SPECK = 420
const LIFETIME_MS = 4000

/** A third of the specks never cool - they stay ember all the way out. */
function emberKeyframes(dx: number, dy: number): Keyframe[] {
  return [
    { transform: 'none', opacity: 0, background: '#ff5c47', boxShadow: '0 0 5px rgba(255,92,71,1)' },
    { opacity: 1, offset: 0.1 },
    { transform: `translate(${dx}px, ${dy}px)`, opacity: 0, background: '#ff7a63', boxShadow: '0 0 4px rgba(255,92,71,.8)' },
  ]
}

/** The card blinked red, so the dust leaves red and cools to white on its way out. */
function ashKeyframes(dx: number, dy: number): Keyframe[] {
  return [
    { transform: 'none', opacity: 0, background: '#ff5c47', boxShadow: '0 0 4px rgba(255,92,71,.95)' },
    { opacity: 1, offset: 0.1 },
    { background: '#ffb4a8', boxShadow: '0 0 4px rgba(255,150,130,.75)', offset: 0.4 },
    { transform: `translate(${dx}px, ${dy}px)`, opacity: 0, background: '#fff', boxShadow: '0 0 3px rgba(255,255,255,.6)' },
  ]
}

/**
 * Scatter `el` into embers. Returns how long the effect runs so a caller can
 * let it play before the element goes; resolves immediately when the element
 * has no box or the viewer asked for less motion.
 */
export function emberVanish(el: Element | null): number {
  if (!el || !stillMoves()) return 0

  const box = el.getBoundingClientRect()
  if (!box.width || !box.height) return 0

  const field = document.createElement('div')
  field.setAttribute('aria-hidden', 'true')
  field.style.cssText =
    `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;` +
    'z-index:70;pointer-events:none'

  const rand = (n: number) => (Math.random() * 2 - 1) * n
  const specks = Math.min(MAX_SPECKS, Math.round((box.width * box.height) / AREA_PER_SPECK))

  for (let n = 0; n < specks; n++) {
    const bit = document.createElement('i')
    const size = Math.random() < 0.65 ? 1 : 2
    bit.style.cssText =
      `position:absolute;display:block;border-radius:50%;will-change:transform,opacity;` +
      `left:${Math.random() * box.width}px;top:${Math.random() * box.height}px;` +
      `width:${size}px;height:${size}px`
    const dx = rand(190)
    const dy = -30 - Math.random() * 260
    bit.animate(Math.random() < 0.34 ? emberKeyframes(dx, dy) : ashKeyframes(dx, dy), {
      duration: (2.2 + Math.random() * 1.2) * 1000,
      delay: Math.random() * 600,
      easing: 'cubic-bezier(.16,.62,.32,1)',
      fill: 'both',
    })
    field.append(bit)
  }

  document.body.append(field)
  setTimeout(() => field.remove(), LIFETIME_MS)
  return LIFETIME_MS
}

// ── What happens before the dust ────────────────────────────────────────────

const BLINK_MS = 300
const BLINKS = 2
/** Blinks, plus the beat drops leaves before the card comes apart. */
export const DOOMED_MS = BLINK_MS * BLINKS + 20

const RED = '#ef4444'
const RED_WASH = 'rgba(239,68,68,0.16)'

function stillMoves(): boolean {
  // No Web Animations API (very old browsers, jsdom) means no effect to play -
  // deletion must still work, just without the show.
  if (typeof Element.prototype.animate !== 'function') return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Two hard red blinks on the thing that is about to go - the drops board's
 * `.going` state. Hard on/off, never a fade: it reads as an alarm, not a
 * transition. Returns how long to wait before scattering it.
 */
export function blinkDoomed(el: Element | null): number {
  if (!el || !stillMoves()) return 0
  const style = getComputedStyle(el)
  const base: Keyframe = { borderColor: style.borderTopColor, background: style.backgroundColor }
  const hit: Keyframe = { borderColor: RED, background: RED_WASH }
  el.animate(
    [{ ...hit, offset: 0 }, { ...hit, offset: 0.499 }, { ...base, offset: 0.5 }, { ...base, offset: 1 }],
    { duration: BLINK_MS, iterations: BLINKS, easing: 'linear', fill: 'none' },
  )
  return DOOMED_MS
}

/**
 * The map view has no card to blink, so the screen takes the hit instead: a red
 * vignette that punches twice from the edges, the way an FPS tells you that you
 * were shot. The canvas comes apart behind it.
 */
export function damageFlash(): number {
  if (!stillMoves()) return 0
  const skin = document.createElement('div')
  skin.setAttribute('aria-hidden', 'true')
  skin.style.cssText =
    'position:fixed;inset:0;z-index:69;pointer-events:none;' +
    'background:radial-gradient(ellipse at center, rgba(239,68,68,0) 38%, rgba(239,68,68,0.55) 100%)'
  document.body.append(skin)
  skin.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.08 },
      { opacity: 0.15, offset: 0.34 },
      { opacity: 0.9, offset: 0.5 },
      { opacity: 0, offset: 1 },
    ],
    { duration: 520, easing: 'ease-out', fill: 'both' },
  )
  setTimeout(() => skin.remove(), 600)
  return 300
}
