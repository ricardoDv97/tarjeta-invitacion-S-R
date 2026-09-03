import { getSupabaseServerClient } from './supabaseServer.js'
import { createSupabaseAuthServerClient } from './supabaseAuthServer.js'

export async function isAdminUser(userId) {
  if (!userId) return false

  const { data, error } = await getSupabaseServerClient()
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  return !error && data?.user_id === userId
}

export function isSameOriginRequest(request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

export async function requireAdmin(request, cookies) {
  try {
    const auth = createSupabaseAuthServerClient(request, cookies)
    const { data, error } = await auth.auth.getUser()
    if (error || !data.user || !(await isAdminUser(data.user.id))) {
      return { authorized: false, user: null }
    }
    return { authorized: true, user: data.user }
  } catch {
    return { authorized: false, user: null }
  }
}
