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
  if (!el) return 0
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0

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
