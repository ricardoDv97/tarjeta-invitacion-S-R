import {
  InvalidWebhookSignatureError,
  WebhookSignatureValidator,
} from 'mercadopago'
import { getMercadoPagoPaymentClient } from '../../../lib/mercadopago.js'
import { normalizeMercadoPagoPayment } from '../../../lib/mercadopagoWebhook.js'
import { getSupabaseServerClient } from '../../../lib/supabaseServer.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  },
})

const ignored = () => json({ ok: true, processed: false }, 200)

export async function POST({ request }) {
  const url = new URL(request.url)
  if (url.searchParams.get('type') !== 'payment') return ignored()

  const dataId = url.searchParams.get('data.id')
  if (!dataId || !/^\d{1,128}$/.test(dataId)) {
    return json({ ok: false, message: 'La notificación no es válida.' }, 400)
  }

  const secret = import.meta.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) {
    return json({ ok: false, message: 'El Webhook no está configurado.' }, 503)
  }

  const xSignature = request.headers.get('x-signature')
  const xRequestId = request.headers.get('x-request-id')
  if (!xSignature?.trim() || !xRequestId?.trim()) {
    return json({ ok: false, message: 'La firma no es válida.' }, 401)
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId,
      secret,
    })
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      return json({ ok: false, message: 'La firma no es válida.' }, 401)
    }
    return json({ ok: false, message: 'No pudimos validar la notificación.' }, 500)
  }

  let remotePayment
  try {
    remotePayment = await getMercadoPagoPaymentClient().get({ id: dataId })
  } catch (error) {
    const status = Number(error?.status ?? error?.statusCode)
    if (status === 404) return ignored()
    return json({ ok: false, message: 'Mercado Pago no está disponible temporalmente.' }, 503)
  }

  const payment = normalizeMercadoPagoPayment(remotePayment)
  if (!payment || payment.providerPaymentId !== dataId) return ignored()

  try {
    const supabase = getSupabaseServerClient()
    const { data, error } = await supabase.rpc('apply_mercadopago_payment_result', {
      target_registration_id: payment.registrationId,
      target_provider_payment_id: payment.providerPaymentId,
      target_preference_id: payment.preferenceId,
      target_amount: payment.amount,
      target_currency: payment.currency,
      target_status: payment.status,
      target_paid_at: payment.paidAt,
    })
    if (error) {
      return json({ ok: false, message: 'No pudimos actualizar el estado del pago.' }, 500)
    }
    const result = data?.[0]
    if (!result) {
      return json({ ok: false, message: 'No pudimos procesar la notificación.' }, 500)
    }
    if (!['applied', 'already_applied'].includes(result.outcome)) return ignored()
    return json({ ok: true, processed: true }, 200)
  } catch {
    return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 503)
  }
}

export function ALL() {
  return json({ ok: false, message: 'Método no permitido.' }, 405, { Allow: 'POST' })
}
