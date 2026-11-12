import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { FieldWriterKind, FieldWriterSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/field_writer_pb'
import { NetworkSchema, type Network } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import NetworksView from './NetworksView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))
beforeEach(() => confirm.mockReset().mockResolvedValue(true))

const net = (over: MessageInitShape<typeof NetworkSchema> = {}) =>
  create(NetworkSchema, { id: 'n1', etag: '4', name: 'iot', vlanId: 20, subnet: '10.0.20.1/24', dhcpEnabled: true, dhcpStart: '10.0.20.100', dhcpStop: '10.0.20.200', ...over })

function fake(list: Network[] = [net()]) {
  return {
    listNetworks: vi.fn().mockResolvedValue({ networks: list }),
    getNetwork: vi.fn().mockResolvedValue({ network: list[0] }),
    createNetwork: vi.fn().mockImplementation(({ network }) => Promise.resolve({ network })),
    updateNetwork: vi.fn().mockImplementation(({ network }) => Promise.resolve({ network })),
    deleteNetwork: vi.fn().mockResolvedValue({}),
  }
}
const input = (name: string) => `[data-test=${name}] input`
const body = () => document.body

describe('networks', () => {
  it('lists networks', async () => {
    const { w } = await mountView(NetworksView, { networks: fake() })
    expect(w.text()).toContain('iot')
    expect(w.text()).toContain('10.0.20.1/24')
    expect(w.text()).toContain('10.0.20.100 – 10.0.20.200')
  })

  it('says delivery to devices is optional and unverified', async () => {
    const { w } = await mountView(NetworksView, { networks: fake() })
    expect(w.get('[data-test=delivery-note]').text()).toContain('experimental')
  })

  it('edits one field and sends a mask naming only it', async () => {
    const networks = fake()
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    const domain = body().querySelector(input('f-domain')) as HTMLInputElement
    domain.value = 'iot.lan'
    domain.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(body().querySelector('[data-test=save]') as HTMLElement).click()
    await flushPromises()
    expect(networks.updateNetwork).toHaveBeenCalledOnce()
    const req = networks.updateNetwork.mock.calls[0]![0]
    expect(req.updateMask.paths).toEqual(['domain_name'])
    expect(req.network.id).toBe('n1')
    expect(req.network.etag).toBe('4')
    expect(req.network.domainName).toBe('iot.lan')
    // Nothing else is sent, so nothing else is overwritten.
    expect(req.network.name).toBe('')
    expect(req.network.subnet).toBe('')
    expect(req.network.vlanId).toBe(0)
    expect(networks.listNetworks).toHaveBeenCalledTimes(2)
  })

  it('shows who last set each field in the edit dialog', async () => {
    const withWriters = net({
      fieldWriters: [
        create(FieldWriterSchema, { field: 'vlan_id', writer: 'terraform-ci', kind: FieldWriterKind.API_TOKEN, writeTime: timestampFromDate(new Date(Date.now() - 3 * 86400_000)) }),
      ],
    })
    const { w } = await mountView(NetworksView, { networks: fake([withWriters]) })
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    expect(body().querySelector('[data-test=writer-vlan_id]')?.textContent).toContain('last set by API token terraform-ci')
    expect(body().querySelector('[data-test=writer-name]')).toBeNull() // never written: nothing claimed
  })

  it('does not call the controller when nothing was changed', async () => {
    const networks = fake()
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    ;(body().querySelector('[data-test=save]') as HTMLElement).click()
    await flushPromises()
    expect(networks.updateNetwork).not.toHaveBeenCalled()
  })

  it('shows what changed on a conflict and does not retry', async () => {
    const networks = fake()
    networks.updateNetwork.mockRejectedValue(new ConnectError('changed', Code.Aborted))
    networks.getNetwork.mockResolvedValue({ network: net({ etag: '5', dhcpStop: '10.0.20.250' }) })
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    const domain = body().querySelector(input('f-domain')) as HTMLInputElement
    domain.value = 'iot.lan'
    domain.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(body().querySelector('[data-test=save]') as HTMLElement).click()
    await flushPromises()
    expect(networks.updateNetwork).toHaveBeenCalledTimes(1)
    const notice = body().querySelector('[data-test=conflict]')
    expect(notice?.textContent).toContain('DHCP range end')
    expect(notice?.textContent).toContain('10.0.20.250')
    expect(body().querySelector('[data-test=keep-mine]')).not.toBeNull()
    expect((body().querySelector('[data-test=save]') as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates a network from the whole form', async () => {
    const networks = fake([])
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    const name = body().querySelector(input('f-name')) as HTMLInputElement
    name.value = 'guests'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(body().querySelector('[data-test=save]') as HTMLElement).click()
    await flushPromises()
    expect(networks.createNetwork).toHaveBeenCalledOnce()
    expect(networks.createNetwork.mock.calls[0]![0].network.name).toBe('guests')
  })

  it("shows the controller's validation message and keeps the dialog", async () => {
    const networks = fake([])
    networks.createNetwork.mockRejectedValue(new ConnectError('name must be 1-64 bytes', Code.InvalidArgument))
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    ;(body().querySelector('[data-test=save]') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('[data-test=editor-error]')?.textContent).toContain('name must be 1-64 bytes')
  })

  it('deletes with the etag, after confirmation', async () => {
    const networks = fake()
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=delete]').trigger('click')
    await flushPromises()
    expect(networks.deleteNetwork).toHaveBeenCalledWith({ id: 'n1', etag: '4' })
  })

  it('says why a network cannot be deleted', async () => {
    const networks = fake()
    networks.deleteNetwork.mockRejectedValue(new ConnectError('network n1 is used by 1 wireless network(s)', Code.FailedPrecondition))
    const { w } = await mountView(NetworksView, { networks })
    await w.get('[data-test=delete]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test=delete-error]').text()).toContain('used by 1 wireless')
  })
})
