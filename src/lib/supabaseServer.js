import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseSecretKey = import.meta.env.SUPABASE_SECRET_KEY

let supabaseServerClient

export function getSupabaseServerClient() {
  if (!import.meta.env.SSR) {
    throw new Error('El cliente privado de Supabase sólo puede utilizarse en el servidor.')
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('La configuración privada de Supabase no está disponible.')
  }

  supabaseServerClient ??= createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  return supabaseServerClient
}
