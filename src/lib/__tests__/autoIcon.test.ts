import { describe, it, expect } from 'vitest'
import { guessIcon, resolveIcon } from '../autoIcon'

describe('guessIcon', () => {
  it('matches people keywords', () => {
    expect(guessIcon('Alice goes to school')).toBe('user')
    expect(guessIcon('Bob and Carol')).toBe('user')
  })

  it('matches home keywords', () => {
    expect(guessIcon('Arrive home')).toBe('home')
  })

  it('matches food keywords', () => {
    expect(guessIcon('Eat breakfast')).toBe('gift')
  })

  it('matches time keywords', () => {
    expect(guessIcon('Morning routine')).toBe('activity')
    expect(guessIcon('Set a timer')).toBe('clock')
  })

  it('returns undefined for no match', () => {
    expect(guessIcon('xyzzy foobar')).toBeUndefined()
  })

  it('is case insensitive', () => {
    expect(guessIcon('HOME SWEET HOME')).toBe('home')
  })
})

describe('resolveIcon', () => {
  it('resolves aliases', () => {
    expect(resolveIcon('calendar-days')).toBe('calendar')
    expect(resolveIcon('alarm-clock')).toBe('clock')
    expect(resolveIcon('users')).toBe('user')
  })

  it('resolves direct alias before numeric-suffix stripping', () => {
    // "gamepad-2" is itself a key in ALIASES (line 129 returns first)
    expect(resolveIcon('gamepad-2')).toBe('smile')
  })

  it('strips numeric suffix and resolves the base alias', () => {
    // "timer-2" is NOT a key, but base "timer" IS in ALIASES → resolves (covers line 132 return)
    expect(resolveIcon('timer-2')).toBe('clock')
  })

  it('passes through numeric-suffix names whose base is not an alias', () => {
    // base "rocket" is not in ALIASES → falls through to pass-through (line 132 false branch)
    expect(resolveIcon('rocket-2')).toBe('rocket-2')
  })

  it('passes through unknown names', () => {
    expect(resolveIcon('rocket')).toBe('rocket')
  })

  it('returns undefined for empty/undefined', () => {
    expect(resolveIcon(undefined)).toBeUndefined()
    expect(resolveIcon('')).toBeUndefined()
  })
})
