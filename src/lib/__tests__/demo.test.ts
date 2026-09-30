import { describe, it, expect } from 'vitest'
import { DEMO_TAG, isDemo } from '../demo'

describe('isDemo', () => {
  it('is true only when the map carries the demo tag', () => {
    expect(isDemo([DEMO_TAG])).toBe(true)
    expect(isDemo(['Work', DEMO_TAG])).toBe(true)
    expect(isDemo(['Work'])).toBe(false)
    expect(isDemo([])).toBe(false)
    expect(isDemo(undefined)).toBe(false)
  })
})
