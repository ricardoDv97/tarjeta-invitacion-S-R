const ATTENDANCE_VALUES = new Set(['confirmed', 'cancelled'])
const PAYMENT_METHOD_VALUES = new Set(['mercadopago', 'cash'])
const AGE_CATEGORIES = new Set(['adult', 'child', 'young_child'])
const REGISTRATION_FIELDS = new Set(['attendance', 'adultCount', 'childCount', 'youngChildCount', 'paymentMethod'])
const GUEST_FIELDS = new Set(['firstName', 'lastName', 'category'])

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function validateRegistrationPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Los datos enviados no son válidos.' }
  }
  if (Object.keys(payload).some((field) => !REGISTRATION_FIELDS.has(field))) {
    return { ok: false, message: 'La solicitud contiene campos no permitidos.' }
  }

  const { attendance, adultCount, childCount, youngChildCount, paymentMethod } = payload
  if (!ATTENDANCE_VALUES.has(attendance)) {
    return { ok: false, message: 'Seleccioná una opción de asistencia válida.' }
  }
  if (attendance === 'cancelled') {
    if ([adultCount, childCount, youngChildCount].some((value) => value !== undefined)) {
      return { ok: false, message: 'Una cancelación no requiere cantidades.' }
    }
    if (paymentMethod !== null && paymentMethod !== undefined) {
      return { ok: false, message: 'Una cancelación no requiere método de pago.' }
    }
    return { ok: true, value: { attendance, adultCount: 1, childCount: 0, youngChildCount: 0, guestCount: 1, paymentMethod: null } }
  }

  const counts = [adultCount, childCount, youngChildCount]
  if (counts.some((value) => !Number.isInteger(value) || value < 0 || value > 20)) {
    return { ok: false, message: 'Cada cantidad debe ser un entero entre 0 y 20.' }
  }
  const guestCount = adultCount + childCount + youngChildCount
  if (guestCount < 1 || guestCount > 20) {
    return { ok: false, message: 'La cantidad total de personas debe ser entre 1 y 20.' }
  }
  if (!PAYMENT_METHOD_VALUES.has(paymentMethod)) {
    return { ok: false, message: 'Seleccioná un método de contribución válido.' }
  }
  return { ok: true, value: { attendance, adultCount, childCount, youngChildCount, guestCount, paymentMethod } }
}

export function validateGuestsPayload(payload, registration) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Los datos enviados no son válidos.' }
  }
  if (Object.keys(payload).length !== 1 || !Array.isArray(payload.guests)) {
    return { ok: false, message: 'La solicitud contiene campos no permitidos.' }
  }
  if (payload.guests.length !== registration.guest_count) {
    return { ok: false, message: 'La cantidad de invitados no coincide con la inscripción.' }
  }

  const counts = { adult: 0, child: 0, young_child: 0 }
  const guests = []
  for (const guest of payload.guests) {
    if (!guest || typeof guest !== 'object' || Array.isArray(guest) || Object.keys(guest).some((field) => !GUEST_FIELDS.has(field))) {
      return { ok: false, message: 'Un invitado contiene campos no permitidos.' }
    }
    const firstName = typeof guest.firstName === 'string' ? guest.firstName.trim() : ''
    const lastName = typeof guest.lastName === 'string' ? guest.lastName.trim() : ''
    if (firstName.length < 1 || firstName.length > 80 || lastName.length < 1 || lastName.length > 80) {
      return { ok: false, message: 'Cada nombre y apellido es obligatorio y admite hasta 80 caracteres.' }
    }
    if (!AGE_CATEGORIES.has(guest.category)) {
      return { ok: false, message: 'La categoría etaria no es válida.' }
    }
    counts[guest.category] += 1
    guests.push({ first_name: firstName, last_name: lastName, age_category: guest.category })
  }

  if (counts.adult !== registration.adult_count || counts.child !== registration.child_count || counts.young_child !== registration.young_child_count) {
    return { ok: false, message: 'Las categorías no coinciden con la inscripción.' }
  }
  return { ok: true, value: guests }
}

export function amountInCents(value) {
  const normalized = typeof value === 'number' ? value.toFixed(2) : String(value)
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

export function formatCents(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}
