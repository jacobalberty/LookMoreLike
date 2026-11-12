import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { createRouter, findRoute, normalizePath, visibleRoutes, type RouteDef } from './router'

const C = defineComponent({ render: () => null })
const routes: RouteDef[] = [
  { path: '/', title: 'Home', component: C },
  { path: '/devices', title: 'Devices', component: C, nav: true },
  { path: '/users', title: 'Users', component: C, nav: true, admin: true },
  { path: '/hidden', title: 'Hidden', component: C },
]

function fakeWindow(url: string) {
  const u = new URL(url, 'http://beenfar.test')
  const listeners = new Set<() => void>()
  const win = {
    location: { pathname: u.pathname, search: u.search },
    history: {
      pushState: (_: unknown, __: string, to: string) => setLocation(to),
      replaceState: (_: unknown, __: string, to: string) => setLocation(to),
    },
    addEventListener: (_: string, f: () => void) => listeners.add(f),
    removeEventListener: (_: string, f: () => void) => listeners.delete(f),
  }
  const setLocation = (to: string) => {
    const n = new URL(to, 'http://beenfar.test')
    win.location.pathname = n.pathname
    win.location.search = n.search
  }
  return { win: win as unknown as Window, setLocation, fire: () => listeners.forEach((f) => f()), listeners }
}

describe('routes', () => {
  it('normalizes paths', () => {
    expect(normalizePath('/devices/')).toBe('/devices')
    expect(normalizePath('')).toBe('/')
    expect(normalizePath('/')).toBe('/')
  })

  it('finds exact routes only', () => {
    expect(findRoute(routes, '/devices/')?.title).toBe('Devices')
    expect(findRoute(routes, '/devices/x')).toBeUndefined()
    expect(findRoute(routes, '/nope')).toBeUndefined()
  })

  it('hides admin screens from non-admins, and unlisted routes from everyone', () => {
    expect(visibleRoutes(routes, false).map((r) => r.path)).toEqual(['/devices'])
    expect(visibleRoutes(routes, true).map((r) => r.path)).toEqual(['/devices', '/users'])
  })
})

describe('router', () => {
  it('starts at the current location', () => {
    const { win } = fakeWindow('/devices?device=d1')
    const r = createRouter(win)
    expect(r.path).toBe('/devices')
    expect(r.query.get('device')).toBe('d1')
  })

  it('navigates with the history API and tracks the route', () => {
    const { win } = fakeWindow('/')
    const r = createRouter(win)
    const cur = r.current(routes)
    expect(cur.value?.title).toBe('Home')
    r.navigate('/users')
    expect(r.path).toBe('/users')
    expect(cur.value?.title).toBe('Users')
    r.navigate('/devices?x=1', { replace: true })
    expect(r.path).toBe('/devices')
    expect(r.query.get('x')).toBe('1')
  })

  it('follows back and forward, until stopped', () => {
    const { win, setLocation, fire, listeners } = fakeWindow('/devices')
    const r = createRouter(win)
    const stop = r.start()
    setLocation('/users')
    fire()
    expect(r.path).toBe('/users')
    stop()
    expect(listeners.size).toBe(0)
  })

  it('has no route for unknown paths', () => {
    const { win } = fakeWindow('/missing')
    expect(createRouter(win).current(routes).value).toBeUndefined()
  })
})
