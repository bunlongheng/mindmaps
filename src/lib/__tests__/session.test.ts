import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readSession, saveSession, clearSession, endSession, tokenExpiry, SESSION_EXPIRED } from '../session'

const USER = { email: 'owner@example.com', name: 'Owner', userId: 'u1' }

/** Storage keys by index - Object.keys(localStorage) is empty in jsdom. */
function lsKeys(): string[] {
  return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort()
}

function token(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ sub: 'u1', exp: expSeconds })).replace(/\+/g, '-').replace(/\//g, '_')
  return `header.${payload}.signature`
}

const future = () => token(Math.floor(Date.now() / 1000) + 3600)
const past = () => token(Math.floor(Date.now() / 1000) - 3600)

describe('tokenExpiry', () => {
  it('reads exp out of a token', () => {
    expect(tokenExpiry(token(1800000000))).toBe(1800000000)
  })

  it('returns null for anything it cannot read', () => {
    expect(tokenExpiry('')).toBeNull()
    expect(tokenExpiry('not-a-jwt')).toBeNull()
    expect(tokenExpiry('header.@@@.sig')).toBeNull()
    expect(tokenExpiry(`header.${btoa('{"sub":"u1"}')}.sig`)).toBeNull()
  })
})

describe('readSession', () => {
  beforeEach(() => localStorage.clear())

  it('returns the user while the token is still alive', () => {
    saveSession(USER, future())
    expect(readSession()).toEqual(USER)
  })

  it('rejects an expired token and clears what it found', () => {
    saveSession(USER, past())
    expect(readSession()).toBeNull()
    expect(localStorage.getItem('mindmaps:user')).toBeNull()
    expect(localStorage.getItem('mindmaps:token')).toBeNull()
  })

  it('rejects a cached user with no token at all', () => {
    localStorage.setItem('mindmaps:user', JSON.stringify(USER))
    expect(readSession()).toBeNull()
    expect(localStorage.getItem('mindmaps:user')).toBeNull()
  })

  it('rejects a token whose expiry cannot be read', () => {
    saveSession(USER, 'garbage')
    expect(readSession()).toBeNull()
  })

  it('rejects a corrupt or identity-less user record', () => {
    localStorage.setItem('mindmaps:user', '{oops')
    localStorage.setItem('mindmaps:token', future())
    expect(readSession()).toBeNull()

    localStorage.setItem('mindmaps:user', JSON.stringify({ email: 'x@y.z' }))
    localStorage.setItem('mindmaps:token', future())
    expect(readSession()).toBeNull()
  })

  it('returns null on an empty store without touching it', () => {
    expect(readSession()).toBeNull()
  })
})

describe('clearSession', () => {
  beforeEach(() => localStorage.clear())

  it('takes the cached library and thumbnails with it', () => {
    saveSession(USER, future())
    localStorage.setItem('mindmaps:list', '[{"id":"a"}]')
    localStorage.setItem('mindmaps:diagram:a', '{"id":"a"}')
    localStorage.setItem('mindmaps:thumb:a', 'data:image/png;base64,AAA')
    localStorage.setItem('mindmaps:viewMode', 'grid')

    clearSession()

    expect(lsKeys().filter(k => k.startsWith('mindmaps:'))).toEqual(['mindmaps:viewMode'])
  })
})

describe('endSession', () => {
  beforeEach(() => localStorage.clear())

  it('clears the session and announces it', () => {
    saveSession(USER, future())
    const heard = vi.fn()
    window.addEventListener(SESSION_EXPIRED, heard)

    endSession()

    expect(heard).toHaveBeenCalledTimes(1)
    expect(readSession()).toBeNull()
    window.removeEventListener(SESSION_EXPIRED, heard)
  })
})
