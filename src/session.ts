import { Code, ConnectError } from '@connectrpc/connect'
import {
  AuthMethod,
  type GetAuthConfigResponse,
  type OidcProvider,
} from '@jacobalberty/beenfar-api/beenfar/admin/v1/auth_pb'
import type { User } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { computed, reactive } from 'vue'
import { apiPath } from './api/config'
import type { Clients } from './api/clients'
import { describeError } from './api/errors'

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated' | 'error'

/** How a request was authenticated, for display. */
export function methodLabel(m: AuthMethod | undefined): string {
  switch (m) {
    case AuthMethod.SESSION:
      return 'password'
    case AuthMethod.OIDC:
      return 'single sign-on (OpenID Connect)'
    case AuthMethod.PROXY:
      return 'reverse proxy'
    case AuthMethod.BASIC:
      return 'HTTP Basic'
    case AuthMethod.TOKEN:
      return 'API token'
    default:
      return 'unknown'
  }
}

interface Navigator {
  assign(url: string): void
}

/**
 * The signed-in user and how to sign in or out, driven by what the
 * controller says it offers (GetAuthConfig).
 */
export function createSession(
  clients: Pick<Clients, 'auth'>,
  opts: { navigator?: Navigator; base?: string } = {},
) {
  const nav = opts.navigator ?? window.location
  const state = reactive<{
    status: SessionStatus
    user?: User
    method?: AuthMethod
    config?: GetAuthConfigResponse
    error?: string
  }>({ status: 'loading' })

  /** Loads the sign-in options and, if there is a session, the user. */
  async function load(): Promise<void> {
    state.status = 'loading'
    state.error = undefined
    try {
      state.config = await clients.auth.getAuthConfig({})
    } catch (e) {
      state.status = 'error'
      state.error = describeError(e)
      return
    }
    try {
      const me = await clients.auth.getCurrentUser({})
      state.user = me.user
      state.method = me.method
      state.status = 'authenticated'
    } catch (e) {
      if (ConnectError.from(e).code === Code.Unauthenticated) {
        state.user = undefined
        state.method = undefined
        state.status = 'anonymous'
      } else {
        state.status = 'error'
        state.error = describeError(e)
      }
    }
  }

  /** Signs in with a password. Throws the API's error on bad credentials. */
  async function login(username: string, password: string): Promise<void> {
    const res = await clients.auth.login({ username, password })
    state.user = res.user
    state.method = AuthMethod.SESSION
    state.status = 'authenticated'
  }

  /**
   * Ends the session. When the controller (or, in proxy mode, the
   * configuration) names a sign-out URL, the browser goes there too.
   *
   * Only "there is no session any more" counts as signed out. Any other
   * failure (the network, a server error) means the session and its cookie may
   * still be valid, so the user stays signed in and the error is thrown for
   * the screen to show, with the button still there to retry.
   */
  async function logout(): Promise<void> {
    let target = state.config?.proxy?.logoutUrl ?? ''
    try {
      const res = await clients.auth.logout({})
      target = res.redirectUrl || target
    } catch (e) {
      if (ConnectError.from(e).code !== Code.Unauthenticated) throw e
    }
    state.user = undefined
    state.method = undefined
    state.status = 'anonymous'
    if (target) nav.assign(target)
  }

  /** The URL that starts an OIDC login and returns to `returnTo` afterwards. */
  function oidcUrl(p: OidcProvider, returnTo = '/'): string {
    return apiPath(p.loginUrl, opts.base) + '?redirect=' + encodeURIComponent(returnTo)
  }

  /** Marks the session over when any call reports UNAUTHENTICATED. */
  function expired(): void {
    if (state.status !== 'authenticated') return
    state.user = undefined
    state.method = undefined
    state.status = 'anonymous'
  }

  return {
    state,
    isAdmin: computed(() => state.user?.admin === true),
    /** Proxy mode: a trusted proxy signs users in, so there is no login form. */
    proxyMode: computed(() => state.config?.proxy !== undefined),
    load,
    login,
    logout,
    oidcUrl,
    expired,
  }
}

export type Session = ReturnType<typeof createSession>
