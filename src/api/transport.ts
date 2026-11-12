import { Code, ConnectError, type Interceptor, type Transport } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { apiBase } from './config'

/**
 * The Connect transport to beenfar. Requests carry the session cookie
 * (fetch sends same-origin credentials by default) and no other credentials:
 * the UI never handles tokens or passwords beyond the login form.
 *
 * onUnauthenticated runs when the controller answers UNAUTHENTICATED (the
 * session expired), so the app can return to the sign-in screen; the error
 * still reaches the caller.
 */
export function createTransport(
  base: string = apiBase(),
  fetchImpl?: typeof fetch,
  onUnauthenticated?: () => void,
): Transport {
  const interceptors: Interceptor[] = []
  if (onUnauthenticated) {
    interceptors.push((next) => async (req) => {
      try {
        return await next(req)
      } catch (e) {
        if (ConnectError.from(e).code === Code.Unauthenticated) onUnauthenticated()
        throw e
      }
    })
  }
  return createConnectTransport({
    baseUrl: base === '' ? '/' : base,
    interceptors,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  })
}
