import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import {
  AuthMethod,
  GetAuthConfigResponseSchema,
  OidcProviderSchema,
  ProxyAuthSchema,
} from '@jacobalberty/beenfar-api/beenfar/admin/v1/auth_pb'
import { UserSchema } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { describe, expect, it, vi } from 'vitest'
import { createSession, methodLabel } from './session'

const alice = create(UserSchema, { id: 'u1', username: 'alice', admin: false })

function fakeAuth(over: Record<string, unknown> = {}) {
  return {
    getAuthConfig: vi.fn().mockResolvedValue(create(GetAuthConfigResponseSchema, { passwordLoginEnabled: true })),
    getCurrentUser: vi.fn().mockResolvedValue({ user: alice, method: AuthMethod.SESSION }),
    login: vi.fn().mockResolvedValue({ user: alice }),
    logout: vi.fn().mockResolvedValue({ redirectUrl: '' }),
    ...over,
  }
}
const make = (auth: ReturnType<typeof fakeAuth>, assign = vi.fn(), base = '') =>
  createSession({ auth } as never, { navigator: { assign }, base })

describe('load', () => {
  it('finds the signed-in user and how they signed in', async () => {
    const s = make(fakeAuth())
    await s.load()
    expect(s.state.status).toBe('authenticated')
    expect(s.state.user?.username).toBe('alice')
    expect(s.state.method).toBe(AuthMethod.SESSION)
    expect(s.isAdmin.value).toBe(false)
  })

  it('is anonymous, with the sign-in options, when there is no session', async () => {
    const s = make(fakeAuth({ getCurrentUser: vi.fn().mockRejectedValue(new ConnectError('no', Code.Unauthenticated)) }))
    await s.load()
    expect(s.state.status).toBe('anonymous')
    expect(s.state.config?.passwordLoginEnabled).toBe(true)
  })

  it('reports an unreachable controller instead of showing a login form', async () => {
    const s = make(fakeAuth({ getAuthConfig: vi.fn().mockRejectedValue(new ConnectError('x', Code.Unavailable)) }))
    await s.load()
    expect(s.state.status).toBe('error')
    expect(s.state.error).toMatch(/reach/)
  })

  it('does not mistake other errors for being signed out', async () => {
    const s = make(fakeAuth({ getCurrentUser: vi.fn().mockRejectedValue(new ConnectError('x', Code.Internal)) }))
    await s.load()
    expect(s.state.status).toBe('error')
  })

  it('knows admins', async () => {
    const admin = create(UserSchema, { id: 'u2', username: 'root', admin: true })
    const s = make(fakeAuth({ getCurrentUser: vi.fn().mockResolvedValue({ user: admin, method: AuthMethod.OIDC }) }))
    await s.load()
    expect(s.isAdmin.value).toBe(true)
  })
})

describe('login', () => {
  it('signs in with a password', async () => {
    const auth = fakeAuth()
    const s = make(auth)
    await s.login('alice', 'pw')
    expect(auth.login).toHaveBeenCalledWith({ username: 'alice', password: 'pw' })
    expect(s.state.status).toBe('authenticated')
    expect(s.state.method).toBe(AuthMethod.SESSION)
  })

  it('stays signed out on bad credentials and lets the screen show why', async () => {
    const bad = new ConnectError('invalid username or password', Code.Unauthenticated)
    const s = make(fakeAuth({ login: vi.fn().mockRejectedValue(bad) }))
    await expect(s.login('alice', 'nope')).rejects.toBe(bad)
    expect(s.state.status).not.toBe('authenticated')
    expect(s.state.user).toBeUndefined()
  })
})

describe('OIDC', () => {
  const corp = create(OidcProviderSchema, { id: 'corp', displayName: 'Corp', loginUrl: '/auth/oidc/corp/login' })

  it('starts the flow at the API and returns to the current page', () => {
    expect(make(fakeAuth()).oidcUrl(corp, '/networks?x=1')).toBe('/auth/oidc/corp/login?redirect=%2Fnetworks%3Fx%3D1')
  })

  it('goes through the API prefix', () => {
    expect(make(fakeAuth(), vi.fn(), '/beenfar-api').oidcUrl(corp)).toBe('/beenfar-api/auth/oidc/corp/login?redirect=%2F')
  })
})

describe('logout', () => {
  it('signs out and stays in the app when there is nowhere else to go', async () => {
    const assign = vi.fn()
    const s = make(fakeAuth(), assign)
    await s.load()
    await s.logout()
    expect(s.state.status).toBe('anonymous')
    expect(s.state.user).toBeUndefined()
    expect(assign).not.toHaveBeenCalled()
  })

  it('follows the redirect the controller gives (OIDC end-session)', async () => {
    const assign = vi.fn()
    const s = make(fakeAuth({ logout: vi.fn().mockResolvedValue({ redirectUrl: 'https://idp.example/logout' }) }), assign)
    await s.load()
    await s.logout()
    expect(assign).toHaveBeenCalledWith('https://idp.example/logout')
  })

  it("in proxy mode goes to the proxy's sign-out URL", async () => {
    const assign = vi.fn()
    const cfg = create(GetAuthConfigResponseSchema, { proxy: create(ProxyAuthSchema, { logoutUrl: 'https://auth.example/sign_out' }) })
    const s = make(fakeAuth({ getAuthConfig: vi.fn().mockResolvedValue(cfg) }), assign)
    await s.load()
    expect(s.proxyMode.value).toBe(true)
    await s.logout()
    expect(assign).toHaveBeenCalledWith('https://auth.example/sign_out')
  })

  it('stays signed in, and says why, when signing out fails', async () => {
    const assign = vi.fn()
    const down = new ConnectError('unavailable', Code.Unavailable)
    const s = make(fakeAuth({ logout: vi.fn().mockRejectedValue(down) }), assign)
    await s.load()
    await expect(s.logout()).rejects.toBe(down)
    // The session and its cookie may still be valid: do not pretend they ended.
    expect(s.state.status).toBe('authenticated')
    expect(s.state.user?.username).toBe('alice')
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not follow a sign-out URL when signing out failed', async () => {
    const assign = vi.fn()
    const cfg = create(GetAuthConfigResponseSchema, { proxy: create(ProxyAuthSchema, { logoutUrl: 'https://auth.example/sign_out' }) })
    const s = make(fakeAuth({ getAuthConfig: vi.fn().mockResolvedValue(cfg), logout: vi.fn().mockRejectedValue(new Error('boom')) }), assign)
    await s.load()
    await expect(s.logout()).rejects.toThrow('boom')
    expect(assign).not.toHaveBeenCalled()
  })

  it('treats "there is no session" as already signed out', async () => {
    const s = make(fakeAuth({ logout: vi.fn().mockRejectedValue(new ConnectError('no session', Code.Unauthenticated)) }))
    await s.load()
    await s.logout()
    expect(s.state.status).toBe('anonymous')
  })

  it('can sign out again after a failure', async () => {
    const logout = vi.fn().mockRejectedValueOnce(new ConnectError('x', Code.Unavailable)).mockResolvedValueOnce({ redirectUrl: '' })
    const s = make(fakeAuth({ logout }))
    await s.load()
    await expect(s.logout()).rejects.toBeDefined()
    await s.logout()
    expect(s.state.status).toBe('anonymous')
  })
})

describe('methodLabel', () => {
  it('names every way of signing in', () => {
    for (const m of [AuthMethod.SESSION, AuthMethod.OIDC, AuthMethod.PROXY, AuthMethod.BASIC, AuthMethod.TOKEN]) {
      expect(methodLabel(m)).not.toBe('unknown')
    }
    expect(methodLabel(AuthMethod.UNSPECIFIED)).toBe('unknown')
  })
})
