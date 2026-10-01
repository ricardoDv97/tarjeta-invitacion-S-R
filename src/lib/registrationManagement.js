import { randomBytes, createHash } from 'node:crypto'
import { isValidUuid } from './validation.js'

export const managementCookieName = id => `rsvp_${id.toLowerCase()}`
export const hashManagementToken = token => createHash('sha256').update(token).digest('hex')
export const createManagementToken = () => randomBytes(32).toString('hex')

export function managementTokenHash(request, id) {
  const name = managementCookieName(id)
  const values = (request.headers.get('cookie') ?? '').split(';')
    .map(value => value.trim()).filter(value => value.startsWith(`${name}=`))
  if (values.length !== 1) return null
  const token = values[0].slice(name.length + 1)
  return /^[a-f0-9]{64}$/.test(token) ? hashManagementToken(token) : null
}

export function managementCookie(id, token, request) {
  const localHttp = new URL(request.url).protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(request.url).hostname)
  return `${managementCookieName(id)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${localHttp ? '' : '; Secure'}`
}

// Private browser operations only. Admin and provider webhooks have independent
// authentication. Never accept a management credential from a URL or JSON body.
export async function authorizeRegistration({ request, id, getClient, fields = 'id' }) {
  if (!isValidUuid(id)) return { status: 400 }
  const tokenHash = managementTokenHash(request, id)
  if (!tokenHash) return { status: 403 }
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return { status: 403 }
    if (request.headers.get('sec-fetch-site') === 'cross-site') return { status: 403 }
  }
  const client = getClient()
  const { data, error } = await client.from('registrations')
    .select(`${fields}, weddings!inner(slug, is_active)`)
    .eq('id', id).eq('management_token_hash', tokenHash)
    .eq('weddings.slug', 'ricardo-sabrina-2026').eq('weddings.is_active', true)
    .maybeSingle()
  if (error) return { status: 503 }
  if (!data) return { status: 403 }
  return { status: 200, registration: data, client }
}
