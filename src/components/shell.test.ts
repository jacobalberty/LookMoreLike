import { create } from '@bufbuild/protobuf'
import { AuthMethod, GetAuthConfigResponseSchema } from '@jacobalberty/beenfar-api/beenfar/admin/v1/auth_pb'
import { UserSchema, UserSource } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { flushPromises, mount } from '@vue/test-utils'
import { NDialogProvider, NMessageProvider } from 'naive-ui'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import App from '@/App.vue'
import { clientsKey, routerKey, sessionKey } from '@/context'
import { createRouter, type RouteDef } from '@/router'
import { createSession } from '@/session'
import AppShell from './AppShell.vue'

const page = (text: string) => defineComponent({ render: () => h('p', { 'data-test': 'page' }, text) })
const routes: RouteDef[] = [
  { path: '/devices', title: 'Devices', component: page('devices page'), nav: true, group: 'Devices' },
  { path: '/networks', title: 'Networks', component: page('networks page'), nav: true, group: 'Network' },
  { path: '/users', title: 'Users', component: page('users page'), nav: true, group: 'Admin', admin: true },
]

function fakeWindow(path: string) {
  return {
    location: { pathname: path, search: '' },
    history: { pushState: vi.fn(), replaceState: vi.fn() },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as Window
}

async function setup(opts: { admin: boolean; path?: string; getCurrentUser?: ReturnType<typeof vi.fn> }) {
  const auth = {
    getAuthConfig: vi.fn().mockResolvedValue(create(GetAuthConfigResponseSchema, { passwordLoginEnabled: true })),
    getCurrentUser:
      opts.getCurrentUser ??
      vi.fn().mockResolvedValue({ user: create(UserSchema, { id: 'u', username: 'alice', admin: opts.admin }), method: AuthMethod.OIDC }),
    logout: vi.fn().mockResolvedValue({ redirectUrl: '' }),
  }
  const clients = { auth } as never
  const session = createSession(clients, { navigator: { assign: vi.fn() } })
  const router = createRouter(fakeWindow(opts.path ?? '/devices'))
  await session.load()
  const Root = defineComponent({
    render: () => h(NMessageProvider, null, () => h(NDialogProvider, null, () => h(AppShell, { routes }))),
  })
  const w = mount(Root, { global: { provide: { [clientsKey as symbol]: clients, [sessionKey as symbol]: session, [routerKey as symbol]: router } } })
  await flushPromises()
  return { w, session, router, auth }
}

describe('AppShell', () => {
  it('shows who is signed in and how', async () => {
    const { w } = await setup({ admin: false })
    expect(w.get('[data-test=current-user]').text()).toBe('alice')
    expect(w.get('[data-test=auth-method]').text()).toContain('single sign-on')
    expect(w.text()).not.toContain('admin')
  })

  it('hides admin-only screens from non-admins', async () => {
    const { w } = await setup({ admin: false })
    expect(w.text()).toContain('Devices')
    expect(w.text()).toContain('Networks')
    expect(w.text()).not.toContain('Users')
  })

  it('lists them for admins', async () => {
    const { w } = await setup({ admin: true })
    expect(w.text()).toContain('Users')
    expect(w.text()).toContain('admin')
  })

  it('renders the screen for the current route', async () => {
    const { w } = await setup({ admin: false, path: '/networks' })
    expect(w.get('[data-test=page]').text()).toBe('networks page')
  })

  it('says so for an unknown address', async () => {
    const { w } = await setup({ admin: false, path: '/nope' })
    expect(w.text()).toContain('Page not found')
  })

  it('offers a password change to local users, not to single sign-on users', async () => {
    const { w } = await setup({ admin: false })
    expect(w.find('[data-test=my-password]').exists()).toBe(true)
    const sso = vi.fn().mockResolvedValue({ user: create(UserSchema, { id: 'u', username: 'bob', source: UserSource.OIDC }), method: AuthMethod.OIDC })
    const { w: w2 } = await setup({ admin: false, getCurrentUser: sso })
    expect(w2.find('[data-test=my-password]').exists()).toBe(false)
  })

  it('signs out', async () => {
    const { w, auth, session } = await setup({ admin: false })
    await w.get('[data-test=logout]').trigger('click')
    await flushPromises()
    expect(auth.logout).toHaveBeenCalled()
    expect(session.state.status).toBe('anonymous')
  })
})

describe('App', () => {
  async function mountApp(auth: Record<string, unknown>) {
    const clients = { auth } as never
    const session = createSession(clients, { navigator: { assign: vi.fn() } })
    const router = createRouter(fakeWindow('/'))
    const w = mount(App, { global: { provide: { [clientsKey as symbol]: clients, [sessionKey as symbol]: session, [routerKey as symbol]: router } } })
    await flushPromises()
    return w
  }

  it('says when the controller cannot be reached, and offers a retry', async () => {
    const getAuthConfig = vi.fn().mockRejectedValue(new Error('down'))
    const w = await mountApp({ getAuthConfig })
    expect(w.text()).toContain('Cannot load beenfar')
    getAuthConfig.mockResolvedValue(create(GetAuthConfigResponseSchema, {}))
    await w.get('button').trigger('click')
  })
})
