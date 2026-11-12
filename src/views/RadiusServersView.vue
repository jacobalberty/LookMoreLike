<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { RadiusServerSchema, type RadiusServer } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSpace,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import EditorModal from '@/components/EditorModal.vue'
import SecretInput from '@/components/SecretInput.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useEditor } from '@/composables/useEditor'
import { useLoad } from '@/composables/useLoad'
import { useClients } from '@/context'
import { radiusFields } from '@/forms/defs'
import { maskOf } from '@/forms/mask'

const clients = useClients()
const message = useMessage()
const confirm = useConfirm()

const { data, loading, error, reload } = useLoad(
  async () => (await clients.radius.listRadiusServers({})).radiusServers,
  [] as RadiusServer[],
)
const failure = ref('')
/** Edit mode: the secret box is open (rotating), otherwise the stored secret is kept. */
const rotating = ref(false)

const editor = useEditor<RadiusServer>({
  defs: radiusFields,
  blank: () => ({ name: '', address: '', authPort: 1812, accountingPort: 1813, sharedSecret: '' }),
  reload: async (id) => (await clients.radius.getRadiusServer({ id })).radiusServer!,
  validate: (form, mode) => (mode === 'create' && !form.sharedSecret ? 'A shared secret is required.' : undefined),
  create: async (form) => (await clients.radius.createRadiusServer({ radiusServer: create(RadiusServerSchema, form) })).radiusServer!,
  update: async (u, base) =>
    (
      await clients.radius.updateRadiusServer({
        radiusServer: create(RadiusServerSchema, { ...u.values, id: base.id, etag: u.etag }),
        updateMask: maskOf(u.paths),
      })
    ).radiusServer!,
  saved: async (r, mode) => {
    message.success(mode === 'create' ? `Created ${r.name}` : `Saved ${r.name}`)
    await reload()
  },
})

function edit(r: RadiusServer, rotate = false) {
  editor.startEdit(r)
  rotating.value = rotate
}

function newServer() {
  editor.startCreate()
  rotating.value = true
}

async function remove(r: RadiusServer) {
  const ok = await confirm({
    title: 'Delete this RADIUS server?',
    content: `${r.name} is removed. It cannot be deleted while a wifi network uses it.`,
    action: 'Delete',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.radius.deleteRadiusServer({ id: r.id, etag: r.etag })
    message.success(`Deleted ${r.name}`)
  } catch (e) {
    failure.value = `Could not delete ${r.name}: ${describeError(e)}`
  } finally {
    await reload()
  }
}

const columns = computed<DataTableColumns<RadiusServer>>(() => [
  { title: 'Name', key: 'name' },
  { title: 'Address', key: 'address', render: (r) => h('code', r.address) },
  { title: 'Auth port', key: 'authPort' },
  { title: 'Accounting port', key: 'accountingPort', render: (r) => (r.accountingPort ? String(r.accountingPort) : 'none') },
  {
    title: 'Secret',
    key: 'sharedSecretVersion',
    render: (r) => h('span', { title: 'The secret is never shown; the version increases whenever it is replaced.' }, `stored · version ${r.sharedSecretVersion}`),
  },
  {
    title: '',
    key: 'actions',
    render: (r) =>
      h(NSpace, { size: 4 }, () => [
        h(NButton, { size: 'small', 'data-test': 'edit', onClick: () => edit(r) }, () => 'Edit'),
        h(NButton, { size: 'small', 'data-test': 'rotate', onClick: () => edit(r, true) }, () => 'Rotate secret'),
        h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'delete', onClick: () => remove(r) }, () => 'Delete'),
      ]),
  },
])

const f = editor.state
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>RADIUS servers</h2>
      <n-space>
        <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
        <n-button type="primary" data-test="new" @click="newServer()">New RADIUS server</n-button>
      </n-space>
    </n-space>
    <p>Servers that WPA-enterprise wifi networks authenticate against. Shared secrets are write-only.</p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="delete-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="data" :loading="loading" :bordered="false" :row-key="(r: RadiusServer) => r.id" />
    <p v-if="!loading && !error && data.length === 0" data-test="empty">No RADIUS servers yet.</p>

    <editor-modal
      :editor="editor"
      :defs="radiusFields"
      :title="f.mode === 'create' ? 'New RADIUS server' : `Edit ${f.base?.name ?? 'RADIUS server'}`"
    >
      <n-form label-placement="left" label-width="150" @submit.prevent="editor.save()">
        <n-form-item label="Name">
          <n-input v-model:value="f.form.name" data-test="f-name" />
        </n-form-item>
        <n-form-item label="Address" feedback="An IPv4 or IPv6 address.">
          <n-input v-model:value="f.form.address" placeholder="10.0.0.5" data-test="f-address" />
        </n-form-item>
        <n-form-item label="Authentication port">
          <n-input-number
            :value="f.form.authPort"
            :min="1"
            :max="65535"
            :precision="0"
            data-test="f-auth-port"
            @update:value="(v: number | null) => (f.form.authPort = v ?? 1812)"
          />
        </n-form-item>
        <n-form-item label="Accounting port" feedback="0 for no accounting.">
          <n-input-number
            :value="f.form.accountingPort"
            :min="0"
            :max="65535"
            :precision="0"
            data-test="f-acct-port"
            @update:value="(v: number | null) => (f.form.accountingPort = v ?? 0)"
          />
        </n-form-item>
        <n-form-item label="Shared secret">
          <n-space vertical :size="8" style="width: 100%">
            <template v-if="f.mode === 'edit' && !rotating">
              <span data-test="secret-kept">
                The stored secret (version {{ f.base?.sharedSecretVersion }}) is kept. It is never shown.
              </span>
              <n-button size="small" data-test="start-rotate" @click="rotating = true">Replace the secret</n-button>
            </template>
            <template v-else>
              <secret-input v-model="f.form.sharedSecret" data-test="f-secret" />
              <span v-if="f.mode === 'edit'" class="hint">
                Leave empty to keep the stored secret. Replacing it also changes what devices are told, so
                the RADIUS server must be updated to match.
              </span>
              <span v-else class="hint">1-128 printable ASCII characters. It cannot be read back.</span>
            </template>
          </n-space>
        </n-form-item>
      </n-form>
    </editor-modal>
  </n-space>
</template>

<style scoped>
.hint {
  opacity: 0.75;
  font-size: 13px;
}
</style>
