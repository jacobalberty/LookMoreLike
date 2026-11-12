import { flushPromises, mount } from '@vue/test-utils'
import { NDialogProvider, NMessageProvider } from 'naive-ui'
import { defineComponent, h, type Component } from 'vue'
import { clientsKey, routerKey, sessionKey } from './context'
import { createRouter } from './router'
import { createSession } from './session'

/** A stand-in for window, for the router. */
export function fakeWindow(path = '/', search = ''): Window {
  return {
    location: { pathname: path, search },
    history: { pushState: () => {}, replaceState: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Window
}

/**
 * Mounts a screen as the app does: inside the Naive UI providers and with the
 * injected clients, session and router. `clients` are fakes; only what the
 * screen calls needs to exist.
 */
export async function mountView(view: Component, clients: Record<string, unknown>, opts: { path?: string; props?: Record<string, unknown> } = {}) {
  const typed = clients as never
  const session = createSession({ auth: {} } as never, { navigator: { assign: () => {} } })
  const router = createRouter(fakeWindow(opts.path))
  const Root = defineComponent({
    render: () => h(NMessageProvider, null, () => h(NDialogProvider, null, () => h(view, opts.props ?? {}))),
  })
  const w = mount(Root, {
    attachTo: document.body,
    global: { provide: { [clientsKey as symbol]: typed, [sessionKey as symbol]: session, [routerKey as symbol]: router } },
  })
  await flushPromises()
  return { w, session, router }
}
