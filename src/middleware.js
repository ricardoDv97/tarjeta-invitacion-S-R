import { defineMiddleware } from 'astro:middleware'
import { isAdminUser } from './lib/adminAuth.js'
import { createSupabaseAuthServerClient } from './lib/supabaseAuthServer.js'

const NO_STORE = 'private, no-store'

function privateRedirect(context, location) {
  const response = context.redirect(location, 303)
  response.headers.set('Cache-Control', NO_STORE)
  return response
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isLoginPage = pathname === '/admin/login' || pathname === '/admin/login/'
  const isAdminApi = pathname.startsWith('/api/admin/')

  if (!isAdminPage && !isAdminApi) return next()

  if (isAdminApi) {
    const response = await next()
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }

  let user = null
  let authorized = false

  try {
    const supabase = createSupabaseAuthServerClient(context.request, context.cookies)
    const { data, error } = await supabase.auth.getUser()
    user = error ? null : data.user
    authorized = user ? await isAdminUser(user.id) : false

    if (user && !authorized) await supabase.auth.signOut()
  } catch {
    user = null
    authorized = false
  }

  if (isLoginPage && authorized) {
    return privateRedirect(context, '/admin')
  }

  if (!isLoginPage && !authorized) {
    return privateRedirect(context, '/admin/login')
  }

  if (authorized) context.locals.adminUser = user

  const response = await next()
  response.headers.set('Cache-Control', NO_STORE)
  return response
})
