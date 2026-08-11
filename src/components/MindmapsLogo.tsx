interface MindmapsLogoProps {
  size?: number
}

/**
 * Mindmaps app icon - the neural mind-map mark. Renders the generated PNG so it
 * stays in sync with the favicon / PWA icons (all from scripts/icon-master.png).
 */
export function MindmapsLogo({ size = 32 }: MindmapsLogoProps) {
  return (
    <img
      src="/icons/pwa-192x192.png"
      width={size}
      height={size}
      alt="Mindmaps"
      draggable={false}
      style={{ display: 'block', borderRadius: Math.round(size * 0.22) }}
    />
  )
}
