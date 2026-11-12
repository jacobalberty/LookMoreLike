import { inject, type InjectionKey } from 'vue'
import type { Clients } from './api/clients'
import type { Router } from './router'
import type { Session } from './session'

export const clientsKey: InjectionKey<Clients> = Symbol('clients')
export const sessionKey: InjectionKey<Session> = Symbol('session')
export const routerKey: InjectionKey<Router> = Symbol('router')

function need<T>(key: InjectionKey<T>): T {
  const v = inject(key)
  if (!v) throw new Error(`${String(key.description)} is not provided`)
  return v
}

export const useClients = (): Clients => need(clientsKey)
export const useSession = (): Session => need(sessionKey)
export const useRouter = (): Router => need(routerKey)
