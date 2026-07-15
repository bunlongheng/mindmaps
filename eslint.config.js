import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Empty catch is a deliberate no-op in a few defensive spots (WebAudio unlock, storage).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Honor the _-prefix convention for intentionally-unused args/vars.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // eslint-plugin-react-hooks v6 ships the experimental react-compiler rules. This codebase
      // predates react-compiler, so keep these as warnings (the core rules-of-hooks + exhaustive-deps
      // still apply) until a dedicated compiler-readiness pass.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
])
