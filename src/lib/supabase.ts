import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\\n/g, '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.replace(/\\n/g, '').trim()

export let hasSupabase = Boolean(supabaseUrl && supabaseAnonKey)
export let supabase: SupabaseClient | null = null

try {
  if (hasSupabase) {
    supabase = createClient(supabaseUrl!, supabaseAnonKey!)
  }
} catch (e) {
  console.error('Supabase init failed:', e)
  hasSupabase = false
  supabase = null
}
