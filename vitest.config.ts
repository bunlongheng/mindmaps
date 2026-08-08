import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Scoped to src/ only - api/ has real tests now (see api/**/__tests__) but not full
      // coverage yet, and folding untested api/ files into this gate would either tank the
      // pinned thresholds or force diluting them. Track api/ coverage separately once more
      // of it is under test.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/types/**', 'src/**/*.d.ts'],
      reporter: ['text-summary'],
      // Regression gate, now enforced in CI (see .github/workflows/ci.yml). Achieved ~97%
      // functions as of 2026-07-22; thresholds sit ~1pt below the achieved level so normal
      // day-to-day changes have headroom and only a real coverage drop fails the run.
      thresholds: { statements: 96, branches: 87, functions: 95, lines: 98 },
    },
  },
})
