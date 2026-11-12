import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { DeviceSchema, DeviceState } from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
import { NetworkSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import { PoeMode, SwitchPortSchema, SwitchPortTagging, type SwitchPort } from '@jacobalberty/beenfar-api/beenfar/config/v1/switch_port_pb'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import SwitchPortsView from './SwitchPortsView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))
beforeEach(() => confirm.mockReset().mockResolvedValue(true))

const device = (id: string, mac: string) => create(DeviceSchema, { id, mac, model: 'USW-Lite-8-PoE', state: DeviceState.ADOPTED })
const port = (over: MessageInitShape<typeof SwitchPortSchema> = {}) =>
  create(SwitchPortSchema, {
    id: 'p1',
    etag: '5',
    deviceId: 'd1',
    portIndex: 3,
    name: 'office',
    nativeNetworkId: 'lan',
    tagging: SwitchPortTagging.CUSTOM,
    taggedNetworkIds: ['iot', 'cams'], // set by Terraform
    poeMode: PoeMode.AUTO,
    ...over,
  })

function fake(ports: SwitchPort[] = [port()], devices = [device('d1', 'de:ad:be:ef:00:01'), device('d2', 'de:ad:be:ef:00:02')]) {
  return {
    devices: { listDevices: vi.fn().mockResolvedValue({ devices }) },
    networks: {
      listNetworks: vi.fn().mockResolvedValue({
        networks: ['lan', 'iot', 'cams'].map((id) => create(NetworkSchema, { id, name: id })),
      }),
    },
    ports: {
      listSwitchPorts: vi.fn().mockResolvedValue({ switchPorts: ports }),
      getSwitchPort: vi.fn().mockResolvedValue({ switchPort: ports[0] }),
      createSwitchPort: vi.fn().mockImplementation(({ switchPort }) => Promise.resolve({ switchPort })),
      updateSwitchPort: vi.fn().mockImplementation(({ switchPort }) => Promise.resolve({ switchPort })),
      deleteSwitchPort: vi.fn().mockResolvedValue({}),
    },
  }
}
type Clients = ReturnType<typeof fake>

const q = (sel: string) => document.body.querySelector(sel)
const click = async (sel: string) => {
  ;(q(sel) as HTMLElement).click()
  await flushPromises()
}
const by = (w: VueWrapper, c: typeof NSelect | typeof NSwitch | typeof NInputNumber, test: string) => {
  const found = w.findAllComponents(c).find((x) => x.attributes('data-test') === test)
  if (!found) throw new Error(`no ${test}`)
  return found
}
const choose = async (w: VueWrapper, test: string, v: unknown) => {
  by(w, NSelect, test).vm.$emit('update:value', v)
  await flushPromises()
}
const sent = (c: Clients, call = 0) => c.ports.updateSwitchPort.mock.calls[call]![0]

describe('switch ports', () => {
  it('says plainly that the settings are stored but not applied to devices', async () => {
    const { w } = await mountView(SwitchPortsView, fake())
    expect(w.get('[data-test=not-applied]').text()).toContain('does not send them to devices')
  })

  it("lists the first adopted device's ports, or the device named in the address", async () => {
    const c = fake()
    await mountView(SwitchPortsView, c)
    expect(c.ports.listSwitchPorts).toHaveBeenCalledWith({ deviceId: 'd1' })
    const c2 = fake()
    const { router } = await mountView(SwitchPortsView, c2, { path: '/switch-ports' })
    expect(router.path).toBe('/switch-ports')
  })

  it('shows what each port carries, by network name', async () => {
    const { w } = await mountView(SwitchPortsView, fake())
    expect(w.text()).toContain('office')
    expect(w.text()).toContain('iot, cams')
  })

  it('renaming a port names only the name, leaving the VLANs Terraform manages', async () => {
    const c = fake()
    const { w } = await mountView(SwitchPortsView, c)
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    const name = q('[data-test=f-name] input') as HTMLInputElement
    name.value = 'office AP'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    await click('[data-test=save]')
    const req = sent(c)
    expect(req.updateMask.paths).toEqual(['name'])
    expect(req.switchPort.name).toBe('office AP')
    expect(req.switchPort.taggedNetworkIds).toEqual([])
    expect(req.switchPort.nativeNetworkId).toBe('')
    expect(req.switchPort.etag).toBe('5')
    expect(q('[data-test=f-index-fixed]')?.textContent).toBe('3') // the port itself cannot change
  })

  it('leaving "selected networks" empties the list and names both fields', async () => {
    const c = fake()
    const { w } = await mountView(SwitchPortsView, c)
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    await choose(w, 'f-tagging', SwitchPortTagging.NONE)
    expect(q('[data-test=f-tagged]')).toBeNull()
    await click('[data-test=save]')
    expect(sent(c).updateMask.paths).toEqual(['tagging', 'tagged_network_ids'])
  })

  it('choosing a native network removes it from the tagged ones', async () => {
    const c = fake()
    const { w } = await mountView(SwitchPortsView, c)
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    await choose(w, 'f-native', 'iot')
    await click('[data-test=save]')
    expect(sent(c).updateMask.paths).toEqual(['native_network_id', 'tagged_network_ids'])
    expect(sent(c).switchPort.taggedNetworkIds).toEqual(['cams'])
  })

  it('creates settings for a port number on the chosen device', async () => {
    const c = fake([])
    const { w } = await mountView(SwitchPortsView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await click('[data-test=save]')
    expect(q('[data-test=editor-error]')?.textContent).toContain('port number')
    expect(c.ports.createSwitchPort).not.toHaveBeenCalled()
    by(w, NInputNumber, 'f-index').vm.$emit('update:value', 5)
    await flushPromises()
    await click('[data-test=save]')
    const sentPort = c.ports.createSwitchPort.mock.calls[0]![0].switchPort
    expect(sentPort.deviceId).toBe('d1')
    expect(sentPort.portIndex).toBe(5)
  })

  it('shows the controller\'s reason when creating fails', async () => {
    const c = fake([])
    c.ports.createSwitchPort.mockRejectedValue(new ConnectError('port already has settings', Code.AlreadyExists))
    const { w } = await mountView(SwitchPortsView, c)
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    by(w, NInputNumber, 'f-index').vm.$emit('update:value', 3)
    await flushPromises()
    await click('[data-test=save]')
    expect(q('[data-test=editor-error]')?.textContent).toContain('already has settings')
  })

  it('restores defaults with the etag after confirmation', async () => {
    const c = fake()
    const { w } = await mountView(SwitchPortsView, c)
    await w.get('[data-test=restore]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0]![0].content).toContain("device's defaults")
    expect(c.ports.deleteSwitchPort).toHaveBeenCalledWith({ id: 'p1', etag: '5' })
  })

  it('explains when no device is adopted', async () => {
    const c = fake([], [])
    const { w } = await mountView(SwitchPortsView, c)
    expect(w.find('[data-test=no-devices]').exists()).toBe(true)
    expect(c.ports.listSwitchPorts).not.toHaveBeenCalled()
  })
})
