import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { RadiusServerSchema, type RadiusServer } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountView } from '@/test-utils'
import RadiusServersView from './RadiusServersView.vue'

const confirm = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }))
beforeEach(() => confirm.mockReset().mockResolvedValue(true))

const server = (over: MessageInitShape<typeof RadiusServerSchema> = {}) =>
  create(RadiusServerSchema, { id: 'r1', etag: '3', name: 'office', address: '10.0.0.5', authPort: 1812, accountingPort: 1813, sharedSecretVersion: 2n, ...over })

function fake(list: RadiusServer[] = [server()]) {
  return {
    listRadiusServers: vi.fn().mockResolvedValue({ radiusServers: list }),
    getRadiusServer: vi.fn().mockResolvedValue({ radiusServer: list[0] }),
    // The controller never returns the secret.
    createRadiusServer: vi.fn().mockImplementation(({ radiusServer }) => Promise.resolve({ radiusServer: { ...radiusServer, sharedSecret: '', sharedSecretVersion: 1n } })),
    updateRadiusServer: vi.fn().mockImplementation(({ radiusServer }) => Promise.resolve({ radiusServer: { ...radiusServer, sharedSecret: '' } })),
    deleteRadiusServer: vi.fn().mockResolvedValue({}),
  }
}
const q = (sel: string) => document.body.querySelector(sel)
const type = async (sel: string, value: string) => {
  const el = q(sel) as HTMLInputElement
  el.value = value
  el.dispatchEvent(new Event('input'))
  await flushPromises()
}
const click = async (sel: string) => {
  ;(q(sel) as HTMLElement).click()
  await flushPromises()
}

describe('RADIUS servers', () => {
  it('lists servers with the secret version, never a secret', async () => {
    const { w } = await mountView(RadiusServersView, { radius: fake() })
    expect(w.text()).toContain('office')
    expect(w.text()).toContain('stored · version 2')
  })

  it('says delivery to devices is optional and unverified', async () => {
    const { w } = await mountView(RadiusServersView, { radius: fake() })
    expect(w.get('[data-test=delivery-note]').text()).toContain('experimental')
  })

  it('does not pre-fill the secret when editing, and keeps it unless replaced', async () => {
    const radius = fake()
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    expect(q('[data-test=secret-kept]')?.textContent).toContain('never shown')
    expect(q('[data-test=f-secret]')).toBeNull() // no secret box at all
    await type('[data-test=f-name] input', 'office-2')
    await click('[data-test=save]')
    const req = radius.updateRadiusServer.mock.calls[0]![0]
    expect(req.updateMask.paths).toEqual(['name'])
    expect(req.radiusServer.sharedSecret).toBe('')
  })

  it('rotates the secret with a mask naming only the secret', async () => {
    const radius = fake()
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=rotate]').trigger('click')
    await flushPromises()
    const box = q('[data-test=f-secret] input') as HTMLInputElement
    expect(box.value).toBe('')
    expect(box.type).toBe('password')
    await type('[data-test=f-secret] input', 'a-brand-new-secret')
    await click('[data-test=save]')
    const req = radius.updateRadiusServer.mock.calls[0]![0]
    expect(req.updateMask.paths).toEqual(['shared_secret'])
    expect(req.radiusServer.sharedSecret).toBe('a-brand-new-secret')
    expect(req.radiusServer.name).toBe('')
    expect(req.radiusServer.address).toBe('')
  })

  it('does not call the controller when the secret box is left empty', async () => {
    const radius = fake()
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=rotate]').trigger('click')
    await flushPromises()
    await click('[data-test=save]')
    expect(radius.updateRadiusServer).not.toHaveBeenCalled()
  })

  it('leaves no trace of a typed secret after saving', async () => {
    const radius = fake()
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=rotate]').trigger('click')
    await flushPromises()
    await type('[data-test=f-secret] input', 'a-brand-new-secret')
    await click('[data-test=save]')
    expect(document.body.innerHTML).not.toContain('a-brand-new-secret')
    expect(w.html()).not.toContain('a-brand-new-secret')
    // Reopening starts empty.
    await w.get('[data-test=rotate]').trigger('click')
    await flushPromises()
    expect((q('[data-test=f-secret] input') as HTMLInputElement).value).toBe('')
  })

  it('requires a secret to create a server', async () => {
    const radius = fake([])
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=new]').trigger('click')
    await flushPromises()
    await type('[data-test=f-name] input', 'new')
    await type('[data-test=f-address] input', '10.0.0.9')
    await click('[data-test=save]')
    expect(radius.createRadiusServer).not.toHaveBeenCalled()
    expect(q('[data-test=editor-error]')?.textContent).toContain('secret is required')
    await type('[data-test=f-secret] input', 'initial-secret')
    await click('[data-test=save]')
    const sent = radius.createRadiusServer.mock.calls[0]![0].radiusServer
    expect(sent.sharedSecret).toBe('initial-secret')
    expect(sent.name).toBe('new')
  })

  it('shows the controller\'s message for a bad address', async () => {
    const radius = fake()
    radius.updateRadiusServer.mockRejectedValue(new ConnectError('address must be an IPv4 or IPv6 address', Code.InvalidArgument))
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=edit]').trigger('click')
    await flushPromises()
    await type('[data-test=f-address] input', 'nope')
    await click('[data-test=save]')
    expect(q('[data-test=editor-error]')?.textContent).toContain('IPv4 or IPv6')
  })

  it('keeps a typed secret through a conflict and applies it only when asked', async () => {
    const radius = fake()
    radius.updateRadiusServer.mockRejectedValueOnce(new ConnectError('changed', Code.Aborted))
    radius.getRadiusServer.mockResolvedValue({ radiusServer: server({ etag: '4', address: '10.0.0.6' }) })
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=rotate]').trigger('click')
    await flushPromises()
    await type('[data-test=f-secret] input', 'rotated-secret')
    await click('[data-test=save]')
    expect(q('[data-test=conflict]')?.textContent).toContain('Address')
    expect(radius.updateRadiusServer).toHaveBeenCalledTimes(1)
    await click('[data-test=keep-mine]')
    expect((q('[data-test=f-secret] input') as HTMLInputElement).value).toBe('rotated-secret')
    await click('[data-test=save]')
    const req = radius.updateRadiusServer.mock.calls[1]![0]
    expect(req.radiusServer.etag).toBe('4')
    expect(req.updateMask.paths).toEqual(['shared_secret']) // the new address is not reverted
  })

  it('warns when someone else rotated the secret too, without showing any secret', async () => {
    const radius = fake()
    radius.updateRadiusServer.mockRejectedValueOnce(new ConnectError('changed', Code.Aborted))
    radius.getRadiusServer.mockResolvedValue({ radiusServer: server({ etag: '4', sharedSecretVersion: 3n }) })
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=rotate]').trigger('click')
    await flushPromises()
    await type('[data-test=f-secret] input', 'my-rotated-secret')
    await click('[data-test=save]')
    const notice = q('[data-test=conflict]')?.textContent ?? ''
    expect(notice).toContain('Shared secret')
    expect(notice).toContain('was replaced by someone else')
    expect(notice).toContain('keeping your edits replaces their secret')
    expect(notice).not.toContain('my-rotated-secret')
    expect(q('[data-test=changed-shared_secret]')).not.toBeNull()
    expect(radius.updateRadiusServer).toHaveBeenCalledTimes(1) // not retried
  })

  it('deletes with the etag after confirmation, and says when a wifi network uses it', async () => {
    const radius = fake()
    radius.deleteRadiusServer.mockRejectedValue(new ConnectError('radius server r1 is used by 1 wireless network(s)', Code.FailedPrecondition))
    const { w } = await mountView(RadiusServersView, { radius })
    await w.get('[data-test=delete]').trigger('click')
    await flushPromises()
    expect(radius.deleteRadiusServer).toHaveBeenCalledWith({ id: 'r1', etag: '3' })
    expect(w.get('[data-test=delete-error]').text()).toContain('used by 1 wireless')
  })
})
