export function initializeTransferPayment() {
  const dialog = document.querySelector('#transfer-dialog')
  if (!(dialog instanceof HTMLDialogElement)) return
  const open = document.querySelector('#open-transfer')
  const retry = document.querySelector('#retry-transfer')
  const state = document.querySelector('#transfer-state')
  const yes = document.querySelector('#transfer-yes')
  const no = document.querySelector('#transfer-no')
  const question = document.querySelector('#transfer-question')
  const result = document.querySelector('#transfer-result')
  const error = document.querySelector('#transfer-error')
  const finish = document.querySelector('#transfer-finish')
  const reference = new URLSearchParams(window.location.search).get('registration') ?? ''
  let verified = false
  let reported = false
  let busy = false
  const reportedMessage = 'Gracias. Registramos que realizaste la transferencia. La confirmación final se realizará luego de verificar el pago.'
  const finishWith = message => { question.hidden = true; result.textContent = message; result.hidden = false; finish.hidden = false; finish.focus() }
  const post = async action => {
    const response = await fetch(`/api/registrations/${encodeURIComponent(reference)}/${action}`, { method: 'POST', headers: { Accept: 'application/json' } })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.ok) throw new Error(body?.message || 'No pudimos registrar tu respuesta. Intentá nuevamente.')
    return body
  }
  const load = async () => {
    retry.hidden = true; state.textContent = 'Consultando tu inscripción…'
    try {
      const body = await post('transfer')
      const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(body.totalAmount))
      document.querySelectorAll('[data-transfer-amount]').forEach(node => { node.textContent = money })
      reported = Boolean(body.paymentReportedAt)
      verified = body.paymentStatus === 'approved'
      if (verified) {
        state.textContent = 'Tu pago fue verificado y tu asistencia está confirmada.'
        finishWith('Tu pago fue verificado y tu asistencia está confirmada.')
      } else {
        state.textContent = reported ? 'Pago informado, pendiente de verificación.' : 'Tu confirmación quedará pendiente hasta verificar el pago.'
        if (reported) finishWith(reportedMessage)
      }
      open.disabled = false
    } catch (cause) { state.textContent = cause instanceof Error ? cause.message : 'No pudimos consultar la inscripción.'; retry.hidden = false }
  }
  retry.addEventListener('click', load)
  open.addEventListener('click', () => {
    if (!reported && !verified) { question.hidden = false; result.hidden = true; finish.hidden = true; error.textContent = '' }
    dialog.showModal()
  })
  document.querySelector('#transfer-close').addEventListener('click', () => { if (!busy) dialog.close() })
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return
    const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')].filter(node => node.getClientRects().length)
    const first = controls[0]; const last = controls.at(-1)
    if (!first) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
  })
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault() })
  dialog.addEventListener('close', () => open.focus())
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect()
    if (!busy && event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close()
  })
  document.querySelector('#copy-alias').addEventListener('click', async () => {
    const status = document.querySelector('#copy-status')
    try { await navigator.clipboard.writeText(document.querySelector('#transfer-alias').textContent.trim()); status.textContent = 'Alias copiado' }
    catch { status.textContent = 'No pudimos copiarlo. Podés seleccionar y copiar el alias.' }
  })
  yes.addEventListener('click', async () => {
    if (busy) return
    busy = true; yes.disabled = true; no.disabled = true; error.textContent = ''
    try {
      const body = await post('payment-reported')
      if (body.paymentStatus !== 'pending' || !body.paymentReportedAt) throw new Error('No pudimos registrar tu respuesta. Intentá nuevamente.')
      reported = true; state.textContent = 'Pago informado, pendiente de verificación.'; finishWith(reportedMessage)
    } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'No pudimos registrar tu respuesta.' }
    finally { busy = false; yes.disabled = false; no.disabled = false }
  })
  no.addEventListener('click', () => {
    if (!busy) finishWith(reported ? reportedMessage : 'Podés realizar la transferencia cuando quieras. Tu confirmación quedará pendiente hasta verificar el pago.')
  })
  load()
}
