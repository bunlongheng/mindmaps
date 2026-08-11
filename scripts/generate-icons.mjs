// Generates every app icon from a single master PNG (scripts/icon-master.png),
// which came from the local-apps favicon set. Run: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MASTER = resolve(__dirname, 'icon-master.png')
const MASKABLE_BG = '#3a1d7a' // deep purple to fill the square behind the rounded art

mkdirSync(resolve(ROOT, 'public/icons'), { recursive: true })

const png = (size) => sharp(MASTER).resize(size, size, { fit: 'cover', kernel: 'lanczos3' }).png().toBuffer()
const maskable = (size) =>
  sharp(MASTER).resize(size, size, { fit: 'cover', kernel: 'lanczos3' }).flatten({ background: MASKABLE_BG }).png().toBuffer()

// Minimal ICO (PNG-encoded entries) so favicon.ico carries 16 + 32 crisp sizes.
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + 16 * entries.length
  entries.forEach((e, i) => {
    const d = i * 16
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, d)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, d + 1)
    dir.writeUInt16LE(1, d + 4)
    dir.writeUInt16LE(32, d + 6)
    dir.writeUInt32LE(e.buf.length, d + 8)
    dir.writeUInt32LE(offset, d + 12)
    offset += e.buf.length
  })
  return Buffer.concat([header, dir, ...entries.map(e => e.buf)])
}

const write = (rel, buf) => { writeFileSync(resolve(ROOT, rel), buf); console.log(`  ${rel}`) }

const [p16, p32, p64, p180, p192, p512] = await Promise.all([png(16), png(32), png(64), png(180), png(192), png(512)])
const m512 = await maskable(512)
const ico = buildIco([{ size: 16, buf: p16 }, { size: 32, buf: p32 }])

// public/icons/*  (the set index.html + the PWA manifest reference)
write('public/icons/favicon-16x16.png', p16)
write('public/icons/favicon-32x32.png', p32)
write('public/icons/pwa-64x64.png', p64)
write('public/icons/apple-touch-icon.png', p180)
write('public/icons/apple-touch-icon-180x180.png', p180)
write('public/icons/android-chrome-192x192.png', p192)
write('public/icons/pwa-192x192.png', p192)
write('public/icons/android-chrome-512x512.png', p512)
write('public/icons/pwa-512x512.png', p512)
write('public/icons/maskable-512x512.png', m512)
write('public/icons/maskable-icon-512x512.png', m512)
write('public/icons/favicon.ico', ico)
// SVG favicon: wrap the raster so the svg <link> keeps working with the new art.
write('public/icons/icon.svg',
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${p512.toString('base64')}"/></svg>`))

// public/*  (root-level legacy icons)
write('public/favicon-16x16.png', p16) // harmless extra alias
write('public/icon-16.png', p16)
write('public/icon-32.png', p32)
write('public/favicon.png', p32)
write('public/icon-180.png', p180)
write('public/apple-touch-icon.png', p180)
write('public/icon-192.png', p192)
write('public/icon-512.png', p512)
write('public/favicon.ico', ico)

console.log('\nAll icons regenerated from scripts/icon-master.png')
