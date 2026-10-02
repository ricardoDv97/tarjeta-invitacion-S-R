import { getSupabaseServerClient } from '../../../../lib/supabaseServer.js'
import { isValidUuid, validateGuestsPayload } from '../../../../lib/validation.js'
import { managementTokenHash } from '../../../../lib/registrationManagement.js'

export const prerender = false

const json = (body, status, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
})

export async function POST({ params, request }) {
  if (!isValidUuid(params.id)) return json({ ok: false, message: 'La referencia no es válida.' }, 400)
  const tokenHash = managementTokenHash(request, params.id)
  if (!tokenHash) return json({ ok: false, message: 'No tenés autorización para esta inscripción. Volvé a confirmar.' }, 403)
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, message: 'Origen no permitido.' }, 403)
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
      .eq('management_token_hash', tokenHash)
      .maybeSingle()

    if (registrationError) return json({ ok: false, message: 'No pudimos consultar la inscripción.' }, 500)
    if (!registration) return json({ ok: false, message: 'No tenés autorización para esta inscripción.' }, 403)
    if (registration.attendance_status !== 'pending') return json({ ok: false, message: 'Esta inscripción no admite invitados.' }, 409)

    const validation = validateGuestsPayload(payload, registration)
    if (!validation.ok) return json({ ok: false, message: validation.message }, 400)

    // The RPC repeats validation while holding the registration lock. The read
    // above is only for useful validation messages, never the integrity guard.
    const { data, error } = await supabase.rpc('save_registration_guests', {
      target_registration_id: registration.id,
      target_token_hash: tokenHash,
      target_guests: validation.value,
    })
    if (error || !data?.[0]) return json({ ok: false, message: 'No pudimos guardar los invitados. Intentá nuevamente.' }, 500)
    const result = data[0]
    const failures = {
      unauthorized: [403, 'No tenés autorización para esta inscripción.'],
      not_found: [404, 'La inscripción no existe.'],
      invalid_status: [409, 'Esta inscripción no admite invitados.'],
      invalid_guests: [400, 'Los invitados no coinciden con la inscripción.'],
      guests_conflict: [409, 'Los invitados de esta inscripción ya fueron registrados.'],
    }
    if (!['saved', 'already_saved'].includes(result.outcome)) {
      const [status, message] = failures[result.outcome] ?? [409, 'No pudimos guardar los invitados.']
      return json({ ok: false, message }, status)
    }
    return json({ ok: true, nextStep: result.result_payment_method === 'cash' ? 'cash' : result.result_payment_method === 'transfer' ? 'transfer' : 'legacy-unavailable' }, result.outcome === 'saved' ? 201 : 200)
  } catch {
    return json({ ok: false, message: 'El servicio no está disponible temporalmente.' }, 500)
  }
}

export function ALL() {
  return json({ ok: false, message: 'Método no permitido.' }, 405, { Allow: 'POST' })
}
