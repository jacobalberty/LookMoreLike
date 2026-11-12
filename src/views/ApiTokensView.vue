<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { ApiTokenSchema, type ApiToken } from '@jacobalberty/beenfar-api/beenfar/admin/v1/api_token_pb'
import type { User } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NSpace,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import { useConfirm } from '@/composables/useConfirm'
import { useLoad } from '@/composables/useLoad'
import { useClients, useSession } from '@/context'
import { formatTime, timeAgo } from '@/format'

const clients = useClients()
const session = useSession()
const message = useMessage()
const confirm = useConfirm()

const { data, loading, error, reload } = useLoad(
  async () => {
    const tokens = (await clients.tokens.listApiTokens({})).apiTokens
    // Admins see everyone's tokens; name their owners (best effort).
    let users: User[] = []
    if (session.isAdmin.value) {
      try {
        users = (await clients.users.listUsers({})).users
      } catch {
        users = []
      }
    }
    return { tokens, users }
  },
  { tokens: [] as ApiToken[], users: [] as User[] },
)
const failure = ref('')

const ownerName = (id: string) => (id === session.state.user?.id ? 'you' : (data.value.users.find((u) => u.id === id)?.username ?? id))

// --- creating ---

const expiryOptions = [
  { label: 'Never expires', value: 0 },
  { label: 'In 30 days', value: 30 },
  { label: 'In 90 days', value: 90 },
  { label: 'In 1 year', value: 365 },
]
const creating = ref(false)
const name = ref('')
const days = ref(0)
const busy = ref(false)
const createError = ref('')
/** The new token's secret. Held only while the "copy it now" dialog is open. */
const secret = ref('')
const created = ref<ApiToken>()

function openCreate() {
  name.value = ''
  days.value = 0
  createError.value = ''
  creating.value = true
}

async function createToken() {
  if (busy.value) return
  if (!name.value.trim()) {
    createError.value = 'Give the token a name, such as "terraform-ci".'
    return
  }
  busy.value = true
  createError.value = ''
  try {
    const expireTime = days.value ? timestampFromDate(new Date(Date.now() + days.value * 86400_000)) : undefined
    const res = await clients.tokens.createApiToken({ apiToken: create(ApiTokenSchema, { name: name.value.trim(), expireTime }) })
    secret.value = res.secret
    created.value = res.apiToken
    creating.value = false
    await reload()
  } catch (e) {
    createError.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(secret.value)
    message.success('Copied')
  } catch {
    message.warning('Could not copy automatically. Select the token and copy it.')
  }
}

/** Forgets the secret for good: it cannot be read back from beenfar. */
function done() {
  secret.value = ''
  created.value = undefined
}

// --- revoking ---

async function revoke(t: ApiToken) {
  const ok = await confirm({
    title: 'Revoke this token?',
    content: `Anything using "${t.name}" (${t.prefix}…) stops working immediately.`,
    action: 'Revoke',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.tokens.deleteApiToken({ id: t.id })
    message.success(`Revoked ${t.name}`)
  } catch (e) {
    failure.value = `Could not revoke ${t.name}: ${describeError(e)}`
  } finally {
    await reload()
  }
}

const columns = computed<DataTableColumns<ApiToken>>(() => [
  { title: 'Name', key: 'name' },
  { title: 'Token', key: 'prefix', render: (t) => h('code', `${t.prefix}…`) },
  ...(session.isAdmin.value ? [{ title: 'Owner', key: 'userId', render: (t: ApiToken) => ownerName(t.userId) }] : []),
  { title: 'Expires', key: 'expireTime', render: (t) => (t.expireTime ? formatTime(t.expireTime) : 'never') },
  { title: 'Last used', key: 'lastUsedTime', render: (t) => h('span', { title: formatTime(t.lastUsedTime) }, timeAgo(t.lastUsedTime)) },
  { title: 'Created', key: 'createTime', render: (t) => formatTime(t.createTime) },
  {
    title: '',
    key: 'actions',
    render: (t) => h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'revoke', onClick: () => revoke(t) }, () => 'Revoke'),
  },
])
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>API tokens</h2>
      <n-space>
        <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
        <n-button type="primary" data-test="new" @click="openCreate()">New token</n-button>
      </n-space>
    </n-space>
    <p>
      Tokens let scripts and tools such as Terraform act as you: send one as <code>Authorization: Bearer …</code>. A
      token's secret is shown once, when it is created.
    </p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="revoke-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="data.tokens" :loading="loading" :bordered="false" :row-key="(t: ApiToken) => t.id" />
    <p v-if="!loading && !error && data.tokens.length === 0" data-test="empty">No tokens yet.</p>

    <n-modal v-model:show="creating" preset="card" title="New API token" style="width: 480px; max-width: 95vw" :mask-closable="false" data-test="create-dialog">
      <n-form label-placement="top" @submit.prevent="createToken()">
        <n-form-item label="Name" feedback="What it is for, e.g. terraform-ci.">
          <n-input v-model:value="name" autofocus data-test="t-name" @keydown.enter.prevent="createToken()" />
        </n-form-item>
        <n-form-item label="Expiry">
          <n-select v-model:value="days" :options="expiryOptions" data-test="t-expiry" />
        </n-form-item>
        <n-alert v-if="createError" type="error" data-test="create-error">{{ createError }}</n-alert>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button :disabled="busy" @click="creating = false">Cancel</n-button>
          <n-button type="primary" :loading="busy" data-test="create" @click="createToken()">Create token</n-button>
        </n-space>
      </template>
    </n-modal>

    <n-modal :show="secret !== ''" preset="card" title="Copy your new token" style="width: 560px; max-width: 95vw" :mask-closable="false" :close-on-esc="false" :closable="false" data-test="secret-dialog">
      <n-space vertical :size="12">
        <n-alert type="warning" title="This is the only time it is shown">
          Copy "{{ created?.name }}" now and keep it somewhere safe. beenfar stores only a hash of it, so it cannot be
          shown again; if it is lost, revoke it and create another.
        </n-alert>
        <n-input :value="secret" readonly data-test="secret" @focus="($event.target as HTMLInputElement).select()" />
      </n-space>
      <template #footer>
        <n-space justify="end">
          <n-button data-test="copy" @click="copy()">Copy</n-button>
          <n-button type="primary" data-test="done" @click="done()">I have copied it</n-button>
        </n-space>
      </template>
    </n-modal>
  </n-space>
</template>
