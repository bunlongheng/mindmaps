import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/types/**', 'src/**/*.d.ts'],
      reporter: ['text-summary'],
      // Regression gate. Achieved ~99% lines; the small remainder is verified
      // dead/unreachable code (SSR fallbacks, impossible-state guards). Thresholds
      // sit just under the achieved level so a real coverage drop fails the run.
      thresholds: { statements: 96, branches: 87, functions: 96, lines: 98 },
    },
  },
})
