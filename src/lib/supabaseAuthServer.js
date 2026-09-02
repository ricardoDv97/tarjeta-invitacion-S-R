import { createServerClient, parseCookieHeader } from '@supabase/ssr'

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY

export function createSupabaseAuthServerClient(request, cookies) {
  if (!import.meta.env.SSR) {
    throw new Error('El cliente de autenticación sólo puede utilizarse en el servidor.')
  }

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('La configuración de autenticación de Supabase no está disponible.')
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '')
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options)
        })
      },
    },
  })
}
