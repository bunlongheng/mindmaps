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

  it('strips numeric suffix and checks alias', () => {
    expect(resolveIcon('gamepad-2')).toBe('smile')
  })

  it('passes through unknown names', () => {
    expect(resolveIcon('rocket')).toBe('rocket')
  })

  it('returns undefined for empty/undefined', () => {
    expect(resolveIcon(undefined)).toBeUndefined()
    expect(resolveIcon('')).toBeUndefined()
  })
})
