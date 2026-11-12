<script setup lang="ts">
import { NButton, NLayout, NLayoutContent, NLayoutHeader, NLayoutSider, NMenu, NSpace, NTag, type MenuOption } from 'naive-ui'
import { UserSource } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { computed, h, ref, watchEffect } from 'vue'
import PasswordDialog from './PasswordDialog.vue'
import AppLink from './AppLink.vue'
import { useRouter, useSession } from '@/context'
import { methodLabel } from '@/session'
import { homePath, routes as appRoutes } from '@/routes'
import { findRoute, visibleRoutes, type RouteDef } from '@/router'
import AdminOnly from '@/views/AdminOnly.vue'
import NotFound from '@/views/NotFound.vue'

const props = withDefaults(defineProps<{ routes?: readonly RouteDef[] }>(), { routes: () => appRoutes })

const router = useRouter()
const session = useSession()
const current = computed(() => findRoute(props.routes, router.path))

const menu = computed<MenuOption[]>(() => {
  const out: MenuOption[] = []
  const groups = new Map<string, MenuOption>()
  for (const r of visibleRoutes(props.routes, session.isAdmin.value)) {
    const item: MenuOption = { key: r.path, label: () => h(AppLink, { to: r.path }, () => r.title) }
    if (!r.group) {
      out.push(item)
      continue
    }
    let group = groups.get(r.group)
    if (!group) {
      group = { type: 'group', label: r.group, key: r.group, children: [] }
      groups.set(r.group, group)
      out.push(group)
    }
    group.children?.push(item)
  }
  return out
})

// "/" is not a screen: go to the first one.
watchEffect(() => {
  if (router.path === '/') router.navigate(homePath, { replace: true })
})

/** Users who sign in with a password here can change it; others have none. */
const canChangePassword = computed(() => {
  const s = session.state.user?.source
  return s === UserSource.LOCAL || s === UserSource.UNSPECIFIED
})
const changingPassword = ref(false)

/**
 * Admin-only screens are refused up front for other users, so they never
 * load (and fail) just because someone typed the address. The controller
 * enforces this too; this is only so the page says so.
 */
const view = computed(() => {
  const r = current.value
  if (!r) return NotFound
  if (r.admin && !session.isAdmin.value) return AdminOnly
  return r.component
})
</script>

<template>
  <n-layout has-sider position="absolute">
    <n-layout-sider bordered :width="220" content-style="padding: 12px 0">
      <div class="brand">beenfar</div>
      <n-menu :options="menu" :value="router.path" />
    </n-layout-sider>
    <n-layout>
      <n-layout-header bordered class="header">
        <n-space align="center" justify="end">
          <span data-test="current-user">{{ session.state.user?.username }}</span>
          <n-tag v-if="session.isAdmin.value" size="small" type="info">admin</n-tag>
          <n-tag size="small" data-test="auth-method">signed in via {{ methodLabel(session.state.method) }}</n-tag>
          <n-button v-if="canChangePassword" size="small" data-test="my-password" @click="changingPassword = true">Password</n-button>
          <n-button size="small" data-test="logout" @click="session.logout()">Sign out</n-button>
        </n-space>
      </n-layout-header>
      <n-layout-content content-style="padding: 24px" :native-scrollbar="false" class="content">
        <component :is="view" />
      </n-layout-content>
    </n-layout>
    <password-dialog
      v-if="session.state.user"
      v-model:show="changingPassword"
      :user-id="session.state.user.id"
      :username="session.state.user.username"
      self
    />
  </n-layout>
</template>

<style scoped>
.brand {
  padding: 16px 24px;
  font-size: 18px;
  font-weight: 600;
}
.header {
  padding: 10px 24px;
}
.content {
  top: 53px;
  bottom: 0;
  position: absolute;
  width: 100%;
}
</style>
