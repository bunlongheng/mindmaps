import { describe, it, expect } from 'vitest'
import { THEMES, getTheme } from '../themes'

describe('THEMES', () => {
  it('has at least 4 themes', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(4)
  })

  it('each theme has required fields', () => {
    for (const t of THEMES) {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.canvasBg).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t.colors.length).toBe(20)
    }
  })

  it('all colors are valid hex', () => {
    for (const t of THEMES) {
      for (const c of t.colors) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })
})

describe('getTheme', () => {
  it('returns correct theme by id', () => {
    expect(getTheme('retro').label).toBe('Retro B&W')
    expect(getTheme('cyberpunk').label).toBe('Cyberpunk Neon')
  })

  it('returns default for unknown id', () => {
    expect(getTheme('nonexistent').id).toBe('default')
  })

  it('returns default for empty string', () => {
    expect(getTheme('').id).toBe('default')
  })
})
