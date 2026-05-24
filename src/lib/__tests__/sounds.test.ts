import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// setup.ts defines `globalThis.AudioContext` as a NON-configurable,
// NON-writable property, so it cannot be replaced or stubbed. We instead patch
// its prototype to drive the branches in sounds.ts (suspended/resume + try/catch).
// The module caches a single ctx, so vi.resetModules() between tests forces a
// fresh `new AudioContext()` that picks up the current prototype patch.
const Ctor = (globalThis as unknown as { AudioContext: { prototype: Record<string, unknown> } }).AudioContext
const proto = Ctor.prototype
const originalDescriptors: Record<string, PropertyDescriptor | undefined> = {}

function patchProto(key: string, descriptor: PropertyDescriptor) {
  originalDescriptors[key] = Object.getOwnPropertyDescriptor(proto, key)
  Object.defineProperty(proto, key, { configurable: true, ...descriptor })
}

function restoreProto() {
  for (const [key, desc] of Object.entries(originalDescriptors)) {
    if (desc) Object.defineProperty(proto, key, desc)
    else delete proto[key]
  }
  for (const k of Object.keys(originalDescriptors)) delete originalDescriptors[k]
}

const sounds = [
  'soundHover',
  'soundClick',
  'soundCreate',
  'soundSave',
  'soundDelete',
  'soundIncoming',
  'soundPaste',
  'soundChaChing',
  'soundError',
] as const

describe('sounds', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    restoreProto()
  })

  it('every exported sound runs without throwing (running context)', async () => {
    const mod = await import('../sounds')
    for (const name of sounds) {
      expect(typeof mod[name]).toBe('function')
      expect(() => mod[name]()).not.toThrow()
    }
  })

  it('resumes a suspended AudioContext', async () => {
    const resume = vi.fn()
    patchProto('state', { get() { return 'suspended' } })
    patchProto('resume', { value: resume, writable: true })

    const mod = await import('../sounds')
    mod.soundCreate()
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('does NOT resume when context is running', async () => {
    const resume = vi.fn()
    patchProto('state', { get() { return 'running' } })
    patchProto('resume', { value: resume, writable: true })

    const mod = await import('../sounds')
    mod.soundClick()
    expect(resume).not.toHaveBeenCalled()
  })

  it('swallows errors thrown while building sounds (try/catch)', async () => {
    patchProto('createGain', { value: function () { throw new Error('no audio') }, writable: true })

    const mod = await import('../sounds')
    // Every sound builds a gain node first; the thrown error must be swallowed.
    for (const name of sounds) {
      expect(() => mod[name]()).not.toThrow()
    }
  })
})
