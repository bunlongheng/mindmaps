interface ThinkLogoProps {
  size?: number
  color?: string
}

/**
 * Think logo — a central node with 5 curved branches radiating out,
 * evoking a mind map / neural thought pattern.
 */
export function ThinkLogo({ size = 32, color = 'white' }: ThinkLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Center node */}
      <circle cx="16" cy="16" r="3.8" fill={color} />

      {/* Branch: top-left */}
      <path d="M13.3 13.3 C11 10.5 8.5 9.5 6.5 7.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="5.8" cy="6.8" r="2.2" fill={color} opacity="0.75" />

      {/* Branch: top-right */}
      <path d="M18.2 12.8 C20 9.8 23 8.5 25.5 7" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="26.5" cy="6.3" r="2.2" fill={color} opacity="0.75" />

      {/* Branch: right */}
      <path d="M19.8 16 C22.5 15.8 25 17 27 16.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="28.2" cy="16.3" r="2" fill={color} opacity="0.75" />

      {/* Branch: bottom-right */}
      <path d="M18 19 C19.5 21.5 21.5 23 22.5 25.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="23.2" cy="27" r="2" fill={color} opacity="0.75" />

      {/* Branch: bottom-left */}
      <path d="M13.5 18.8 C11.5 21 9 22 7 24" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <circle cx="5.8" cy="25.5" r="2" fill={color} opacity="0.75" />
    </svg>
  )
}
