const ATTENDANCE_VALUES = new Set(['confirmed', 'cancelled'])
const PAYMENT_METHOD_VALUES = new Set(['mercadopago', 'cash'])
const ALLOWED_FIELDS = new Set(['attendance', 'guestCount', 'paymentMethod'])

export function validateRegistrationPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, message: 'Los datos enviados no son válidos.' }
  }

  if (Object.keys(payload).some((field) => !ALLOWED_FIELDS.has(field))) {
    return { ok: false, message: 'La solicitud contiene campos no permitidos.' }
  }

  const { attendance, guestCount, paymentMethod } = payload

  if (!ATTENDANCE_VALUES.has(attendance)) {
    return { ok: false, message: 'Seleccioná una opción de asistencia válida.' }
  }

  if (attendance === 'cancelled') {
    if (
      guestCount !== undefined &&
      (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20)
    ) {
      return { ok: false, message: 'La cantidad de personas enviada no es válida.' }
    }

    if (paymentMethod !== null && paymentMethod !== undefined) {
      return { ok: false, message: 'Una cancelación no requiere método de pago.' }
    }

    return {
      ok: true,
      value: { attendance, guestCount: 1, paymentMethod: null },
    }
  }

  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) {
    return { ok: false, message: 'La cantidad de personas debe ser un entero entre 1 y 20.' }
  }

  if (!PAYMENT_METHOD_VALUES.has(paymentMethod)) {
    return { ok: false, message: 'Seleccioná un método de contribución válido.' }
  }

  return { ok: true, value: { attendance, guestCount, paymentMethod } }
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
