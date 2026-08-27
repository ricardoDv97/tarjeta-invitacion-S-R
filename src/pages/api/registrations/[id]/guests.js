import { getSupabaseServerClient } from '../../../../lib/supabaseServer.js'
import { isValidUuid, validateGuestsPayload } from '../../../../lib/validation.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
})

export async function POST({ params, request }) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)
  const contentType = request.headers.get('content-type') ?? ''
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (!contentType.toLowerCase().startsWith('application/json')) return json({ ok: false, message: 'El contenido debe enviarse como JSON.' }, 400)
  if (Number.isFinite(contentLength) && contentLength > 16384) return json({ ok: false, message: 'La solicitud es demasiado grande.' }, 400)

  let payload
  try { payload = await request.json() } catch { return json({ ok: false, message: 'El JSON enviado no es válido.' }, 400) }

  try {
    const supabase = getSupabaseServerClient()
    const { data: registration, error: registrationError } = await supabase
      .from('registrations')
      .select('id, guest_count, adult_count, child_count, young_child_count, attendance_status, payment_method')
      .eq('id', params.id)
      .maybeSingle()

    if (registrationError) return json({ ok: false, message: 'No pudimos consultar la inscripción.' }, 500)
    if (!registration) return json({ ok: false, message: 'La inscripción no existe.' }, 404)
    if (registration.attendance_status !== 'pending') return json({ ok: false, message: 'Esta inscripción no admite invitados.' }, 409)

    const validation = validateGuestsPayload(payload, registration)
    if (!validation.ok) return json({ ok: false, message: validation.message }, 400)

    const { data: existingGuests, error: existingError } = await supabase
      .from('guests')
      .select('first_name, last_name, age_category')
      .eq('registration_id', registration.id)
    if (existingError) return json({ ok: false, message: 'No pudimos verificar la inscripción.' }, 500)
    if (existingGuests?.length) {
      const key = (guest) => `${guest.age_category}\u0000${guest.first_name}\u0000${guest.last_name}`
      const stored = existingGuests.map(key).sort()
      const requested = validation.value.map(key).sort()
      const sameGuests = stored.length === requested.length && stored.every((value, index) => value === requested[index])
      if (!sameGuests) return json({ ok: false, message: 'Los invitados de esta inscripción ya fueron registrados.' }, 409)
      return json({ ok: true, nextStep: registration.payment_method === 'cash' ? 'cash' : 'mercadopago' }, 200)
    }

    const rows = validation.value.map((guest) => ({ ...guest, registration_id: registration.id }))
    const { error: insertError } = await supabase.from('guests').insert(rows)
    if (insertError) return json({ ok: false, message: 'No pudimos guardar los invitados. Intentá nuevamente.' }, 500)

    return json({ ok: true, nextStep: registration.payment_method === 'cash' ? 'cash' : 'mercadopago' }, 201)
  } catch {
    return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 500)
  }
}

export function ALL() {
  return json({ ok: false, message: 'Método no permitido.' }, 405, { Allow: 'POST' })
}
