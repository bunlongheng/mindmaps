import { describe, it, expect, afterEach } from 'vitest'
import { isLocal } from '../is-local'

function setHostname(host: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname: host },
    writable: true,
    configurable: true,
  })
}

describe('isLocal', () => {
  const original = window.location

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: original,
      writable: true,
      configurable: true,
    })
  })

  it('returns true for localhost', () => {
    setHostname('localhost')
    expect(isLocal()).toBe(true)
  })

  it('returns true for 127.0.0.1', () => {
    setHostname('127.0.0.1')
    expect(isLocal()).toBe(true)
  })

  it('returns true for 10.x private range', () => {
    setHostname('10.0.0.5')
    expect(isLocal()).toBe(true)
  })

  it('returns true for 192.168.x private range', () => {
    setHostname('192.168.1.42')
    expect(isLocal()).toBe(true)
  })

  it('returns true for *.localhost hosts', () => {
    setHostname('app.localhost')
    expect(isLocal()).toBe(true)
  })

  it('returns false for public domains', () => {
    setHostname('mindmaps.bunlongheng.com')
    expect(isLocal()).toBe(false)
  })

  it('returns false for unrelated IPs', () => {
    setHostname('45.79.212.154')
    expect(isLocal()).toBe(false)
  })
})
