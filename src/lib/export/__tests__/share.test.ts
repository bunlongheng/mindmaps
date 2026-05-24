import { describe, it, expect, afterEach } from 'vitest'
import { encodeShareURL, decodeShareURL } from '../share'
import type { Diagram, MindmapNode } from '../../../types'

const root: MindmapNode = {
  id: 'root', title: 'Root', color: '#000', parentId: null,
  depth: 0, x: 0, y: 0, width: 180, height: 180,
}

function makeDiagram(): Diagram {
  return {
    id: 'share-id', name: 'Shared Map', type: 'mindmap', lineStyle: 'curved',
    nodes: [root], createdAt: '2024-01-01', updatedAt: '2024-01-02',
  }
}

function setLocation(origin: string, search: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, origin, search },
    writable: true,
    configurable: true,
  })
}

describe('share encode/decode', () => {
  const original = window.location

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: original,
      writable: true,
      configurable: true,
    })
  })

  it('encodes a diagram into a ?d= base64 URL on the current origin', () => {
    setLocation('https://example.com', '')
    const url = encodeShareURL(makeDiagram())
    expect(url.startsWith('https://example.com?d=')).toBe(true)
  })

  it('round-trips: decode(encode(diagram)) equals the diagram (ASCII)', () => {
    const diagram = makeDiagram()
    // encodeShareURL now produces a fully URL-encoded link; feed its real search.
    const url = encodeShareURL(diagram)
    setLocation('https://example.com', url.slice(url.indexOf('?')))
    expect(decodeShareURL()).toEqual(diagram)
  })

  it('round-trips diagrams containing unicode/emoji', () => {
    const diagram = makeDiagram()
    diagram.name = '日本語 Map 🚀'
    diagram.nodes[0].title = 'émoji ✨ café'
    const url = encodeShareURL(diagram)
    setLocation('https://example.com', url.slice(url.indexOf('?')))
    expect(decodeShareURL()).toEqual(diagram)
  })

  it('url-encodes base64 so a "+" in the payload survives the round-trip', () => {
    // Regression for the fixed bug: encodeShareURL now percent-encodes the base64,
    // so a raw "+" (which URLSearchParams would turn into a space) never appears in
    // the URL and the round-trip succeeds instead of returning null.
    const diagram = makeDiagram()
    diagram.name = '日本語 Map 🚀'
    diagram.nodes[0].title = 'émoji ✨ café'
    const url = encodeShareURL(diagram)
    const rawSearch = url.slice(url.indexOf('?'))
    expect(rawSearch).not.toContain('+')        // '+' is encoded as %2B, not raw
    setLocation('https://example.com', rawSearch)
    expect(decodeShareURL()).toEqual(diagram)   // round-trip works now
  })

  it('returns null when no ?d= param is present', () => {
    setLocation('https://example.com', '')
    expect(decodeShareURL()).toBeNull()
  })

  it('returns null when ?d= contains invalid base64', () => {
    setLocation('https://example.com', '?d=%%%not-base64%%%')
    expect(decodeShareURL()).toBeNull()
  })

  it('returns null when decoded payload is not valid JSON', () => {
    const garbage = btoa('this is not json {{{')
    setLocation('https://example.com', `?d=${garbage}`)
    expect(decodeShareURL()).toBeNull()
  })
})
