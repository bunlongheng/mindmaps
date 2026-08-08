// Browser Supabase client, used only for "Continue with Google" sign-in.
// Reuses the same Supabase project as the Diagrams app (Google provider is
// configured there). URL + anon key are public by design and safe to ship.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export const hasSupabase = Boolean(url && anonKey)
export const supabase: SupabaseClient | null = hasSupabase ? createClient(url!, anonKey!) : null
