import { amountInCents, formatCents, isValidUuid } from './validation.js'

const FINAL_STATUSES = new Set(['approved', 'rejected', 'cancelled'])

export function mapMercadoPagoStatus(status) {
  return FINAL_STATUSES.has(status) ? status : 'pending'
}

export function normalizeMercadoPagoPayment(payment) {
  const providerPaymentId = payment?.id === undefined || payment?.id === null
    ? ''
    : String(payment.id)
  const externalReference = typeof payment?.external_reference === 'string'
    ? payment.external_reference.trim()
    : ''
  const amountCents = amountInCents(payment?.transaction_amount)
  const currency = typeof payment?.currency_id === 'string'
    ? payment.currency_id.trim().toUpperCase()
    : ''
  const preferenceId = typeof payment?.preference_id === 'string'
    ? payment.preference_id.trim()
    : typeof payment?.metadata?.preference_id === 'string'
      ? payment.metadata.preference_id.trim()
      : null
  const approvedAt = payment?.date_approved ? new Date(payment.date_approved) : null

  if (
    !/^\d{1,128}$/.test(providerPaymentId)
    || !isValidUuid(externalReference)
    || amountCents === null
    || !currency
    || (preferenceId !== null && !preferenceId)
    || (approvedAt && Number.isNaN(approvedAt.getTime()))
  ) return null

  const status = mapMercadoPagoStatus(payment?.status)
  return {
    registrationId: externalReference,
    providerPaymentId,
    preferenceId,
    amount: formatCents(amountCents),
    currency,
    status,
    paidAt: status === 'approved'
      ? (approvedAt ?? new Date()).toISOString()
      : null,
  }
}
