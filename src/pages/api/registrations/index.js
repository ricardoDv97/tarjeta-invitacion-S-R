import { getSupabaseServerClient } from '../../../lib/supabaseServer.js'
import {
  amountInCents,
  formatCents,
  validateRegistrationPayload,
} from '../../../lib/validation.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })

export async function POST({ request }) {
  const contentType = request.headers.get('content-type') ?? ''
  const contentLength = Number(request.headers.get('content-length') ?? 0)

  if (!contentType.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, message: 'El contenido debe enviarse como JSON.' }, 400)
  }

  if (Number.isFinite(contentLength) && contentLength > 2048) {
    return json({ ok: false, message: 'La solicitud es demasiado grande.' }, 400)
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return json({ ok: false, message: 'El JSON enviado no es válido.' }, 400)
  }

  const validation = validateRegistrationPayload(payload)
  if (!validation.ok) {
    return json({ ok: false, message: validation.message }, 400)
  }

  try {
    const supabase = getSupabaseServerClient()
    const { data: weddings, error: weddingError } = await supabase
      .from('weddings')
      .select('id, price_per_guest')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(2)

    if (weddingError) {
      return json({ ok: false, message: 'No pudimos consultar el evento en este momento.' }, 500)
    }

    if (!weddings?.length) {
      return json({ ok: false, message: 'Evento no disponible temporalmente.' }, 404)
    }

    if (weddings.length > 1) {
      return json({ ok: false, message: 'El evento no está disponible temporalmente.' }, 500)
    }

    const input = validation.value
    const isCancellation = input.attendance === 'cancelled'
    const pricePerGuestCents = amountInCents(weddings[0].price_per_guest)

    if (pricePerGuestCents === null) {
      return json({ ok: false, message: 'El evento no tiene un precio válido configurado.' }, 500)
    }

    const totalCents = isCancellation ? 0 : pricePerGuestCents * input.guestCount
    if (!Number.isSafeInteger(totalCents) || totalCents > 999999999999) {
      return json({ ok: false, message: 'No pudimos calcular el monto de la inscripción.' }, 500)
    }

    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .insert({
        wedding_id: weddings[0].id,
        guest_count: input.guestCount,
        attendance_status: isCancellation ? 'cancelled' : 'pending',
        payment_method: input.paymentMethod,
        payment_status: isCancellation ? 'cancelled' : 'pending',
        total_amount: formatCents(totalCents),
      })
      .select('id')
      .single()

    if (registrationError || !registration) {
      return json({ ok: false, message: 'No pudimos guardar tu respuesta. Intentá nuevamente.' }, 500)
    }

    return json(
      {
        ok: true,
        registrationId: registration.id,
        nextStep: isCancellation ? 'finished' : 'guests',
      },
      201,
    )
  } catch {
    return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 500)
  }
}

export function ALL() {
  return json(
    { ok: false, message: 'Método no permitido.' },
    405,
    { Allow: 'POST' },
  )
}
