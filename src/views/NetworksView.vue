<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { NetworkSchema, type Network } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSpace,
  NSwitch,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import EditorModal from '@/components/EditorModal.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useEditor } from '@/composables/useEditor'
import { useLoad } from '@/composables/useLoad'
import { useClients } from '@/context'
import { networkFields } from '@/forms/defs'
import { maskOf } from '@/forms/mask'

const clients = useClients()
const message = useMessage()
const confirm = useConfirm()

const { data, loading, error, reload } = useLoad(
  async () => (await clients.networks.listNetworks({})).networks,
  [] as Network[],
)
const failure = ref('')

const editor = useEditor<Network>({
  defs: networkFields,
  blank: () => ({ name: '', vlanId: 0, subnet: '', dhcpEnabled: false, dhcpStart: '', dhcpStop: '', domainName: '' }),
  reload: async (id) => (await clients.networks.getNetwork({ id })).network!,
  create: async (form) => (await clients.networks.createNetwork({ network: create(NetworkSchema, form) })).network!,
  update: async (u, base) =>
    (
      await clients.networks.updateNetwork({
        network: create(NetworkSchema, { ...u.values, id: base.id, etag: u.etag }),
        updateMask: maskOf(u.paths),
      })
    ).network!,
  saved: async (n, mode) => {
    message.success(mode === 'create' ? `Created ${n.name}` : `Saved ${n.name}`)
    await reload()
  },
})

async function remove(n: Network) {
  const ok = await confirm({
    title: 'Delete this network?',
    content: `${n.name} is removed. It cannot be deleted while a wifi network or switch port uses it.`,
    action: 'Delete',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.networks.deleteNetwork({ id: n.id, etag: n.etag })
    message.success(`Deleted ${n.name}`)
  } catch (e) {
    failure.value = `Could not delete ${n.name}: ${describeError(e)}`
  } finally {
    await reload()
  }
}

const columns = computed<DataTableColumns<Network>>(() => [
  { title: 'Name', key: 'name' },
  { title: 'VLAN', key: 'vlanId', render: (n) => (n.vlanId === 0 ? 'untagged' : String(n.vlanId)) },
  { title: 'Gateway and subnet', key: 'subnet', render: (n) => (n.subnet ? h('code', n.subnet) : '—') },
  {
    title: 'DHCP',
    key: 'dhcpEnabled',
    render: (n) => (n.dhcpEnabled ? `${n.dhcpStart} – ${n.dhcpStop}` : 'off'),
  },
  { title: 'Domain', key: 'domainName', render: (n) => n.domainName || '—' },
  {
    title: '',
    key: 'actions',
    render: (n) =>
      h(NSpace, { size: 4 }, () => [
        h(NButton, { size: 'small', 'data-test': 'edit', onClick: () => editor.startEdit(n) }, () => 'Edit'),
        h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'delete', onClick: () => remove(n) }, () => 'Delete'),
      ]),
  },
])

const f = editor.state
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Networks</h2>
      <n-space>
        <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
        <n-button type="primary" data-test="new" @click="editor.startCreate()">New network</n-button>
      </n-space>
    </n-space>
    <p>VLANs and their IPv4 subnets. Wifi networks and switch ports refer to them.</p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="delete-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="data" :loading="loading" :bordered="false" :row-key="(n: Network) => n.id" />
    <p v-if="!loading && !error && data.length === 0" data-test="empty">No networks yet.</p>

    <editor-modal :editor="editor" :defs="networkFields" :title="f.mode === 'create' ? 'New network' : `Edit ${f.base?.name ?? 'network'}`">
      <n-form label-placement="left" label-width="150" @submit.prevent="editor.save()">
        <n-form-item label="Name">
          <n-input v-model:value="f.form.name" placeholder="e.g. IoT" data-test="f-name" />
        </n-form-item>
        <n-form-item label="VLAN ID" feedback="0 means untagged; otherwise 1-4094.">
          <n-input-number
            :value="f.form.vlanId"
            :min="0"
            :max="4094"
            :precision="0"
            data-test="f-vlan"
            @update:value="(v: number | null) => (f.form.vlanId = v ?? 0)"
          />
        </n-form-item>
        <n-form-item label="Gateway and subnet" feedback="The gateway address and prefix length, e.g. 192.168.10.1/24. Empty for a layer-2 network.">
          <n-input v-model:value="f.form.subnet" placeholder="192.168.10.1/24" data-test="f-subnet" />
        </n-form-item>
        <n-form-item label="DHCP">
          <n-switch v-model:value="f.form.dhcpEnabled" data-test="f-dhcp" />
        </n-form-item>
        <n-form-item label="DHCP range start">
          <n-input v-model:value="f.form.dhcpStart" placeholder="192.168.10.100" :disabled="!f.form.dhcpEnabled" data-test="f-dhcp-start" />
        </n-form-item>
        <n-form-item label="DHCP range end">
          <n-input v-model:value="f.form.dhcpStop" placeholder="192.168.10.200" :disabled="!f.form.dhcpEnabled" data-test="f-dhcp-stop" />
        </n-form-item>
        <n-form-item label="Domain name">
          <n-input v-model:value="f.form.domainName" placeholder="iot.lan" data-test="f-domain" />
        </n-form-item>
      </n-form>
    </editor-modal>
  </n-space>
</template>
