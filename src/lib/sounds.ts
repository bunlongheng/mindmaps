// Synthesized sound engine — Web Audio API, no files needed

let ctx: AudioContext | null = null
function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function gain(c: AudioContext, value: number, time = 0) {
  const g = c.createGain()
  g.gain.setValueAtTime(value, time || c.currentTime)
  g.connect(c.destination)
  return g
}

function osc(c: AudioContext, type: OscillatorType, freq: number, g: GainNode, start: number, end: number) {
  const o = c.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  o.connect(g)
  o.start(start)
  o.stop(end)
}

// ── Individual sounds ────────────────────────────────────────────────────────

/** Soft tick — hover */
export function soundHover() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.04)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06)
    osc(c, 'sine', 900, g, now, now + 0.06)
  } catch {}
}

/** Pop — node click / open */
export function soundClick() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    osc(c, 'sine', 440, g, now, now + 0.08)
  } catch {}
}

/** Rising chime — create */
export function soundCreate() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.15)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(440, now)
    o.frequency.linearRampToValueAtTime(880, now + 0.25)
    o.connect(g); o.start(now); o.stop(now + 0.35)
  } catch {}
}

/** Soft confirm — save / update */
export function soundSave() {
  try {
    const c = ac(); const now = c.currentTime
    ;[0, 0.08].forEach((offset, i) => {
      const g = gain(c, 0.1)
      g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.12)
      osc(c, 'sine', i === 0 ? 523 : 659, g, now + offset, now + offset + 0.12)
    })
  } catch {}
}

/** Swoosh down — delete */
export function soundDelete() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.14)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25)
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(400, now)
    o.frequency.exponentialRampToValueAtTime(80, now + 0.22)
    o.connect(g); o.start(now); o.stop(now + 0.25)
  } catch {}
}

/** Sparkle arp — favorite / star */
export function soundFavorite() {
  try {
    const c = ac(); const now = c.currentTime
    ;[523, 659, 784, 1047].forEach((freq, i) => {
      const g = gain(c, 0.1)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.12)
      osc(c, 'sine', freq, g, now + i * 0.07, now + i * 0.07 + 0.12)
    })
  } catch {}
}

/** Notification ding — incoming real-time event */
export function soundIncoming() {
  try {
    const c = ac(); const now = c.currentTime
    ;[784, 1047].forEach((freq, i) => {
      const g = gain(c, 0.12)
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.2)
      osc(c, 'sine', freq, g, now + i * 0.12, now + i * 0.12 + 0.2)
    })
  } catch {}
}

/** Bubble pop — paste / import */
export function soundPaste() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.13)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
    const o = c.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(800, now)
    o.frequency.exponentialRampToValueAtTime(300, now + 0.12)
    o.connect(g); o.start(now); o.stop(now + 0.15)
  } catch {}
}

/** Snap — copy to clipboard */
export function soundCopy() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.1)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07)
    osc(c, 'square', 1200, g, now, now + 0.07)
  } catch {}
}

/** Error buzz */
export function soundError() {
  try {
    const c = ac(); const now = c.currentTime
    const g = gain(c, 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
    const o = c.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(220, now)
    o.frequency.setValueAtTime(180, now + 0.1)
    o.connect(g); o.start(now); o.stop(now + 0.2)
  } catch {}
}
