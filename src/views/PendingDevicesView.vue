<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import {
  AdoptDeviceRequestSchema,
  DeviceState,
  ReadoptionState,
  type Device,
} from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
import { NAlert, NButton, NDataTable, NSpace, useMessage, type DataTableColumns } from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import DeviceStatus from '@/components/DeviceStatus.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useLoad } from '@/composables/useLoad'
import { useClients } from '@/context'
import { formatTime, timeAgo } from '@/format'

const clients = useClients()
const message = useMessage()
const confirm = useConfirm()

const { data, loading, error, reload } = useLoad(
  async () => {
    const [pending, adopted] = await Promise.all([
      clients.devices.listPendingDevices({}),
      clients.devices.listDevices({ state: DeviceState.ADOPTED }),
    ])
    return {
      pending: pending.devices,
      // Adopted devices that came back without their key: adopting accepts them again.
      reset: adopted.devices.filter((d) => d.readoption !== ReadoptionState.UNSPECIFIED),
    }
  },
  { pending: [] as Device[], reset: [] as Device[] },
)

/** Reset devices first: they need a decision, new ones can wait. */
const rows = computed(() => [...data.value.reset, ...data.value.pending])

const adopting = ref('')
const failure = ref('')

function canAdopt(d: Device): boolean {
  if (d.locked) return false
  // A device that is re-adopting is already being given its key.
  return d.readoption !== ReadoptionState.IN_PROGRESS
}

async function adopt(d: Device) {
  const again = d.state === DeviceState.ADOPTED
  const ok = await confirm({
    title: again ? 'Adopt this reset device again?' : 'Adopt this device?',
    content: again
      ? `${d.mac} was reset. Adopting it gives it a new key, and beenfar manages it again.`
      : `${d.mac} (${d.model || 'unknown model'}) will be managed by this controller.`,
    action: 'Adopt',
  })
  if (!ok) return
  adopting.value = d.id
  failure.value = ''
  try {
    await clients.devices.adoptDevice(create(AdoptDeviceRequestSchema, { device: { case: 'id', value: d.id } }))
    message.success(`Adopting ${d.mac}`)
  } catch (e) {
    failure.value = `Could not adopt ${d.mac}: ${describeError(e)}`
  } finally {
    adopting.value = ''
    await reload()
  }
}

const columns = computed<DataTableColumns<Device>>(() => [
  { title: 'MAC address', key: 'mac', render: (d) => h('code', d.mac) },
  { title: 'Model', key: 'model', render: (d) => d.model || '—' },
  { title: 'Adapter', key: 'adapter' },
  { title: 'Address', key: 'ip', render: (d) => d.ip || '—' },
  { title: 'Firmware', key: 'firmware', render: (d) => d.firmware || '—' },
  { title: 'Last seen', key: 'lastSeenTime', render: (d) => h('span', { title: formatTime(d.lastSeenTime) }, timeAgo(d.lastSeenTime)) },
  { title: 'Status', key: 'status', render: (d) => h(DeviceStatus, { device: d }) },
  {
    title: '',
    key: 'actions',
    render: (d) =>
      h(
        NButton,
        {
          size: 'small',
          type: 'primary',
          disabled: !canAdopt(d) || adopting.value !== '',
          loading: adopting.value === d.id,
          'data-test': 'adopt',
          title: d.locked ? 'Locked: beenfar has no credentials for this device' : undefined,
          onClick: () => adopt(d),
        },
        () => (d.state === DeviceState.ADOPTED ? 'Adopt again' : 'Adopt'),
      ),
  },
])
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Pending devices</h2>
      <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
    </n-space>
    <p>
      Devices that have contacted this controller but are not managed by it yet, and managed devices that were
      reset and are waiting to be adopted again.
    </p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="adopt-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="rows" :loading="loading" :bordered="false" :row-key="(d: Device) => d.id" />
    <p v-if="!loading && !error && rows.length === 0" data-test="empty">
      Nothing is waiting. Point a device at this controller (its inform URL) and it will appear here.
    </p>
  </n-space>
</template>
