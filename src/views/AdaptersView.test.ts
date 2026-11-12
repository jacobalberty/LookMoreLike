import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { Code, ConnectError } from '@connectrpc/connect'
import { AdapterKind, AdapterSchema } from '@jacobalberty/beenfar-api/beenfar/admin/v1/adapter_pb'
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import AdaptersView from './AdaptersView.vue'

const KEY = '00112233445566778899aabbccddeeff'
const adapter = (over: MessageInitShape<typeof AdapterSchema> = {}) =>
  create(AdapterSchema, { name: 'unifi', kind: AdapterKind.BUILTIN, version: '0.3.0', healthy: true, connectTime: timestampFromDate(new Date('2026-11-12T10:00:00Z')), ...over })

function fake(list = [adapter()]) {
  return { adapters: { listAdapters: vi.fn().mockResolvedValue({ adapters: list }), importUnifiDeviceKeys: vi.fn().mockResolvedValue({ imported: 2 }) } }
}
const keys = (n = 2) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ mac: `de:ad:be:ef:00:0${i + 1}`, authkey: KEY, gcm: i === 0 })))

async function submit(w: Awaited<ReturnType<typeof mountView>>['w'], text: string) {
  const area = w.get('[data-test=keys] textarea')
  await area.setValue(text)
  await w.get('[data-test=import-keys]').trigger('click')
  await flushPromises()
}

describe('adapters', () => {
  it('lists adapters with their health', async () => {
    const { w } = await mountView(AdaptersView, fake([adapter(), adapter({ name: 'acme', kind: AdapterKind.EXTERNAL, healthy: false, statusMessage: 'connection lost' })]))
    expect(w.text()).toContain('built in')
    expect(w.text()).toContain('separate process')
    const health = w.findAll('[data-test=health]').map((h) => h.text())
    expect(health).toEqual(['healthy', 'not healthy'])
    expect(w.text()).toContain('connection lost')
  })

  it('says when no adapter is registered, and when loading failed', async () => {
    const { w } = await mountView(AdaptersView, fake([]))
    expect(w.find('[data-test=empty]').exists()).toBe(true)
    const broken = fake()
    broken.adapters.listAdapters.mockRejectedValue(new ConnectError('no', Code.PermissionDenied))
    const { w: w2 } = await mountView(AdaptersView, broken)
    expect(w2.get('[data-test=load-error]').text()).toContain('not allowed')
  })

  it('sends valid keys, then clears them from the page', async () => {
    const c = fake()
    const { w } = await mountView(AdaptersView, c)
    await submit(w, keys())
    const sent = c.adapters.importUnifiDeviceKeys.mock.calls[0]![0].devices
    expect(sent.map((d: { mac: string; gcm: boolean }) => [d.mac, d.gcm])).toEqual([['de:ad:be:ef:00:01', true], ['de:ad:be:ef:00:02', false]])
    expect(sent[0].authkey).toBe(KEY)
    expect((w.get('[data-test=keys] textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(w.html()).not.toContain(KEY)
  })

  it('sends nothing, and lists what is wrong, when the keys are invalid', async () => {
    const c = fake()
    const { w } = await mountView(AdaptersView, c)
    await submit(w, JSON.stringify([{ mac: 'de:ad:be:ef:00:01', authkey: 'short' }]))
    expect(c.adapters.importUnifiDeviceKeys).not.toHaveBeenCalled()
    expect(w.get('[data-test=key-problems]').text()).toContain('32 hex digits')
  })

  it("shows the controller's reason and keeps what was pasted when the import fails", async () => {
    const c = fake()
    c.adapters.importUnifiDeviceKeys.mockRejectedValue(new ConnectError('the unifi adapter is not connected', Code.FailedPrecondition))
    const { w } = await mountView(AdaptersView, c)
    await submit(w, keys(1))
    expect(w.get('[data-test=import-error]').text()).toContain('not connected')
    expect((w.get('[data-test=keys] textarea').element as HTMLTextAreaElement).value).not.toBe('')
  })

  it('does not offer to store an empty box', async () => {
    const { w } = await mountView(AdaptersView, fake())
    expect(w.get('[data-test=import-keys]').attributes('disabled')).toBeDefined()
  })
})
