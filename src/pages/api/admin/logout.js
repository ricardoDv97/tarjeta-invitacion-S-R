import { isSameOriginRequest } from '../../../lib/adminAuth.js'
import { createSupabaseAuthServerClient } from '../../../lib/supabaseAuthServer.js'

export const prerender = false

export async function POST({ request, cookies, redirect }) {
  if (!isSameOriginRequest(request)) {
    return new Response('Solicitud no permitida.', {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }

  try {
    const supabase = createSupabaseAuthServerClient(request, cookies)
    await supabase.auth.signOut()
  } catch {
    // La salida siempre termina en login sin exponer detalles internos.
  }

  const response = redirect('/admin/login', 303)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export function ALL() {
  return new Response('Método no permitido.', {
    status: 405,
    headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' },
  })
}
