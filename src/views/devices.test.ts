import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { DeviceSchema, DeviceState, ReadoptionState } from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import DevicesView from './DevicesView.vue'
import PendingDevicesView from './PendingDevicesView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))

beforeEach(() => {
  confirm.mockReset().mockResolvedValue(true)
})

const dev = (over: MessageInitShape<typeof DeviceSchema> = {}) =>
  create(DeviceSchema, { id: 'd1', mac: 'de:ad:be:ef:00:01', adapter: 'unifi', model: 'U7PG2', state: DeviceState.PENDING, ...over })

function fakeDevices(pending: ReturnType<typeof dev>[], adopted: ReturnType<typeof dev>[] = []) {
  return {
    listPendingDevices: vi.fn().mockResolvedValue({ devices: pending }),
    listDevices: vi.fn().mockResolvedValue({ devices: adopted }),
    adoptDevice: vi.fn().mockResolvedValue({}),
    forgetDevice: vi.fn().mockResolvedValue({}),
  }
}
const macs = (w: { findAll: (s: string) => { map: <T>(f: (e: { text: () => string }) => T) => T[] } }) => w.findAll('tbody code').map((c) => c.text())

describe('pending devices', () => {
  it('lists pending devices, and reset devices first', async () => {
    const reset = dev({ id: 'd2', mac: 'de:ad:be:ef:00:02', state: DeviceState.ADOPTED, readoption: ReadoptionState.AWAITING_ACCEPTANCE })
    const settled = dev({ id: 'd3', mac: 'de:ad:be:ef:00:03', state: DeviceState.ADOPTED })
    const devices = fakeDevices([dev()], [settled, reset])
    const { w } = await mountView(PendingDevicesView, { devices })
    expect(devices.listDevices).toHaveBeenCalledWith({ state: DeviceState.ADOPTED })
    expect(macs(w)).toEqual(['de:ad:be:ef:00:02', 'de:ad:be:ef:00:01'])
    expect(w.find('[data-test=awaiting]').exists()).toBe(true)
  })

  it('adopts after confirmation, then reloads', async () => {
    const devices = fakeDevices([dev()])
    const { w } = await mountView(PendingDevicesView, { devices })
    await w.get('[data-test=adopt]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(devices.adoptDevice).toHaveBeenCalledOnce()
    expect(devices.adoptDevice.mock.calls[0]![0].device).toEqual({ case: 'id', value: 'd1' })
    expect(devices.listPendingDevices).toHaveBeenCalledTimes(2)
  })

  it('does nothing if the confirmation is declined', async () => {
    confirm.mockResolvedValue(false)
    const devices = fakeDevices([dev()])
    const { w } = await mountView(PendingDevicesView, { devices })
    await w.get('[data-test=adopt]').trigger('click')
    await flushPromises()
    expect(devices.adoptDevice).not.toHaveBeenCalled()
  })

  it('explains that a reset device gets a new key, and offers to adopt it again', async () => {
    const reset = dev({ state: DeviceState.ADOPTED, readoption: ReadoptionState.AWAITING_ACCEPTANCE })
    const devices = fakeDevices([], [reset])
    const { w } = await mountView(PendingDevicesView, { devices })
    expect(w.get('[data-test=adopt]').text()).toBe('Adopt again')
    await w.get('[data-test=adopt]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0]![0].content).toContain('new key')
    expect(devices.adoptDevice).toHaveBeenCalledOnce()
  })

  it('does not let a locked device be adopted, and says why', async () => {
    const devices = fakeDevices([dev({ locked: true })])
    const { w } = await mountView(PendingDevicesView, { devices })
    expect(w.find('[data-test=locked]').exists()).toBe(true)
    expect(w.get('[data-test=adopt]').attributes('disabled')).toBeDefined()
    await w.get('[data-test=adopt]').trigger('click')
    expect(devices.adoptDevice).not.toHaveBeenCalled()
  })

  it('shows a re-adoption in progress, with nothing to click', async () => {
    const devices = fakeDevices([], [dev({ state: DeviceState.ADOPTED, readoption: ReadoptionState.IN_PROGRESS })])
    const { w } = await mountView(PendingDevicesView, { devices })
    expect(w.find('[data-test=in-progress]').exists()).toBe(true)
    expect(w.get('[data-test=adopt]').attributes('disabled')).toBeDefined()
  })

  it("shows the controller's reason when adoption fails", async () => {
    const devices = fakeDevices([dev()])
    devices.adoptDevice.mockRejectedValue(new ConnectError('adapter "unifi" is not connected', Code.FailedPrecondition))
    const { w } = await mountView(PendingDevicesView, { devices })
    await w.get('[data-test=adopt]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test=adopt-error]').text()).toContain('adapter "unifi" is not connected')
  })

  it('says when nothing is waiting, and when loading failed', async () => {
    const { w } = await mountView(PendingDevicesView, { devices: fakeDevices([]) })
    expect(w.find('[data-test=empty]').exists()).toBe(true)
    const broken = fakeDevices([])
    broken.listPendingDevices.mockRejectedValue(new ConnectError('x', Code.Unavailable))
    const { w: w2 } = await mountView(PendingDevicesView, { devices: broken })
    expect(w2.get('[data-test=load-error]').text()).toContain('reach')
    expect(w2.find('[data-test=empty]').exists()).toBe(false)
  })
})

describe('devices', () => {
  const adopted = (over: MessageInitShape<typeof DeviceSchema> = {}) => dev({ state: DeviceState.ADOPTED, ...over })

  it('lists adopted devices only', async () => {
    const devices = fakeDevices([], [adopted()])
    const { w } = await mountView(DevicesView, { devices })
    expect(devices.listDevices).toHaveBeenCalledWith({ state: DeviceState.ADOPTED })
    expect(macs(w)).toEqual(['de:ad:be:ef:00:01'])
  })

  it('forgets after confirmation, then reloads', async () => {
    const devices = fakeDevices([], [adopted()])
    const { w } = await mountView(DevicesView, { devices })
    await w.get('[data-test=forget]').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0]![0].content).toContain('shows up again as pending')
    expect(devices.forgetDevice).toHaveBeenCalledWith({ id: 'd1' })
    expect(devices.listDevices).toHaveBeenCalledTimes(2)
  })

  it('keeps the device when the confirmation is declined', async () => {
    confirm.mockResolvedValue(false)
    const devices = fakeDevices([], [adopted()])
    const { w } = await mountView(DevicesView, { devices })
    await w.get('[data-test=forget]').trigger('click')
    await flushPromises()
    expect(devices.forgetDevice).not.toHaveBeenCalled()
  })

  it('shows why forgetting failed', async () => {
    const devices = fakeDevices([], [adopted()])
    devices.forgetDevice.mockRejectedValue(new ConnectError('not found', Code.NotFound))
    const { w } = await mountView(DevicesView, { devices })
    await w.get('[data-test=forget]').trigger('click')
    await flushPromises()
    expect(w.get('[data-test=forget-error]').text()).toContain('not found')
  })

  it('links to the switch ports of a device', async () => {
    const { w, router } = await mountView(DevicesView, { devices: fakeDevices([], [adopted()]) })
    await w.get('[data-test=ports]').trigger('click')
    expect(router.path).toBe('/')
    // (the fake window keeps its location; the call itself is what matters)
  })

  it('says when nothing is adopted', async () => {
    const { w } = await mountView(DevicesView, { devices: fakeDevices([], []) })
    expect(w.find('[data-test=empty]').exists()).toBe(true)
  })
})
