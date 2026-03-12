// This script uses sharp to generate PNG icons from an SVG
// Run: node scripts/generate-icons.mjs
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// SVG icon design: indigo circle with a mind map node symbol
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#6366f1"/>
  <!-- Central node -->
  <rect x="196" y="216" width="120" height="80" rx="12" fill="white" opacity="0.95"/>
  <!-- Top-left branch -->
  <line x1="196" y1="256" x2="130" y2="170" stroke="white" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <rect x="70" y="140" width="90" height="50" rx="8" fill="white" opacity="0.7"/>
  <!-- Top-right branch -->
  <line x1="316" y1="256" x2="380" y2="170" stroke="white" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <rect x="350" y="140" width="90" height="50" rx="8" fill="white" opacity="0.7"/>
  <!-- Bottom-left branch -->
  <line x1="196" y1="256" x2="130" y2="340" stroke="white" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <rect x="70" y="318" width="90" height="50" rx="8" fill="white" opacity="0.7"/>
  <!-- Bottom-right branch -->
  <line x1="316" y1="256" x2="380" y2="340" stroke="white" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
  <rect x="350" y="318" width="90" height="50" rx="8" fill="white" opacity="0.7"/>
  <!-- Center text: M -->
  <text x="256" y="266" text-anchor="middle" font-family="system-ui" font-size="44" font-weight="700" fill="#6366f1">M</text>
</svg>`

mkdirSync(resolve(__dirname, '../public/icons'), { recursive: true })
writeFileSync(resolve(__dirname, '../public/icons/icon.svg'), svgIcon)
console.log('SVG icon written. Install sharp and run: node scripts/generate-icons.mjs to create PNGs')
console.log('Or use: npx @vite-pwa/assets-generator --preset minimal public/icons/icon.svg')
