import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { NetworkSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import { RadiusServerSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import {
  WifiBand,
  WifiNetworkSchema,
  WifiSecurity,
  type WifiNetwork,
} from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { NSelect, NSwitch } from 'naive-ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import WifiNetworksView from './WifiNetworksView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))
beforeEach(() => confirm.mockReset().mockResolvedValue(true))

const wifi = (over: MessageInitShape<typeof WifiNetworkSchema> = {}) =>
  create(WifiNetworkSchema, {
    id: 'w1',
    etag: '9',
    ssid: 'home',
    security: WifiSecurity.WPA_PERSONAL,
    securityKey: 'hunter2hunter2',
    band: WifiBand.WIFI_BAND_BOTH,
    networkId: 'n1',
    apGroups: ['attic', 'garage'], // set by Terraform
    ...over,
  })

function fake(list: WifiNetwork[] = [wifi()]) {
  return {
    wifi: {
      listWifiNetworks: vi.fn().mockResolvedValue({ wifiNetworks: list }),
      getWifiNetwork: vi.fn().mockResolvedValue({ wifiNetwork: list[0] }),
      createWifiNetwork: vi.fn().mockImplementation(({ wifiNetwork }) => Promise.resolve({ wifiNetwork })),
      updateWifiNetwork: vi.fn().mockImplementation(({ wifiNetwork }) => Promise.resolve({ wifiNetwork })),
      deleteWifiNetwork: vi.fn().mockResolvedValue({}),
    },
    networks: { listNetworks: vi.fn().mockResolvedValue({ networks: [create(NetworkSchema, { id: 'n1', name: 'iot', vlanId: 20 })] }) },
    radius: { listRadiusServers: vi.fn().mockResolvedValue({ radiusServers: [create(RadiusServerSchema, { id: 'r1', name: 'office', address: '10.0.0.5' })] }) },
  }
}

const q = (sel: string) => document.body.querySelector(sel)
const click = async (sel: string) => {
  ;(q(sel) as HTMLElement).click()
  await flushPromises()
}
const by = (w: VueWrapper, c: typeof NSelect | typeof NSwitch, test: string) => {
  const found = w.findAllComponents(c).find((x) => x.attributes('data-test') === test)
  if (!found) throw new Error(`no ${test}`)
  return found
}
const choose = async (w: VueWrapper, test: string, v: unknown) => {
  by(w, NSelect, test).vm.$emit('update:value', v)
  await flushPromises()
}
const open = async (w: VueWrapper) => {
  await w.get('[data-test=edit]').trigger('click')
  await flushPromises()
}
const sent = (clients: ReturnType<typeof fake>, call = 0) => clients.wifi.updateWifiNetwork.mock.calls[call]![0]

describe('wifi networks', () => {
  it('lists networks with their network and AP groups by name', async () => {
    const { w } = await mountView(WifiNetworksView, fake())
    expect(w.text()).toContain('home')
    expect(w.text()).toContain('WPA personal')
    expect(w.text()).toContain('iot')
    expect(w.text()).toContain('attic, garage')
  })

  it('toggling "hidden" names only hidden, so AP groups managed elsewhere are not sent', async () => {
    const clients = fake()
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    by(w, NSwitch, 'f-hidden').vm.$emit('update:value', true)
    await flushPromises()
    await click('[data-test=save]')
    const req = sent(clients)
    expect(req.updateMask.paths).toEqual(['hidden'])
    expect(req.wifiNetwork.hidden).toBe(true)
    expect(req.wifiNetwork.apGroups).toEqual([])
    expect(req.wifiNetwork.ssid).toBe('')
    expect(req.wifiNetwork.securityKey).toBe('')
    expect(req.wifiNetwork.etag).toBe('9')
  })

  it('editing the AP groups names only ap_groups', async () => {
    const clients = fake()
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    await choose(w, 'f-ap-groups', ['attic', 'garage', 'porch'])
    await click('[data-test=save]')
    expect(sent(clients).updateMask.paths).toEqual(['ap_groups'])
    expect(sent(clients).wifiNetwork.apGroups).toEqual(['attic', 'garage', 'porch'])
  })

  it('reordering the AP groups is not a change', async () => {
    const clients = fake()
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    await choose(w, 'f-ap-groups', ['garage', 'attic'])
    await click('[data-test=save]')
    expect(clients.wifi.updateWifiNetwork).not.toHaveBeenCalled()
  })

  it('shows the passphrase field only where it applies', async () => {
    const clients = fake()
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    expect(q('[data-test=f-key]')).not.toBeNull()
    expect(q('[data-test=f-radius]')).toBeNull()
    await choose(w, 'f-security', WifiSecurity.WPA_ENTERPRISE)
    expect(q('[data-test=f-key]')).toBeNull()
    expect(q('[data-test=f-radius]')).not.toBeNull()
  })

  it('moving to enterprise clears the passphrase and names the fields that changed with it', async () => {
    const clients = fake()
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    await choose(w, 'f-security', WifiSecurity.WPA_ENTERPRISE)
    await choose(w, 'f-radius', 'r1')
    await click('[data-test=save]')
    const req = sent(clients)
    expect(req.updateMask.paths).toEqual(['security', 'security_key', 'radius_server_id'])
    expect(req.wifiNetwork.radiusServerId).toBe('r1')
    expect(req.wifiNetwork.securityKey).toBe('')
    expect(req.updateMask.paths).not.toContain('ap_groups')
  })

  it("shows the controller's reason when an edit is refused", async () => {
    const clients = fake()
    clients.wifi.updateWifiNetwork.mockRejectedValue(new ConnectError('ssid already in use', Code.AlreadyExists))
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    await choose(w, 'f-network', '')
    await click('[data-test=save]')
    expect(q('[data-test=editor-error]')?.textContent).toContain('ssid already in use')
  })

  it('on a conflict shows that Terraform-managed fields changed, and applies only my field when asked', async () => {
    const clients = fake()
    clients.wifi.updateWifiNetwork.mockRejectedValueOnce(new ConnectError('changed', Code.Aborted))
    clients.wifi.getWifiNetwork.mockResolvedValue({ wifiNetwork: wifi({ etag: '10', apGroups: ['attic', 'porch'] }) })
    const { w } = await mountView(WifiNetworksView, clients)
    await open(w)
    by(w, NSwitch, 'f-hidden').vm.$emit('update:value', true)
    await flushPromises()
    await click('[data-test=save]')
    expect(q('[data-test=conflict]')?.textContent).toContain('attic, porch')
    expect(clients.wifi.updateWifiNetwork).toHaveBeenCalledTimes(1)
    await click('[data-test=keep-mine]')
    await click('[data-test=save]')
    const req = sent(clients, 1)
    expect(req.wifiNetwork.etag).toBe('10')
    expect(req.updateMask.paths).toEqual(['hidden']) // the new AP groups are not reverted
  })

  it('creates a network from the whole form', async () => {
    const clients = fake([])
    const { w } = await mountView(WifiNetworksView, clients)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    const ssid = q('[data-test=f-ssid] input') as HTMLInputElement
    ssid.value = 'guest'
    ssid.dispatchEvent(new Event('input'))
    const key = q('[data-test=f-key] input') as HTMLInputElement
    key.value = 'a-long-passphrase'
    key.dispatchEvent(new Event('input'))
    await flushPromises()
    await click('[data-test=save]')
    const sentNet = clients.wifi.createWifiNetwork.mock.calls[0]![0].wifiNetwork
    expect(sentNet.ssid).toBe('guest')
    expect(sentNet.securityKey).toBe('a-long-passphrase')
    expect(sentNet.security).toBe(WifiSecurity.WPA_PERSONAL)
  })

  it('deletes with the etag after confirmation', async () => {
    const clients = fake()
    const { w } = await mountView(WifiNetworksView, clients)
    await w.get('[data-test=delete]').trigger('click')
    await flushPromises()
    expect(clients.wifi.deleteWifiNetwork).toHaveBeenCalledWith({ id: 'w1', etag: '9' })
  })
})
