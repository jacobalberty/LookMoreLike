<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { DeviceState, type Device } from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
import type { Network } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import { PoeMode, SwitchPortSchema, SwitchPortTagging, type SwitchPort } from '@jacobalberty/beenfar-api/beenfar/config/v1/switch_port_pb'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSpace,
  NSwitch,
  useMessage,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import { computed, h, onMounted, ref, watch } from 'vue'
import { describeError } from '@/api/errors'
import EditorModal from '@/components/EditorModal.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useEditor } from '@/composables/useEditor'
import { useClients, useRouter } from '@/context'
import { poeLabels, switchPortFields, taggingLabels } from '@/forms/defs'
import { maskOf } from '@/forms/mask'

const clients = useClients()
const router = useRouter()
const message = useMessage()
const confirm = useConfirm()

const devices = ref<Device[]>([])
const networks = ref<Network[]>([])
const ports = ref<SwitchPort[]>([])
const deviceId = ref(router.query.get('device') ?? '')
const loading = ref(false)
const error = ref('')
const failure = ref('')
/** The port number a new port's settings are for (a device does not say how many ports it has). */
const newIndex = ref<number | null>(null)

const device = computed(() => devices.value.find((d) => d.id === deviceId.value))
const deviceOptions = computed<SelectOption[]>(() =>
  devices.value.map((d) => ({ label: `${d.model || 'Device'} (${d.mac})`, value: d.id })),
)
const networkOptions = computed<SelectOption[]>(() => [
  { label: 'Default network', value: '' },
  ...networks.value.map((n) => ({ label: n.vlanId ? `${n.name} (VLAN ${n.vlanId})` : n.name, value: n.id })),
])
const taggedOptions = computed<SelectOption[]>(() =>
  networks.value.map((n) => ({ label: n.name, value: n.id, disabled: n.id === editor.state.form.nativeNetworkId })),
)
const taggingOptions: SelectOption[] = [SwitchPortTagging.ALL, SwitchPortTagging.NONE, SwitchPortTagging.CUSTOM].map((v) => ({ label: taggingLabels[v]!, value: v }))
const poeOptions: SelectOption[] = [PoeMode.AUTO, PoeMode.OFF].map((v) => ({ label: poeLabels[v]!, value: v }))

async function loadDevices() {
  try {
    const [d, n] = await Promise.all([clients.devices.listDevices({ state: DeviceState.ADOPTED }), clients.networks.listNetworks({})])
    devices.value = d.devices
    networks.value = n.networks
    if (!deviceId.value && d.devices[0]) deviceId.value = d.devices[0].id
  } catch (e) {
    error.value = describeError(e)
  }
}

async function loadPorts() {
  if (!deviceId.value) {
    ports.value = []
    return
  }
  loading.value = true
  try {
    ports.value = (await clients.ports.listSwitchPorts({ deviceId: deviceId.value })).switchPorts
    error.value = ''
  } catch (e) {
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadDevices()
  await loadPorts()
})
watch(deviceId, loadPorts)

const editor = useEditor<SwitchPort>({
  defs: switchPortFields,
  blank: () => ({ name: '', disabled: false, nativeNetworkId: '', tagging: SwitchPortTagging.ALL, taggedNetworkIds: [], poeMode: PoeMode.AUTO }),
  validate: (_form, mode) => (mode === 'create' && !newIndex.value ? 'Enter the port number, as printed on the device.' : undefined),
  reload: async (id) => (await clients.ports.getSwitchPort({ id })).switchPort!,
  create: async (form) =>
    (await clients.ports.createSwitchPort({ switchPort: create(SwitchPortSchema, { ...form, deviceId: deviceId.value, portIndex: newIndex.value! }) })).switchPort!,
  update: async (u, base) =>
    (
      await clients.ports.updateSwitchPort({
        switchPort: create(SwitchPortSchema, { ...u.values, id: base.id, etag: u.etag }),
        updateMask: maskOf(u.paths),
      })
    ).switchPort!,
  saved: async (p, mode) => {
    message.success(`${mode === 'create' ? 'Saved settings for' : 'Saved'} port ${p.portIndex}`)
    await loadPorts()
  },
})
const f = editor.state

function newPort() {
  newIndex.value = null
  editor.startCreate()
}

/** A port is tagged on its own native network only untagged, so the choice is dropped from the tagged list. */
function setNative(v: string) {
  f.form.nativeNetworkId = v
  if (v && f.form.taggedNetworkIds?.includes(v)) f.form.taggedNetworkIds = f.form.taggedNetworkIds.filter((id) => id !== v)
}

/** Selected networks only apply to the "selected networks" mode, so leaving it empties the list. */
function setTagging(v: SwitchPortTagging) {
  f.form.tagging = v
  if (v !== SwitchPortTagging.CUSTOM) f.form.taggedNetworkIds = []
}

async function restore(p: SwitchPort) {
  const ok = await confirm({
    title: 'Restore the defaults?',
    content: `Port ${p.portIndex}'s settings are deleted from beenfar, so the port returns to the device's defaults.`,
    action: 'Restore defaults',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.ports.deleteSwitchPort({ id: p.id, etag: p.etag })
    message.success(`Port ${p.portIndex} is back to defaults`)
  } catch (e) {
    failure.value = `Could not restore port ${p.portIndex}: ${describeError(e)}`
  } finally {
    await loadPorts()
  }
}

const networkName = (id: string) => (id ? (networks.value.find((n) => n.id === id)?.name ?? id) : 'Default')
const columns = computed<DataTableColumns<SwitchPort>>(() => [
  { title: 'Port', key: 'portIndex' },
  { title: 'Name', key: 'name', render: (p) => p.name || '—' },
  { title: 'State', key: 'disabled', render: (p) => (p.disabled ? 'disabled' : 'enabled') },
  { title: 'Native network', key: 'nativeNetworkId', render: (p) => networkName(p.nativeNetworkId) },
  {
    title: 'Tagged',
    key: 'tagging',
    render: (p) =>
      p.tagging === SwitchPortTagging.CUSTOM ? p.taggedNetworkIds.map(networkName).join(', ') || 'none' : (taggingLabels[p.tagging] ?? '—'),
  },
  { title: 'PoE', key: 'poeMode', render: (p) => poeLabels[p.poeMode] ?? '—' },
  {
    title: '',
    key: 'actions',
    render: (p) =>
      h(NSpace, { size: 4 }, () => [
        h(NButton, { size: 'small', 'data-test': 'edit', onClick: () => editor.startEdit(p) }, () => 'Edit'),
        h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'restore', onClick: () => restore(p) }, () => 'Restore defaults'),
      ]),
  },
])
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Switch ports</h2>
      <n-space>
        <n-select v-model:value="deviceId" :options="deviceOptions" placeholder="Choose a device" style="min-width: 280px" data-test="device" />
        <n-button :disabled="!deviceId" type="primary" data-test="new" @click="newPort()">Add port settings</n-button>
      </n-space>
    </n-space>
    <n-alert type="warning" title="Stored, not applied to devices" data-test="not-applied">
      Port settings are stored by beenfar, but beenfar does not send them to devices yet: changing them here does not
      change what the switch does.
    </n-alert>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="restore-error" @close="failure = ''">{{ failure }}</n-alert>
    <p v-if="!devices.length && !error" data-test="no-devices">
      Only adopted devices have port settings, and none is adopted yet.
    </p>
    <template v-else>
      <p v-if="device">
        Ports of <strong>{{ device.model || 'the device' }}</strong> ({{ device.mac }}) that have settings. A port without settings
        runs with the device's defaults.
      </p>
      <n-data-table :columns="columns" :data="ports" :loading="loading" :bordered="false" :row-key="(p: SwitchPort) => p.id" />
      <p v-if="deviceId && !loading && !error && ports.length === 0" data-test="empty">No port of this device has settings.</p>
    </template>

    <editor-modal :editor="editor" :defs="switchPortFields" :title="f.mode === 'create' ? 'Port settings' : `Edit port ${f.base?.portIndex}`">
      <n-form label-placement="left" label-width="150" @submit.prevent="editor.save()">
        <n-form-item label="Port number" :feedback="f.mode === 'create' ? 'As printed on the device, starting at 1.' : 'The port cannot be changed.'">
          <n-input-number v-if="f.mode === 'create'" v-model:value="newIndex" :min="1" :max="65535" :precision="0" data-test="f-index" />
          <span v-else data-test="f-index-fixed">{{ f.base?.portIndex }}</span>
        </n-form-item>
        <n-form-item label="Name">
          <n-input v-model:value="f.form.name" placeholder="e.g. Office AP" data-test="f-name" />
        </n-form-item>
        <n-form-item label="Port disabled">
          <n-switch v-model:value="f.form.disabled" data-test="f-disabled" />
        </n-form-item>
        <n-form-item label="Native network" feedback="Carried untagged.">
          <n-select :value="f.form.nativeNetworkId" :options="networkOptions" data-test="f-native" @update:value="setNative" />
        </n-form-item>
        <n-form-item label="Tagged networks">
          <n-select :value="f.form.tagging" :options="taggingOptions" data-test="f-tagging" @update:value="setTagging" />
        </n-form-item>
        <n-form-item v-if="f.form.tagging === SwitchPortTagging.CUSTOM" label="Selected networks">
          <n-select v-model:value="f.form.taggedNetworkIds" multiple :options="taggedOptions" data-test="f-tagged" />
        </n-form-item>
        <n-form-item label="PoE">
          <n-select v-model:value="f.form.poeMode" :options="poeOptions" data-test="f-poe" />
        </n-form-item>
      </n-form>
    </editor-modal>
  </n-space>
</template>
