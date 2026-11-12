import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import {
  AuthMethod,
  GetAuthConfigResponseSchema,
  OidcProviderSchema,
  ProxyAuthSchema,
} from '@jacobalberty/beenfar-api/beenfar/admin/v1/auth_pb'
import { UserSchema } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App.vue'
import { clientsKey, routerKey, sessionKey } from '@/context'
import { createRouter } from '@/router'
import { createSession } from '@/session'

const corp = create(OidcProviderSchema, { id: 'corp', displayName: 'Corp SSO', loginUrl: '/auth/oidc/corp/login' })
const other = create(OidcProviderSchema, { id: 'gh', displayName: '', loginUrl: '/auth/oidc/gh/login' })

async function open(config: Parameters<typeof create<typeof GetAuthConfigResponseSchema>>[1], over: Record<string, unknown> = {}, path = '/networks') {
  const auth = {
    getAuthConfig: vi.fn().mockResolvedValue(create(GetAuthConfigResponseSchema, config)),
    getCurrentUser: vi.fn().mockRejectedValue(new ConnectError('sign in', Code.Unauthenticated)),
    login: vi.fn().mockResolvedValue({ user: create(UserSchema, { id: 'u', username: 'alice' }) }),
    logout: vi.fn().mockResolvedValue({ redirectUrl: '' }),
    ...over,
  }
  const clients = { auth } as never
  const session = createSession(clients, { navigator: { assign: vi.fn() } })
  const win = { location: { pathname: path, search: '?a=1' }, history: { pushState: vi.fn(), replaceState: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as Window
  const w = mount(App, { global: { provide: { [clientsKey as symbol]: clients, [sessionKey as symbol]: session, [routerKey as symbol]: createRouter(win) } } })
  await flushPromises()
  return { w, auth, session }
}

describe('login screen', () => {
  it('shows a password form when password login is enabled', async () => {
    const { w } = await open({ passwordLoginEnabled: true })
    expect(w.find('[data-test=password-form]').exists()).toBe(true)
    expect(w.find('[data-test=oidc-button]').exists()).toBe(false)
    expect(w.find('[data-test=no-method]').exists()).toBe(false)
  })

  it('signs in with the typed credentials', async () => {
    const { w, auth, session } = await open({ passwordLoginEnabled: true })
    const inputs = w.findAll('input')
    await inputs[0]!.setValue('alice')
    await inputs[1]!.setValue('correct horse')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(auth.login).toHaveBeenCalledWith({ username: 'alice', password: 'correct horse' })
    expect(session.state.status).toBe('authenticated')
  })

  it('shows why sign-in failed and keeps the form', async () => {
    const bad = new ConnectError('invalid username or password', Code.Unauthenticated)
    const { w, session } = await open({ passwordLoginEnabled: true }, { login: vi.fn().mockRejectedValue(bad) })
    const inputs = w.findAll('input')
    await inputs[0]!.setValue('alice')
    await inputs[1]!.setValue('nope')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.get('[data-test=login-error]').text()).toContain('invalid username or password')
    expect(session.state.status).toBe('anonymous')
  })

  it('does not offer to submit an empty form', async () => {
    const { w, auth } = await open({ passwordLoginEnabled: true })
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('offers one button per OIDC provider, returning here afterwards', async () => {
    const { w } = await open({ passwordLoginEnabled: false, oidcProviders: [corp, other] })
    const buttons = w.findAll('[data-test=oidc-button]')
    expect(buttons.map((b) => b.text())).toEqual(['Sign in with Corp SSO', 'Sign in with gh'])
    expect(buttons[0]!.attributes('href')).toBe('/auth/oidc/corp/login?redirect=%2Fnetworks%3Fa%3D1')
    expect(w.find('[data-test=password-form]').exists()).toBe(false)
  })

  it('shows both when both are enabled', async () => {
    const { w } = await open({ passwordLoginEnabled: true, oidcProviders: [corp] })
    expect(w.find('[data-test=password-form]').exists()).toBe(true)
    expect(w.findAll('[data-test=oidc-button]')).toHaveLength(1)
  })

  it('shows no form in proxy mode, and explains', async () => {
    const { w } = await open({ proxy: create(ProxyAuthSchema, { logoutUrl: 'https://auth.example/sign_out' }) })
    expect(w.find('[data-test=password-form]').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
    expect(w.get('[data-test=proxy-note]').text()).toContain('reverse proxy')
    expect(w.find('[data-test=no-method]').exists()).toBe(false)
  })

  it('says so when nothing is enabled', async () => {
    const { w } = await open({})
    expect(w.find('[data-test=no-method]').exists()).toBe(true)
  })

  it('signs the user straight in when the session already exists', async () => {
    const me = vi.fn().mockResolvedValue({ user: create(UserSchema, { id: 'u', username: 'alice' }), method: AuthMethod.SESSION })
    const { w } = await open({ passwordLoginEnabled: true }, { getCurrentUser: me })
    expect(w.find('[data-test=login]').exists()).toBe(false)
    expect(w.find('[data-test=current-user]').text()).toBe('alice')
  })
})
