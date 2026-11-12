import { computed, reactive, type Component, type ComputedRef } from 'vue'

/**
 * A small history-API router: the UI has about a dozen flat routes, so
 * vue-router (and its dependencies) is not needed. Create/edit forms are
 * dialogs on the list pages, so routes carry no parameters.
 */
export interface RouteDef {
  /** Absolute path without a trailing slash; "/" is the root. */
  path: string
  title: string
  component: Component
  /** Shown only to, and callable only by, admins. */
  admin?: boolean
  /** Listed in the navigation. */
  nav?: boolean
  /** Navigation group heading. */
  group?: string
}

export function normalizePath(path: string): string {
  const p = path.replace(/\/+$/, '')
  return p === '' ? '/' : p
}

export function findRoute(routes: readonly RouteDef[], path: string): RouteDef | undefined {
  const p = normalizePath(path)
  return routes.find((r) => r.path === p)
}

/** The routes a user may see in the navigation. The server enforces admin-only RPCs regardless. */
export function visibleRoutes(routes: readonly RouteDef[], isAdmin: boolean): RouteDef[] {
  return routes.filter((r) => r.nav && (!r.admin || isAdmin))
}

export interface Router {
  readonly path: string
  readonly query: URLSearchParams
  navigate(to: string, opts?: { replace?: boolean }): void
  /** Starts following the browser's back/forward buttons; returns a stop function. */
  start(): () => void
  current(routes: readonly RouteDef[]): ComputedRef<RouteDef | undefined>
}

type Win = Pick<Window, 'location' | 'history' | 'addEventListener' | 'removeEventListener'>

export function createRouter(win: Win = window): Router {
  const state = reactive({ path: normalizePath(win.location.pathname), search: win.location.search })
  const sync = () => {
    state.path = normalizePath(win.location.pathname)
    state.search = win.location.search
  }
  return {
    get path() {
      return state.path
    },
    get query() {
      return new URLSearchParams(state.search)
    },
    navigate(to, opts) {
      if (opts?.replace) win.history.replaceState(null, '', to)
      else win.history.pushState(null, '', to)
      sync()
    },
    start() {
      win.addEventListener('popstate', sync)
      return () => win.removeEventListener('popstate', sync)
    },
    current(routes) {
      return computed(() => findRoute(routes, state.path))
    },
  }
}
