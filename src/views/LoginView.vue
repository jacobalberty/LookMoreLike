<script setup lang="ts">
import { NAlert, NButton, NCard, NDivider, NForm, NFormItem, NInput, NSpace } from 'naive-ui'
import { computed, ref } from 'vue'
import { describeError } from '@/api/errors'
import { useRouter, useSession } from '@/context'

const session = useSession()
const router = useRouter()

const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

const config = computed(() => session.state.config)
const providers = computed(() => config.value?.oidcProviders ?? [])
const passwordLogin = computed(() => config.value?.passwordLoginEnabled === true)
const noMethod = computed(() => !passwordLogin.value && providers.value.length === 0 && !session.proxyMode.value)

/** Where to come back to after signing in elsewhere. */
const returnTo = computed(() => router.path + (router.query.size ? '?' + router.query.toString() : ''))

async function submit() {
  if (busy.value || !username.value || !password.value) return
  error.value = ''
  busy.value = true
  try {
    await session.login(username.value, password.value)
    password.value = ''
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="login">
    <n-card title="Sign in to beenfar" class="card" data-test="login">
      <n-space vertical :size="16">
        <n-alert v-if="session.proxyMode.value" type="warning" title="Signed in by a reverse proxy" data-test="proxy-note">
          This controller trusts a reverse proxy to sign users in, so there is no sign-in form. The proxy did not
          identify you for this request; if you expected it to, it is probably misconfigured.
          <n-space class="actions">
            <n-button size="small" @click="session.load()">Try again</n-button>
            <n-button v-if="config?.proxy?.logoutUrl" size="small" tag="a" :href="config.proxy.logoutUrl">
              Go to the proxy
            </n-button>
          </n-space>
        </n-alert>

        <n-form v-if="passwordLogin" data-test="password-form" @submit.prevent="submit">
          <n-form-item label="Username">
            <n-input v-model:value="username" autofocus autocomplete="username" :disabled="busy" />
          </n-form-item>
          <n-form-item label="Password">
            <n-input
              v-model:value="password"
              type="password"
              show-password-on="click"
              autocomplete="current-password"
              :disabled="busy"
              @keydown.enter.prevent="submit"
            />
          </n-form-item>
          <n-alert v-if="error" type="error" class="error" data-test="login-error">{{ error }}</n-alert>
          <n-button type="primary" block attr-type="submit" :loading="busy" :disabled="!username || !password">
            Sign in
          </n-button>
        </n-form>

        <template v-if="providers.length">
          <n-divider v-if="passwordLogin">or</n-divider>
          <n-button
            v-for="p in providers"
            :key="p.id"
            block
            tag="a"
            :href="session.oidcUrl(p, returnTo)"
            data-test="oidc-button"
          >
            Sign in with {{ p.displayName || p.id }}
          </n-button>
        </template>

        <n-alert v-if="noMethod" type="error" title="No sign-in method is enabled" data-test="no-method">
          This controller offers neither password sign-in, single sign-on nor a trusted proxy for the web UI.
          Check its authentication settings.
        </n-alert>
      </n-space>
    </n-card>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.card {
  width: 100%;
  max-width: 380px;
}
.error {
  margin-bottom: 12px;
}
.actions {
  margin-top: 12px;
}
</style>
