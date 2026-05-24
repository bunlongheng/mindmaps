import '@testing-library/jest-dom/vitest'

// Mock localStorage
const store: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  },
})

// Mock AudioContext for sounds
class MockAudioContext {
  createOscillator() { return { type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} } }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
  get destination() { return {} }
  get currentTime() { return 0 }
}
Object.defineProperty(globalThis, 'AudioContext', { value: MockAudioContext })
Object.defineProperty(globalThis, 'webkitAudioContext', { value: MockAudioContext })

// ── Common DOM/SVG mocks jsdom lacks (needed for component tests) ──────────────
class MockObserver {
  observe() {} unobserve() {} disconnect() {} takeRecords() { return [] }
}
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockObserver
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockObserver

if (!window.matchMedia) {
  window.matchMedia = (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false },
  }) as unknown as MediaQueryList
}

// SVG geometry stubs (jsdom returns 0/throws otherwise)
if (typeof SVGElement !== 'undefined') {
  ;(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox =
    () => ({ x: 0, y: 0, width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40, toJSON() {} } as DOMRect)
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

// Stable randomUUID for deterministic tests
if (!globalThis.crypto) (globalThis as unknown as { crypto: Crypto }).crypto = {} as Crypto
if (!globalThis.crypto.randomUUID) {
  let n = 0
  ;(globalThis.crypto as unknown as { randomUUID: () => string }).randomUUID =
    () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
}

// Object URL stubs for export paths
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:mock'
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}
