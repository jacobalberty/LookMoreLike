<script setup lang="ts">
import { create } from '@bufbuild/protobuf'
import type { Network } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import type { RadiusServer } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import {
  WifiBand,
  WifiNetworkSchema,
  WifiSecurity,
  type WifiNetwork,
} from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import {
  NAlert,
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSpace,
  NSwitch,
  NTag,
  useMessage,
  type DataTableColumns,
  type SelectOption,
} from 'naive-ui'
import { computed, h, ref } from 'vue'
import { describeError } from '@/api/errors'
import DeliveryNote from '@/components/DeliveryNote.vue'
import EditorModal from '@/components/EditorModal.vue'
import WriterHint from '@/components/WriterHint.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useEditor } from '@/composables/useEditor'
import { useLoad } from '@/composables/useLoad'
import { useClients } from '@/context'
import { bandLabels, securityLabels, wifiFields } from '@/forms/defs'
import { maskOf } from '@/forms/mask'

const clients = useClients()
const message = useMessage()
const confirm = useConfirm()

const { data, loading, error, reload } = useLoad(
  async () => {
    const [wifi, networks, radius] = await Promise.all([
      clients.wifi.listWifiNetworks({}),
      clients.networks.listNetworks({}),
      clients.radius.listRadiusServers({}),
    ])
    return { wifi: wifi.wifiNetworks, networks: networks.networks, radius: radius.radiusServers }
  },
  { wifi: [] as WifiNetwork[], networks: [] as Network[], radius: [] as RadiusServer[] },
)
const failure = ref('')

const networkName = (id: string) => (id ? (data.value.networks.find((n) => n.id === id)?.name ?? id) : 'Default (untagged)')
const radiusName = (id: string) => (id ? (data.value.radius.find((r) => r.id === id)?.name ?? id) : '—')

const securityOptions: SelectOption[] = [
  { label: securityLabels[WifiSecurity.WPA_PERSONAL]!, value: WifiSecurity.WPA_PERSONAL },
  { label: securityLabels[WifiSecurity.WPA_ENTERPRISE]!, value: WifiSecurity.WPA_ENTERPRISE },
  { label: securityLabels[WifiSecurity.WEP]!, value: WifiSecurity.WEP },
  { label: securityLabels[WifiSecurity.OPEN]!, value: WifiSecurity.OPEN },
]
const bandOptions: SelectOption[] = [
  { label: bandLabels[WifiBand.WIFI_BAND_BOTH]!, value: WifiBand.WIFI_BAND_BOTH },
  { label: bandLabels[WifiBand.WIFI_BAND_2G]!, value: WifiBand.WIFI_BAND_2G },
  { label: bandLabels[WifiBand.WIFI_BAND_5G]!, value: WifiBand.WIFI_BAND_5G },
]
const networkOptions = computed<SelectOption[]>(() => [
  { label: 'Default (untagged)', value: '' },
  ...data.value.networks.map((n) => ({ label: n.vlanId ? `${n.name} (VLAN ${n.vlanId})` : n.name, value: n.id })),
])
const radiusOptions = computed<SelectOption[]>(() => data.value.radius.map((r) => ({ label: `${r.name} (${r.address})`, value: r.id })))

const editor = useEditor<WifiNetwork>({
  defs: wifiFields,
  blank: () => ({
    ssid: '',
    security: WifiSecurity.WPA_PERSONAL,
    securityKey: '',
    band: WifiBand.WIFI_BAND_BOTH,
    networkId: '',
    guest: false,
    hidden: false,
    apGroups: [],
    defaultUserGroup: '',
    radiusServerId: '',
  }),
  reload: async (id) => (await clients.wifi.getWifiNetwork({ id })).wifiNetwork!,
  create: async (form) => (await clients.wifi.createWifiNetwork({ wifiNetwork: create(WifiNetworkSchema, form) })).wifiNetwork!,
  update: async (u, base) =>
    (
      await clients.wifi.updateWifiNetwork({
        wifiNetwork: create(WifiNetworkSchema, { ...u.values, id: base.id, etag: u.etag }),
        updateMask: maskOf(u.paths),
      })
    ).wifiNetwork!,
  saved: async (w, mode) => {
    message.success(mode === 'create' ? `Created ${w.ssid}` : `Saved ${w.ssid}`)
    await reload()
  },
})
const f = editor.state

const needsKey = computed(() => f.form.security === WifiSecurity.WPA_PERSONAL || f.form.security === WifiSecurity.WEP)
/** Why the optional UniFi push would refuse this network, if it would. */
const refusedByPush = computed(() => {
  if (f.form.security === WifiSecurity.OPEN) return 'An open network'
  if (f.form.security === WifiSecurity.WEP) return 'A WEP network'
  if (f.form.guest) return 'A guest network'
  return ''
})
const needsRadius = computed(() => f.form.security === WifiSecurity.WPA_ENTERPRISE)

/**
 * The server refuses a passphrase on open and enterprise networks and a
 * RADIUS server on the others, so changing the security mode also clears
 * what no longer applies. Those fields then show up in the update mask, as
 * they are part of what the change does.
 */
function setSecurity(v: WifiSecurity) {
  f.form.security = v
  if (v !== WifiSecurity.WPA_PERSONAL && v !== WifiSecurity.WEP) f.form.securityKey = ''
  if (v !== WifiSecurity.WPA_ENTERPRISE) f.form.radiusServerId = ''
}

async function remove(w: WifiNetwork) {
  const ok = await confirm({
    title: 'Delete this wifi network?',
    content: `${w.ssid} stops being broadcast once devices receive the change.`,
    action: 'Delete',
  })
  if (!ok) return
  failure.value = ''
  try {
    await clients.wifi.deleteWifiNetwork({ id: w.id, etag: w.etag })
    message.success(`Deleted ${w.ssid}`)
  } catch (e) {
    failure.value = `Could not delete ${w.ssid}: ${describeError(e)}`
  } finally {
    await reload()
  }
}

const columns = computed<DataTableColumns<WifiNetwork>>(() => [
  { title: 'SSID', key: 'ssid' },
  { title: 'Security', key: 'security', render: (w) => securityLabels[w.security] ?? '—' },
  { title: 'Bands', key: 'band', render: (w) => bandLabels[w.band] ?? '—' },
  { title: 'Network', key: 'networkId', render: (w) => networkName(w.networkId) },
  {
    title: 'Flags',
    key: 'flags',
    render: (w) =>
      h(NSpace, { size: 4 }, () => [
        ...(w.guest ? [h(NTag, { size: 'small' }, () => 'guest')] : []),
        ...(w.hidden ? [h(NTag, { size: 'small' }, () => 'hidden')] : []),
      ]),
  },
  { title: 'Access point groups', key: 'apGroups', render: (w) => (w.apGroups.length ? w.apGroups.join(', ') : 'all') },
  { title: 'RADIUS', key: 'radiusServerId', render: (w) => radiusName(w.radiusServerId) },
  {
    title: '',
    key: 'actions',
    render: (w) =>
      h(NSpace, { size: 4 }, () => [
        h(NButton, { size: 'small', 'data-test': 'edit', onClick: () => editor.startEdit(w) }, () => 'Edit'),
        h(NButton, { size: 'small', type: 'error', secondary: true, 'data-test': 'delete', onClick: () => remove(w) }, () => 'Delete'),
      ]),
  },
])
</script>

<template>
  <n-space vertical :size="16">
    <n-space justify="space-between" align="center">
      <h2>Wifi networks</h2>
      <n-space>
        <n-button :loading="loading" data-test="refresh" @click="reload()">Refresh</n-button>
        <n-button type="primary" data-test="new" @click="editor.startCreate()">New wifi network</n-button>
      </n-space>
    </n-space>
    <p>Wireless networks (SSIDs), the network their clients join and the access point groups that broadcast them.</p>
    <delivery-note scope="wifi" />
    <n-alert v-if="error" type="error" data-test="load-error">{{ error }}</n-alert>
    <n-alert v-if="failure" type="error" closable data-test="delete-error" @close="failure = ''">{{ failure }}</n-alert>
    <n-data-table :columns="columns" :data="data.wifi" :loading="loading" :bordered="false" :row-key="(w: WifiNetwork) => w.id" />
    <p v-if="!loading && !error && data.wifi.length === 0" data-test="empty">No wifi networks yet.</p>

    <editor-modal :editor="editor" :defs="wifiFields" :title="f.mode === 'create' ? 'New wifi network' : `Edit ${f.base?.ssid ?? 'wifi network'}`" :width="640">
      <n-alert v-if="refusedByPush" type="warning" data-test="push-refused">
        {{ refusedByPush }} beenfar stores this network, but when the UniFi push is on it is refused and not sent to devices.
      </n-alert>
      <n-form label-placement="left" label-width="170" @submit.prevent="editor.save()">
        <n-form-item label="SSID" feedback="1-32 bytes.">
          <n-input v-model:value="f.form.ssid" data-test="f-ssid" />
          <writer-hint :writers="f.base?.fieldWriters" path="ssid" />
        </n-form-item>
        <n-form-item label="Security">
          <n-select :value="f.form.security" :options="securityOptions" data-test="f-security" @update:value="setSecurity" />
          <writer-hint :writers="f.base?.fieldWriters" path="security" />
        </n-form-item>
        <n-form-item v-if="needsKey" label="Passphrase" feedback="WPA: 8-63 characters, or 64 hex digits. WEP: 5 or 13 characters, or 10 or 26 hex digits.">
          <n-input v-model:value="f.form.securityKey" type="password" show-password-on="click" autocomplete="off" data-test="f-key" />
          <writer-hint :writers="f.base?.fieldWriters" path="security_key" />
        </n-form-item>
        <n-form-item v-if="needsRadius" label="RADIUS server">
          <n-select
            v-model:value="f.form.radiusServerId"
            :options="radiusOptions"
            placeholder="Choose a RADIUS server"
            data-test="f-radius"
          />
          <writer-hint :writers="f.base?.fieldWriters" path="radius_server_id" />
        </n-form-item>
        <n-form-item label="Bands">
          <n-select v-model:value="f.form.band" :options="bandOptions" data-test="f-band" />
          <writer-hint :writers="f.base?.fieldWriters" path="band" />
        </n-form-item>
        <n-form-item label="Network" feedback="The network that clients of this SSID join.">
          <n-select v-model:value="f.form.networkId" :options="networkOptions" data-test="f-network" />
          <writer-hint :writers="f.base?.fieldWriters" path="network_id" />
        </n-form-item>
        <n-form-item label="Access point groups" feedback="Empty means every access point. Type a name and press Enter to add one.">
          <n-select
            v-model:value="f.form.apGroups"
            multiple
            filterable
            tag
            :show-arrow="false"
            :show="false"
            placeholder="All access points"
            data-test="f-ap-groups"
          />
          <writer-hint :writers="f.base?.fieldWriters" path="ap_groups" />
        </n-form-item>
        <n-form-item label="Default user group">
          <n-input v-model:value="f.form.defaultUserGroup" data-test="f-user-group" />
          <writer-hint :writers="f.base?.fieldWriters" path="default_user_group" />
        </n-form-item>
        <n-form-item label="Guest network">
          <n-switch v-model:value="f.form.guest" data-test="f-guest" />
          <writer-hint :writers="f.base?.fieldWriters" path="guest" />
        </n-form-item>
        <n-form-item label="Hidden">
          <n-switch v-model:value="f.form.hidden" data-test="f-hidden" />
          <writer-hint :writers="f.base?.fieldWriters" path="hidden" />
        </n-form-item>
      </n-form>
    </editor-modal>
  </n-space>
</template>
