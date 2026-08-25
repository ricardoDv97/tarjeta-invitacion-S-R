import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey)

let supabaseClient

export function getSupabaseClient() {
  if (!hasSupabaseConfig) {
    throw new Error(
      'Supabase no está configurado. Definí PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    )
  }

  supabaseClient ??= createClient(supabaseUrl, supabasePublishableKey)
  return supabaseClient
}
