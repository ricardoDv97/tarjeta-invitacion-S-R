import { transferOperation, transferMethodNotAllowed } from '../../../../lib/transferPayment.js'
export const prerender = false
export const POST = context => transferOperation(context, true)
export const ALL = transferMethodNotAllowed
