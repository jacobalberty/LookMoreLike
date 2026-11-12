<script setup lang="ts">
import { DeviceState, type Device } from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
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
  async () => (await clients.devices.listDevices({ state: DeviceState.ADOPTED })).devices,
  [] as Device[],
)
const failure = ref('')

async function forget(d: Device) {
  const ok = await confirm({
    title: 'Forget this device?',
    content:
      `beenfar stops managing ${d.mac} and drops its settings, including any switch port settings. ` +
      'If the device is still on the network it shows up again as pending.',
    action: 'Forget',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.devices.forgetDevice({ id: d.id })
    message.success(`Forgot ${d.mac}`)
  } catch (e) {
    failure.value = `Could not forget ${d.mac}: ${describeError(e)}`
  } finally {
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
    render: (d) => h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'forget', onClick: () => forget(d) }, () => 'Forget'),
  },
])
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Devices</h2>
      <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
    </n-space>
    <p>
      Devices this controller manages. Their settings are stored by beenfar; whether a device receives them
      depends on its adapter (see the notes on each settings screen).
    </p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="forget-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="data" :loading="loading" :bordered="false" :row-key="(d: Device) => d.id" />
    <p v-if="!loading && !error && data.length === 0" data-test="empty">No devices are adopted yet.</p>
  </n-space>
</template>
