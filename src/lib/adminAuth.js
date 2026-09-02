import { getSupabaseServerClient } from './supabaseServer.js'

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
