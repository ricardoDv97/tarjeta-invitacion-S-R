import { wedding as weddingConfig } from '../config/wedding.js'
import { getSupabaseServerClient } from './supabaseServer.js'

const registrationFields = 'id, contact_name, guest_count, adult_count, child_count, young_child_count, attendance_status, payment_method, payment_status, total_amount, created_at'
const guestFields = 'id, registration_id, first_name, last_name, age_category, created_at'
const paymentFields = 'id, registration_id, provider, amount, currency, status, provider_payment_id, provider_preference_id, paid_at, created_at'

function decimalToCents(value) {
  const normalized = String(value ?? '0').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return 0n
  const [whole, fraction = ''] = normalized.split('.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}

export function formatArsFromCents(cents) {
  const whole = cents / 100n
  const fraction = cents % 100n
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return fraction === 0n ? `$ ${grouped}` : `$ ${grouped},${fraction.toString().padStart(2, '0')}`
}

export function formatArs(value) {
  return formatArsFromCents(decimalToCents(value))
}

export async function getAdminDashboardData() {
  const supabase = getSupabaseServerClient()
  const { data: activeWedding, error: weddingError } = await supabase
    .from('weddings').select('id, slug, couple_name, wedding_date').eq('slug', weddingConfig.slug).maybeSingle()
  if (weddingError || !activeWedding) throw new Error('admin_wedding_unavailable')

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations').select(registrationFields).eq('wedding_id', activeWedding.id).order('created_at', { ascending: false })
  if (registrationsError) throw new Error('admin_registrations_unavailable')

  const registrationIds = registrations.map(({ id }) => id)
  let guests = []
  let payments = []
  if (registrationIds.length) {
    const [guestsResult, paymentsResult] = await Promise.all([
      supabase.from('guests').select(guestFields).in('registration_id', registrationIds).order('created_at', { ascending: false }),
      supabase.from('payments').select(paymentFields).in('registration_id', registrationIds).order('created_at', { ascending: false }),
    ])
    if (guestsResult.error || paymentsResult.error) throw new Error('admin_related_data_unavailable')
    guests = guestsResult.data
    payments = paymentsResult.data
  }

  const registrationsById = new Map(registrations.map((registration) => [registration.id, registration]))
  let collectedCents = 0n
  let pendingCents = 0n
  for (const payment of payments) {
    if (payment.status === 'approved') collectedCents += decimalToCents(payment.amount)
    if (payment.status === 'pending') pendingCents += decimalToCents(payment.amount)
  }

  const summary = {
    registrations: registrations.length,
    guests: guests.length,
    adults: guests.filter(({ age_category }) => age_category === 'adult').length,
    children: guests.filter(({ age_category }) => age_category === 'child').length,
    youngChildren: guests.filter(({ age_category }) => age_category === 'young_child').length,
    attendanceConfirmed: registrations.filter(({ attendance_status }) => attendance_status === 'confirmed').length,
    attendancePending: registrations.filter(({ attendance_status }) => attendance_status === 'pending').length,
    paymentsApproved: payments.filter(({ status }) => status === 'approved').length,
    paymentsPending: payments.filter(({ status }) => status === 'pending').length,
    collected: formatArsFromCents(collectedCents),
    pending: formatArsFromCents(pendingCents),
  }

  return { wedding: activeWedding, registrations, guests, payments, registrationsById, summary }
}
