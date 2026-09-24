// Links inside node text. An agent POSTs a map whose node titles carry references
// (Jira tickets, docs, URLs); those have to draw as real anchors instead of raw
// markdown. The title itself stays a plain string - this is a render-time parse,
// not a schema change.
//
// SECURITY: only http:// and https:// ever become an anchor. Any other scheme -
// javascript: above all - keeps its literal characters and is never linkified.

export interface LinkSegment {
  /** Display characters for this run. */
  text: string
  /** Present only on an http(s) run; absent means plain text. */
  url?: string
}

export interface ParsedTitle {
  /** The display text: every segment's text concatenated, no markdown syntax. */
  text: string
  segments: LinkSegment[]
}

// [label](target)  |  bare http(s) url
const TOKEN_RE = /\[([^\]]*)\]\(([^)\s]*)\)|(https?:\/\/[^\s)]+)/g
const HTTP_RE = /^https?:\/\//i
const TRAILING = '.,;'

/**
 * Split a raw node title into plain and linked runs.
 * Markdown `[label](https://…)` becomes a linked run carrying the label; a markdown
 * link pointing at any other scheme keeps its literal `[label](target)` characters.
 * A bare http(s) URL becomes a linked run, with trailing sentence punctuation
 * handed back to the plain text beside it. Adjacent plain runs are merged.
 */
export function parseLinkedTitle(raw: string): ParsedTitle {
  if (typeof raw !== 'string' || raw.length === 0) return { text: '', segments: [] }

  const segments: LinkSegment[] = []
  let plain = ''
  const flush = () => { if (plain) { segments.push({ text: plain }); plain = '' } }

  TOKEN_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(raw)) !== null) {
    plain += raw.slice(last, m.index)
    last = m.index + m[0].length

    if (m[3] !== undefined) {
      let url = m[3]
      let tail = ''
      while (url.length > 0 && TRAILING.includes(url[url.length - 1])) {
        tail = url[url.length - 1] + tail
        url = url.slice(0, -1)
      }
      if (url) { flush(); segments.push({ text: url, url }); plain += tail }
      else plain += m[3]
    } else if (HTTP_RE.test(m[2])) {
      flush()
      segments.push({ text: m[1], url: m[2] })
    } else {
      // Non-http scheme (javascript:, data:, …) - literal text, never an anchor.
      plain += m[0]
    }
  }
  plain += raw.slice(last)
  flush()

  return { text: segments.map(s => s.text).join(''), segments }
}

/** The text a node actually draws - use this for every width/wrap measurement, so
 *  boxes never size to markdown characters nobody sees. */
export function displayTitle(raw: string): string {
  return parseLinkedTitle(raw).text
}

/** The runs covering `[start, end)` of the display text, link info preserved. */
export function sliceSegments(segments: LinkSegment[], start: number, end: number): LinkSegment[] {
  const out: LinkSegment[] = []
  let pos = 0
  for (const seg of segments) {
    const s = Math.max(start, pos)
    const e = Math.min(end, pos + seg.text.length)
    if (e > s) {
      const text = seg.text.slice(s - pos, e - pos)
      out.push(seg.url ? { text, url: seg.url } : { text })
    }
    pos += seg.text.length
  }
  return out
}

/** Char ranges in `text` for the lines wrapText produced (it collapses whitespace,
 *  so the lines are located word by word rather than by a plain indexOf). */
export function lineRanges(text: string, lines: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let cursor = 0
  for (const line of lines) {
    let start = -1
    let end = cursor
    for (const word of line.split(' ')) {
      if (!word) continue
      const i = text.indexOf(word, cursor)
      if (i < 0) continue
      if (start < 0) start = i
      cursor = i + word.length
      end = cursor
    }
    out.push([start < 0 ? cursor : start, end])
  }
  return out
}
