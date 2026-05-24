import type { Diagram } from '../../types'

export function encodeShareURL(diagram: Diagram): string {
  const json = JSON.stringify(diagram)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  // URL-encode: raw base64 contains + and /, and URLSearchParams turns + into a
  // space on read-back, corrupting the payload. encodeURIComponent keeps it intact.
  return `${window.location.origin}?d=${encodeURIComponent(b64)}`
}

export function decodeShareURL(): Diagram | null {
  const params = new URLSearchParams(window.location.search)
  const d = params.get('d')
  if (!d) return null
  try {
    const json = decodeURIComponent(escape(atob(d)))
    return JSON.parse(json) as Diagram
  } catch {
    return null
  }
}
