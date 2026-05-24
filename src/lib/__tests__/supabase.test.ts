import { describe, it, expect } from 'vitest'
import { hasSupabase, supabase } from '../supabase'

describe('supabase', () => {
  it('exposes hasSupabase as false', () => {
    expect(hasSupabase).toBe(false)
  })

  it('exposes supabase client as null', () => {
    expect(supabase).toBeNull()
  })
})
