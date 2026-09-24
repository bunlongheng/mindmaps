import { describe, it, expect } from 'vitest'
import { parseLinkedTitle, displayTitle, sliceSegments, lineRanges } from '../links'

describe('parseLinkedTitle', () => {
  it('turns a markdown link into a linked segment carrying the label', () => {
    const r = parseLinkedTitle('see [SHAR-8206](https://jira.example.com/browse/SHAR-8206) now')
    expect(r.text).toBe('see SHAR-8206 now')
    expect(r.segments).toEqual([
      { text: 'see ' },
      { text: 'SHAR-8206', url: 'https://jira.example.com/browse/SHAR-8206' },
      { text: ' now' },
    ])
  })

  it('links a bare url', () => {
    const r = parseLinkedTitle('docs at https://example.com/a/b')
    expect(r.text).toBe('docs at https://example.com/a/b')
    expect(r.segments).toEqual([
      { text: 'docs at ' },
      { text: 'https://example.com/a/b', url: 'https://example.com/a/b' },
    ])
  })

  it('pushes trailing sentence punctuation back into plain text', () => {
    const r = parseLinkedTitle('read https://example.com/a. then https://example.com/b, ok')
    expect(r.segments).toEqual([
      { text: 'read ' },
      { text: 'https://example.com/a', url: 'https://example.com/a' },
      { text: '. then ' },
      { text: 'https://example.com/b', url: 'https://example.com/b' },
      { text: ', ok' },
    ])
    expect(r.text).toBe('read https://example.com/a. then https://example.com/b, ok')
  })

  it('never linkifies javascript: - the characters stay literal', () => {
    const raw = 'click [x](javascript:alert(1)) please'
    const r = parseLinkedTitle(raw)
    expect(r.text).toBe(raw)
    expect(r.segments).toEqual([{ text: raw }])
    expect(r.segments.some(s => s.url)).toBe(false)
  })

  it('leaves other non-http schemes literal too', () => {
    for (const raw of ['[a](data:text/html,x)', '[b](mailto:me@example.com)', '[c](//evil.example)']) {
      const r = parseLinkedTitle(raw)
      expect(r.text).toBe(raw)
      expect(r.segments.some(s => s.url)).toBe(false)
    }
  })

  it('handles 2 links in one title', () => {
    const r = parseLinkedTitle('[A](https://a.example) and [B](http://b.example)')
    expect(r.text).toBe('A and B')
    expect(r.segments).toEqual([
      { text: 'A', url: 'https://a.example' },
      { text: ' and ' },
      { text: 'B', url: 'http://b.example' },
    ])
  })

  it('returns one merged plain segment when there are no links', () => {
    const r = parseLinkedTitle('just a plain title')
    expect(r.text).toBe('just a plain title')
    expect(r.segments).toEqual([{ text: 'just a plain title' }])
  })

  it('returns empty for empty or non-string input', () => {
    expect(parseLinkedTitle('')).toEqual({ text: '', segments: [] })
    expect(parseLinkedTitle(undefined as unknown as string)).toEqual({ text: '', segments: [] })
    expect(parseLinkedTitle(null as unknown as string)).toEqual({ text: '', segments: [] })
    expect(parseLinkedTitle(42 as unknown as string)).toEqual({ text: '', segments: [] })
  })

  it('is safe to re-run on its own output (width helpers call it repeatedly)', () => {
    const once = displayTitle('see [SHAR-1](https://j.example/SHAR-1) now')
    expect(displayTitle(once)).toBe(once)
  })
})

describe('sliceSegments / lineRanges', () => {
  it('slices runs to a character range, keeping the url', () => {
    const { segments } = parseLinkedTitle('see [SHAR-8206](https://j.example/1) now')
    expect(sliceSegments(segments, 0, 6)).toEqual([{ text: 'see ' }, { text: 'SH', url: 'https://j.example/1' }])
  })

  it('locates wrapped lines in the display text', () => {
    const text = 'alpha beta gamma'
    expect(lineRanges(text, ['alpha beta', 'gamma'])).toEqual([[0, 10], [11, 16]])
  })
})
