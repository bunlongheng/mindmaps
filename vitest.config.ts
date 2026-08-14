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
      include: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
      exclude: [
        'src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/types/**', 'src/**/*.d.ts',
        'api/**/*.test.ts', 'api/**/__tests__/**',
      ],
      reporter: ['text-summary'],
      // Regression gates, enforced in CI (see .github/workflows/ci.yml). Two independent
      // glob gates, each checked against the aggregate of its own matched files:
      // - src/ gate: achieved ~97% functions as of 2026-07-22; pinned ~1pt below achieved
      //   so day-to-day changes have headroom and only a real coverage drop fails the run.
      // - api/ gate: achieved 31.93/29.15/35.21/33.12 (stmts/branch/fn/lines) as of
      //   2026-08-14; pinned ~2pts below achieved so api/ regressions trip the gate.
      //   Raise as api/ tests grow.
      thresholds: {
        'src/**/*.{ts,tsx}': { statements: 96, branches: 87, functions: 95, lines: 98 },
        'api/**/*.ts': { statements: 30, branches: 27, functions: 33, lines: 31 },
      },
    },
  },
})
