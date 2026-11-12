import { createConnectTransport } from '@connectrpc/connect-web'
import type { Transport } from '@connectrpc/connect'
import { apiBase } from './config'

/**
 * The Connect transport to beenfar. Requests carry the session cookie
 * (fetch sends same-origin credentials by default) and no other credentials:
 * the UI never handles tokens or passwords beyond the login form.
 */
export function createTransport(base: string = apiBase(), fetchImpl?: typeof fetch): Transport {
  return createConnectTransport({
    baseUrl: base === '' ? '/' : base,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })
}
