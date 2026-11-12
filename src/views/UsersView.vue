<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { UserSchema, UserSource, type User } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSpace,
  NSwitch,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import EditorModal from '@/components/EditorModal.vue'
import PasswordDialog from '@/components/PasswordDialog.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useEditor } from '@/composables/useEditor'
import { useLoad } from '@/composables/useLoad'
import { useClients, useSession } from '@/context'
import { formatTime } from '@/format'
import { userFields } from '@/forms/defs'

const clients = useClients()
const session = useSession()
const message = useMessage()
const confirm = useConfirm()

const { data, loading, error, reload } = useLoad(async () => (await clients.users.listUsers({})).users, [] as User[])
const failure = ref('')

const sourceLabel = (s: UserSource) =>
  ({ [UserSource.LOCAL]: 'local', [UserSource.PROXY]: 'reverse proxy', [UserSource.OIDC]: 'single sign-on' })[s as number] ?? 'unknown'
/** External users have no password here. */
const isLocal = (u: User) => u.source === UserSource.LOCAL || u.source === UserSource.UNSPECIFIED

// --- editing an existing user (UpdateUser takes the whole user, so unchanged fields are sent as they were) ---

const editor = useEditor<User>({
  defs: userFields,
  blank: () => ({ username: '', admin: false }),
  reload: async (id) => (await clients.users.getUser({ id })).user!,
  create: async () => {
    throw new Error('users are created in the dialog below')
  },
  update: async (u, base) =>
    (
      await clients.users.updateUser({
        user: create(UserSchema, { username: base.username, admin: base.admin, ...u.values, id: base.id, etag: u.etag }),
      })
    ).user!,
  saved: async (u) => {
    message.success(`Saved ${u.username}`)
    await reload()
  },
})
const f = editor.state

// --- creating ---

const creating = ref(false)
const newName = ref('')
const newAdmin = ref(false)
const newPassword = ref('')
const newAgain = ref('')
const busy = ref(false)
const createError = ref('')

function openCreate() {
  newName.value = newPassword.value = newAgain.value = createError.value = ''
  newAdmin.value = false
  creating.value = true
}

async function createUser() {
  if (!newName.value.trim()) return void (createError.value = 'Enter a username.')
  if (newPassword.value.length < 8) return void (createError.value = 'The password must be at least 8 characters.')
  if (newPassword.value !== newAgain.value) return void (createError.value = 'The two passwords do not match.')
  busy.value = true
  createError.value = ''
  try {
    await clients.users.createUser({ user: create(UserSchema, { username: newName.value.trim(), admin: newAdmin.value }), password: newPassword.value })
    message.success(`Created ${newName.value.trim()}`)
    creating.value = false
    await reload()
  } catch (e) {
    createError.value = describeError(e)
  } finally {
    busy.value = false
    newPassword.value = newAgain.value = ''
  }
}

// --- passwords and deleting ---

const passwordFor = ref<User>()
const passwordOpen = computed({ get: () => passwordFor.value !== undefined, set: (v) => !v && (passwordFor.value = undefined) })

async function remove(u: User) {
  const ok = await confirm({
    title: 'Delete this user?',
    content: `${u.username} can no longer sign in, and their API tokens stop working.`,
    action: 'Delete',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.users.deleteUser({ id: u.id, etag: u.etag })
    message.success(`Deleted ${u.username}`)
  } catch (e) {
    failure.value = `Could not delete ${u.username}: ${describeError(e)}`
  } finally {
    await reload()
  }
}

const columns = computed<DataTableColumns<User>>(() => [
  { title: 'Username', key: 'username' },
  { title: 'Role', key: 'admin', render: (u) => (u.admin ? h(NTag, { size: 'small', type: 'info' }, () => 'admin') : 'user') },
  { title: 'Account', key: 'source', render: (u) => sourceLabel(u.source) },
  { title: 'Created', key: 'createTime', render: (u) => formatTime(u.createTime) },
  {
    title: '',
    key: 'actions',
    render: (u) =>
      h(NSpace, { size: 4 }, () => [
        h(NButton, { size: 'small', 'data-test': 'edit', onClick: () => editor.startEdit(u) }, () => 'Edit'),
        ...(isLocal(u) ? [h(NButton, { size: 'small', 'data-test': 'password', onClick: () => (passwordFor.value = u) }, () => 'Password')] : []),
        h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'delete', onClick: () => remove(u) }, () => 'Delete'),
      ]),
  },
])
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Users</h2>
      <n-space>
        <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
        <n-button type="primary" data-test="new" @click="openCreate()">New user</n-button>
      </n-space>
    </n-space>
    <p>People who can sign in. Accounts that come from single sign-on or a reverse proxy have no password here.</p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="delete-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="data" :loading="loading" :bordered="false" :row-key="(u: User) => u.id" />

    <editor-modal :editor="editor" :defs="userFields" :title="`Edit ${f.base?.username ?? 'user'}`">
      <n-form label-placement="left" label-width="130" @submit.prevent="editor.save()">
        <n-form-item label="Username">
          <n-input v-model:value="f.form.username" data-test="f-username" />
        </n-form-item>
        <n-form-item label="Administrator" :feedback="f.base && !isLocal(f.base) ? 'For accounts from single sign-on or a proxy this may be set by their groups at each sign-in, in which case it cannot be changed here.' : 'Administrators manage users, every API token and adapters.'">
          <n-switch v-model:value="f.form.admin" data-test="f-admin" />
        </n-form-item>
      </n-form>
    </editor-modal>

    <n-modal v-model:show="creating" preset="card" title="New user" style="width: 440px; max-width: 95vw" :mask-closable="false" data-test="create-dialog">
      <n-form label-placement="top" @submit.prevent="createUser()">
        <n-form-item label="Username">
          <n-input v-model:value="newName" autofocus data-test="u-name" />
        </n-form-item>
        <n-form-item label="Password" feedback="At least 8 characters.">
          <n-input v-model:value="newPassword" type="password" show-password-on="click" :input-props="{ autocomplete: 'new-password' }" data-test="u-password" />
        </n-form-item>
        <n-form-item label="Password again">
          <n-input v-model:value="newAgain" type="password" show-password-on="click" :input-props="{ autocomplete: 'new-password' }" data-test="u-again" />
        </n-form-item>
        <n-form-item label="Administrator">
          <n-switch v-model:value="newAdmin" data-test="u-admin" />
        </n-form-item>
        <n-alert v-if="createError" type="error" data-test="create-error">{{ createError }}</n-alert>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button :disabled="busy" @click="creating = false">Cancel</n-button>
          <n-button type="primary" :loading="busy" data-test="create" @click="createUser()">Create user</n-button>
        </n-space>
      </template>
    </n-modal>

    <password-dialog
      v-if="passwordFor"
      v-model:show="passwordOpen"
      :user-id="passwordFor.id"
      :username="passwordFor.username"
      :self="passwordFor.id === session.state.user?.id"
    />
  </n-space>
</template>
