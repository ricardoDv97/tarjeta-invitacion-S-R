import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)

let supabaseClient

export function getSupabaseClient() {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Supabase no está configurado. Definí PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY.',
    )
  }

  supabaseClient ??= createClient(supabaseUrl, supabaseAnonKey)
  return supabaseClient
}
