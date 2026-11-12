import { createApp } from 'vue'
import App from './App.vue'
import { ConfigError, apiBase } from './api/config'
import { createClients } from './api/clients'
import { createTransport } from './api/transport'
import { clientsKey, routerKey, sessionKey } from './context'
import { createRouter } from './router'
import { createSession, type Session } from './session'

const app = createApp(App)

let base: string
try {
  base = apiBase()
} catch (e) {
  if (!(e instanceof ConfigError)) throw e
  // A misconfigured container: say so plainly instead of a blank page.
  document.getElementById('app')!.textContent = `beenfar UI is misconfigured: ${e.message}`
  throw e
}

// The transport reports expired sessions to the session, which needs the
// clients; tie the knot through a closure.
const sessionRef: { current?: Session } = {}
const clients = createClients(createTransport(base, undefined, () => sessionRef.current?.expired()))
const session = createSession(clients, { base })
sessionRef.current = session
const router = createRouter()
router.start()

app.provide(clientsKey, clients).provide(sessionKey, session).provide(routerKey, router)
app.mount('#app')
