// Lazy fallback icon registry. This module is ONLY loaded via dynamic import()
// (see NodeIcon.tsx), so the full lucide-react + heroicons sets are bundled
// into a separate async chunk instead of the main bundle. The curated icons in
// icons.ts stay statically imported and are deduped into the main chunk.
import type { LucideIcon } from 'lucide-react'

// Every lucide icon, keyed by its canonical kebab-case file stem.
const lucideModules = import.meta.glob<LucideIcon>(
  ['/node_modules/lucide-react/dist/esm/icons/*.js', '!**/index.js'],
  { eager: true, import: 'default' }
)

export const LUCIDE_LAZY: Record<string, LucideIcon> = {}
for (const [path, icon] of Object.entries(lucideModules)) {
  LUCIDE_LAZY[path.slice(path.lastIndexOf('/') + 1).replace(/\.js$/, '')] = icon
}

// Every heroicons 24/outline icon, keyed by its export name (e.g. AcademicCapIcon).
const heroModules = import.meta.glob<LucideIcon>(
  '/node_modules/@heroicons/react/24/outline/esm/*Icon.js',
  { eager: true, import: 'default' }
)

export const HERO_LAZY: Record<string, LucideIcon> = {}
for (const [path, icon] of Object.entries(heroModules)) {
  HERO_LAZY[path.slice(path.lastIndexOf('/') + 1).replace(/\.js$/, '')] = icon
}
