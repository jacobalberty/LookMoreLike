import { defineAsyncComponent } from 'vue'
import type { RouteDef } from './router'

const view = (load: () => Promise<{ default: object }>) => defineAsyncComponent(load as never)

/**
 * The screens. Each is loaded on demand. Admin-only ones are hidden from
 * other users' navigation; the controller refuses their RPCs regardless.
 */
export const routes: RouteDef[] = [
  {
    path: '/devices/pending',
    title: 'Pending devices',
    group: 'Devices',
    nav: true,
    component: view(() => import('./views/PendingDevicesView.vue')),
  },
  {
    path: '/devices',
    title: 'Devices',
    group: 'Devices',
    nav: true,
    component: view(() => import('./views/DevicesView.vue')),
  },
  {
    path: '/networks',
    title: 'Networks',
    group: 'Network',
    nav: true,
    component: view(() => import('./views/NetworksView.vue')),
  },
  {
    path: '/switch-ports',
    title: 'Switch ports',
    group: 'Devices',
    nav: true,
    component: view(() => import('./views/SwitchPortsView.vue')),
  },
  {
    path: '/wifi',
    title: 'Wifi networks',
    group: 'Network',
    nav: true,
    component: view(() => import('./views/WifiNetworksView.vue')),
  },
  {
    path: '/radius',
    title: 'RADIUS servers',
    group: 'Network',
    nav: true,
    component: view(() => import('./views/RadiusServersView.vue')),
  },
  {
    path: '/tokens',
    title: 'API tokens',
    group: 'Access',
    nav: true,
    component: view(() => import('./views/ApiTokensView.vue')),
  },
  {
    path: '/users',
    title: 'Users',
    group: 'Access',
    nav: true,
    admin: true,
    component: view(() => import('./views/UsersView.vue')),
  },
  {
    path: '/adapters',
    title: 'Adapters',
    group: 'Access',
    nav: true,
    admin: true,
    component: view(() => import('./views/AdaptersView.vue')),
  },
]

/** Where "/" goes. */
export const homePath = '/devices/pending'
