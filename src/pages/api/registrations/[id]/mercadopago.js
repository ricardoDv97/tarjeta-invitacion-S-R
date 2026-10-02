export const prerender = false
export function ALL() {
  return new Response(JSON.stringify({ ok: false, message: 'Este servicio de pago fue retirado.' }), { status: 410, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}
