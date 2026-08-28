import { getMercadoPagoPreferenceClient, getPublicSiteUrl, getCheckoutUrl } from '../../../../lib/mercadopago.js'
import { getSupabaseServerClient } from '../../../../lib/supabaseServer.js'
import { isValidUuid } from '../../../../lib/validation.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
})

const failures = {
  not_found: [404, 'La inscripción no existe.'],
  wrong_payment_method: [409, 'La inscripción no utiliza Mercado Pago.'],
  invalid_registration: [409, 'La inscripción no tiene datos válidos.'],
  payment_disabled: [409, 'Los pagos no están habilitados para este evento.'],
  incomplete_guests: [409, 'Falta completar los datos de los invitados.'],
  invalid_status: [409, 'La inscripción no está disponible para iniciar el pago.'],
  inconsistent_existing_payment: [409, 'El pago existente requiere revisión.'],
}

const preferenceMatches = (preference, registrationId, amount) => {
  if (!preference?.id || preference.external_reference !== registrationId) return false
  if (!Array.isArray(preference.items) || preference.items.length !== 1) return false
  const item = preference.items[0]
  return item.currency_id === 'ARS' && item.quantity === 1 && Number(item.unit_price) === Number(amount)
}

export async function POST({ params, request }) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > 2048) return json({ ok: false, message: 'La solicitud es demasiado grande.' }, 400)
  const body = await request.text()
  if (body.trim()) return json({ ok: false, message: 'Esta solicitud no admite datos enviados por el navegador.' }, 400)

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.rpc('prepare_mercadopago_checkout', { target_registration_id: params.id })
    if (error) return json({ ok: false, message: 'No pudimos preparar el pago con Mercado Pago.' }, 500)
    const prepared = data?.[0]
    if (!prepared) return json({ ok: false, message: 'No pudimos preparar el pago.' }, 500)
    if (!['ready', 'free'].includes(prepared.outcome)) {
      const [status, message] = failures[prepared.outcome] ?? [409, 'La inscripción no puede iniciar el pago.']
      return json({ ok: false, message }, status)
    }
    if (prepared.outcome === 'free') {
      return json({ ok: true, paymentStatus: 'approved', attendanceStatus: 'confirmed', nextStep: 'mercadopago-free' }, 200)
    }

    const siteUrl = getPublicSiteUrl()
    const preferenceClient = getMercadoPagoPreferenceClient()
    let preference

    if (prepared.result_preference_id) {
      try {
        preference = await preferenceClient.get({ preferenceId: prepared.result_preference_id })
      } catch {
        return json({ ok: false, message: 'La preferencia existente no pudo recuperarse. Reintentá más tarde.' }, 503)
      }
    } else {
      const registrationQuery = `registration=${encodeURIComponent(params.id)}`
      preference = await preferenceClient.create({
        body: {
          items: [{
            id: `wedding-${params.id}`,
            title: `Contribución Boda ${prepared.result_couple_name}`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: Number(prepared.result_amount),
          }],
          external_reference: params.id,
          back_urls: {
            success: `${siteUrl}/pago/exitoso?${registrationQuery}`,
            pending: `${siteUrl}/pago/pendiente?${registrationQuery}`,
            failure: `${siteUrl}/pago/error?${registrationQuery}`,
          },
          auto_return: 'approved',
        },
        requestOptions: { idempotencyKey: prepared.result_payment_id },
      })
    }

    const checkoutUrl = getCheckoutUrl(preference)
    if (!checkoutUrl || !preferenceMatches(preference, params.id, prepared.result_amount)) {
      return json({ ok: false, message: 'Mercado Pago devolvió una preferencia no válida.' }, 502)
    }

    if (!prepared.result_preference_id) {
      const { data: saved, error: saveError } = await supabase
        .from('payments')
        .update({ provider_preference_id: preference.id })
        .eq('id', prepared.result_payment_id)
        .eq('registration_id', params.id)
        .eq('provider', 'mercadopago')
        .eq('status', 'pending')
        .is('provider_preference_id', null)
        .select('provider_preference_id')
        .maybeSingle()

      if (saveError) return json({ ok: false, message: 'La preferencia fue creada, pero no pudo vincularse. Reintentá.' }, 503)
      if (!saved) {
        const { data: existing, error: existingError } = await supabase
          .from('payments')
          .select('registration_id, provider, status, amount, currency, external_reference, provider_payment_id, provider_preference_id, paid_at')
          .eq('id', prepared.result_payment_id)
          .single()
        const coherentExisting = !existingError
          && existing?.registration_id === params.id
          && existing.provider === 'mercadopago'
          && existing.status === 'pending'
          && Number(existing.amount) === Number(prepared.result_amount)
          && existing.currency === 'ARS'
          && existing.external_reference === params.id
          && existing.provider_payment_id === null
          && existing.provider_preference_id === preference.id
          && existing.paid_at === null
        if (!coherentExisting) {
          return json({ ok: false, message: 'La preferencia requiere un reintento controlado.' }, 503)
        }
      }
    }

    return json({ ok: true, checkoutUrl, nextStep: 'mercadopago-checkout' }, 200)
  } catch (error) {
    const controlled = error instanceof Error && (
      error.message.startsWith('Mercado Pago') || error.message.startsWith('La URL pública')
    )
    return json({ ok: false, message: controlled ? error.message : 'Mercado Pago no está disponible temporalmente.' }, controlled ? 503 : 502)
  }
}

export function ALL() {
  return json({ ok: false, message: 'Método no permitido.' }, 405, { Allow: 'POST' })
}
