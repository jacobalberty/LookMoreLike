import type { RouteDef } from './router'

/**
 * The screens. Each is loaded on demand. Admin-only ones are hidden from
 * other users' navigation; the controller refuses their RPCs regardless.
 */
export const routes: RouteDef[] = []

/** Where "/" goes. */
export const homePath = '/'
