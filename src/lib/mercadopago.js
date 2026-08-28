import { MercadoPagoConfig, Preference } from 'mercadopago'

const accessToken = import.meta.env.MERCADOPAGO_ACCESS_TOKEN
let preferenceClient

export function getMercadoPagoPreferenceClient() {
  if (!import.meta.env.SSR) {
    throw new Error('Mercado Pago sólo puede utilizarse en el servidor.')
  }
  if (!accessToken) {
    throw new Error('Mercado Pago no está configurado.')
  }

  preferenceClient ??= new Preference(new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10000, maxRetries: 2 },
  }))
  return preferenceClient
}

export function getPublicSiteUrl() {
  const configuredUrl = import.meta.env.PUBLIC_SITE_URL
  if (!configuredUrl) throw new Error('La URL pública del sitio no está configurada.')

  let url
  try { url = new URL(configuredUrl) } catch { throw new Error('La URL pública del sitio no es válida.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('La URL pública del sitio debe ser HTTPS y no incluir credenciales, query ni hash.')
  }
  if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('La URL pública del sitio no puede ser localhost.')
  }
  url.pathname = url.pathname.replace(/\/$/, '')
  return url.toString().replace(/\/$/, '')
}

export function getCheckoutUrl(preference) {
  const candidate = accessToken?.startsWith('TEST-')
    ? preference?.sandbox_init_point || preference?.init_point
    : preference?.init_point || preference?.sandbox_init_point
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    const trustedHost = url.hostname === 'mercadopago.com'
      || url.hostname.endsWith('.mercadopago.com')
      || url.hostname === 'mercadopago.com.ar'
      || url.hostname.endsWith('.mercadopago.com.ar')
    return url.protocol === 'https:' && trustedHost ? url.toString() : null
  } catch {
    return null
  }
}
