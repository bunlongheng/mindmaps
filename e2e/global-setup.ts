import { mkdirSync, writeFileSync } from 'node:fs'
import { RUN_STAMP } from './run-stamp'

// Record when this run started so the teardown can tell run-made maps from real ones.
export default function globalSetup() {
  mkdirSync('node_modules/.cache', { recursive: true })
  writeFileSync(RUN_STAMP, String(Date.now()))
}
