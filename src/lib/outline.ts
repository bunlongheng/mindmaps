export type FlatOutlineItem = { title: string; indent: number }

// Auto-detects the indent unit instead of assuming a fixed width, so 2-space, 4-space,
// or tab-indented text all parse to the same tree. Previously the API import endpoint
// treated 2 spaces as one level, the client paste-import treated 4 spaces as one level,
// and the paste-import gate rejected 2-space outlines outright - the same outline text
// produced a different tree (or was refused) depending on which entry point received it.
export function parseIndentedOutline(text: string): FlatOutlineItem[] {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return []

  const raw = lines
    .map(line => {
      const m = line.match(/^(\s*)(.+)$/)
      return m ? { ws: m[1], title: m[2].trim() } : null
    })
    .filter((x): x is { ws: string; title: string } => x !== null)

  // The indent unit is the smallest nonzero run of leading spaces across lines that
  // don't use tabs (tabs are always counted one-per-level, matching prior behavior).
  const spaceWidths = raw.filter(r => !r.ws.includes('\t') && r.ws.length > 0).map(r => r.ws.length)
  const unit = spaceWidths.length ? Math.min(...spaceWidths) : 4

  return raw.map(r => ({
    title: r.title,
    indent: r.ws.includes('\t') ? (r.ws.match(/\t/g)?.length ?? 0) : Math.floor(r.ws.length / unit),
  }))
}
