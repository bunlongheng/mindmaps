import { describe, it, expect } from 'vitest'
import { hasSupabase, supabase } from '../supabase'

// The test env has no VITE_SUPABASE_* vars set, so the client stays disabled.
describe('supabase', () => {
  it('exposes hasSupabase as false when env is unset', () => {
    expect(hasSupabase).toBe(false)
  })

  it('exposes supabase client as null when env is unset', () => {
    expect(supabase).toBeNull()
  })
})
