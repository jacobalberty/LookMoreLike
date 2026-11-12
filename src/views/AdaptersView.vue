<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import { AdapterKind, UnifiDeviceKeySchema, type Adapter } from '@jacobalberty/beenfar-api/beenfar/admin/v1/adapter_pb'
import { NAlert, NButton, NCard, NDataTable, NInput, NSpace, NTag, useMessage, type DataTableColumns } from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import { useLoad } from '@/composables/useLoad'
import { useClients } from '@/context'
import { formatTime } from '@/format'
import { parseUnifiKeys } from '@/forms/unifiKeys'

const clients = useClients()
const message = useMessage()

const { data, loading, error, reload } = useLoad(async () => (await clients.adapters.listAdapters({})).adapters, [] as Adapter[])

const columns = computed<DataTableColumns<Adapter>>(() => [
  { title: 'Adapter', key: 'name', render: (a) => h('strong', a.name) },
  { title: 'Runs', key: 'kind', render: (a) => (a.kind === AdapterKind.BUILTIN ? 'built in' : a.kind === AdapterKind.EXTERNAL ? 'separate process' : '—') },
  { title: 'Version', key: 'version', render: (a) => a.version || '—' },
  {
    title: 'Health',
    key: 'healthy',
    render: (a) =>
      h(NTag, { size: 'small', type: a.healthy ? 'success' : 'error', 'data-test': 'health' }, () => (a.healthy ? 'healthy' : 'not healthy')),
  },
  { title: 'Status', key: 'statusMessage', render: (a) => a.statusMessage || '—' },
  { title: 'Since', key: 'connectTime', render: (a) => formatTime(a.connectTime) },
])

// --- taking over UniFi devices ---

const keysText = ref('')
const importing = ref(false)
const problems = ref<string[]>([])
const importError = ref('')

async function importKeys() {
  importError.value = ''
  const parsed = parseUnifiKeys(keysText.value)
  problems.value = parsed.errors
  if (parsed.errors.length) return
  importing.value = true
  try {
    const res = await clients.adapters.importUnifiDeviceKeys({ devices: parsed.keys.map((k) => create(UnifiDeviceKeySchema, k)) })
    message.success(`Stored the keys of ${res.imported} device${res.imported === 1 ? '' : 's'}`)
    keysText.value = '' // the keys were secrets: do not keep them on the page
  } catch (e) {
    importError.value = describeError(e)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Adapters</h2>
      <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
    </n-space>
    <p>Adapters talk to devices on beenfar's behalf. Built-in adapters run inside the controller; others connect over the adapter API.</p>
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-data-table :columns="columns" :data="data" :loading="loading" :bordered="false" :row-key="(a: Adapter) => a.name" />
    <p v-if="!loading && !error && data.length === 0" data-test="empty">No adapters are registered.</p>

    <n-card title="Take over UniFi devices" data-test="import">
      <n-space vertical :size="12">
        <p>
          A UniFi device that another controller manages cannot be adopted: it appears as <em>locked</em> until beenfar
          has its key. Paste the keys extracted from that controller as JSON, then point the devices at beenfar (DNS
          or <code>set-inform</code>); they appear as pending, with their real model, ready to adopt.
        </p>
        <n-input
          v-model:value="keysText"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 12 }"
          placeholder='[{"mac": "aa:bb:cc:dd:ee:ff", "authkey": "<32 hex digits>", "gcm": true}]'
          :input-props="{ spellcheck: false, autocomplete: 'off' }"
          data-test="keys"
        />
        <n-alert v-if="problems.length" type="error" title="The keys were not sent" data-test="key-problems">
          <ul>
            <li v-for="p in problems" :key="p">{{ p }}</li>
          </ul>
        </n-alert>
        <n-alert v-if="importError" type="error" data-test="import-error">{{ importError }}</n-alert>
        <n-space align="center">
          <n-button type="primary" :loading="importing" :disabled="!keysText.trim()" data-test="import-keys" @click="importKeys()">Store the keys</n-button>
          <span class="hint">Keys are write-only: beenfar never shows them again.</span>
        </n-space>
      </n-space>
    </n-card>
  </n-space>
</template>

<style scoped>
.hint {
  opacity: 0.75;
  font-size: 13px;
}
ul {
  margin: 0;
  padding-left: 20px;
}
</style>
