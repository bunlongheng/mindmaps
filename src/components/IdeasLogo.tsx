interface IdeasLogoProps {
  size?: number
}

/**
 * Ideas logo — Figma-style lightbulb:
 * red pill (top) · purple rect (mid-left) · blue circle (mid-right)
 * · green teardrop (bottom) · metallic base cap
 */
export function IdeasLogo({ size = 32 }: IdeasLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ilR" cx="38%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#ff6a42"/>
          <stop offset="100%" stopColor="#c82200"/>
        </radialGradient>
        <radialGradient id="ilP" cx="35%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#c07eff"/>
          <stop offset="100%" stopColor="#6a10cc"/>
        </radialGradient>
        <radialGradient id="ilB" cx="64%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#88d8ff"/>
          <stop offset="100%" stopColor="#1890d8"/>
        </radialGradient>
        <radialGradient id="ilG" cx="35%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#72ee90"/>
          <stop offset="100%" stopColor="#0a9022"/>
        </radialGradient>
        <linearGradient id="ilM" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#d8e2ea"/>
          <stop offset="100%" stopColor="#7e8e9e"/>
        </linearGradient>
      </defs>

      {/* Top pill — red-orange, full width */}
      <rect x="1.5" y="0.5" width="29" height="10" rx="5" fill="url(#ilR)"/>

      {/* Middle-left — purple rounded square */}
      <rect x="1.5" y="11.5" width="13.5" height="13.5" rx="5" fill="url(#ilP)"/>

      {/* Middle-right — blue circle */}
      <circle cx="22" cy="18.25" r="6.75" fill="url(#ilB)"/>

      {/* Bottom — green teardrop (narrows toward neck) */}
      <path
        d="M4.5 26.5 C1.5 26.5 1.5 29.5 1.5 30.5 C1.5 33 3.5 34.5 8 34.5 C12.5 34.5 15 33 15 30.5 C15 29.5 15 26.5 12 26.5 Z"
        fill="url(#ilG)"
      />

      {/* Base cap — metallic gray */}
      <rect x="5.5" y="34" width="9" height="2.5" rx="1.25" fill="url(#ilM)"/>
    </svg>
  )
}
