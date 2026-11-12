import { create, type MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { WifiNetworkSchema, type WifiNetwork } from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import { describe, expect, it, vi } from 'vitest'
import { wifiFields } from '@/forms/defs'
import { useEditor } from './useEditor'

const wifi = (over: MessageInitShape<typeof WifiNetworkSchema> = {}) =>
  create(WifiNetworkSchema, { id: 'w1', etag: '1', ssid: 'home', securityKey: 'hunter2hunter2', apGroups: ['attic'], ...over })

function editor(over: Record<string, unknown> = {}) {
  const update = vi.fn().mockImplementation((u, base) => Promise.resolve(wifi({ ...u.values, etag: String(Number(base.etag) + 1) })))
  const create_ = vi.fn().mockImplementation((form) => Promise.resolve(wifi({ ...form, id: 'new' })))
  const reload = vi.fn()
  const saved = vi.fn()
  const e = useEditor<WifiNetwork>({ defs: wifiFields, blank: () => ({ ssid: '' }), reload, create: create_, update, saved, ...over })
  return { e, update, create: create_, reload, saved }
}

describe('useEditor', () => {
  it('edits with a mask of the changed fields only', async () => {
    const { e, update, saved } = editor()
    e.startEdit(wifi())
    e.state.form.hidden = true
    expect(await e.save()).toBe('saved')
    expect(update.mock.calls[0]![0]).toEqual({ paths: ['hidden'], values: { hidden: true }, etag: '1' })
    expect(e.state.open).toBe(false)
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), 'edit')
  })

  it('ignores a second save while one is in flight', async () => {
    let finish!: (w: WifiNetwork) => void
    const update = vi.fn().mockReturnValue(new Promise<WifiNetwork>((ok) => (finish = ok)))
    const { e, saved } = editor({ update })
    e.startEdit(wifi())
    e.state.form.hidden = true
    const first = e.save()
    expect(e.state.saving).toBe(true)
    await e.save() // Enter pressed again, say
    expect(update).toHaveBeenCalledTimes(1)
    finish(wifi({ hidden: true, etag: '2' }))
    expect(await first).toBe('saved')
    expect(update).toHaveBeenCalledTimes(1)
    expect(saved).toHaveBeenCalledTimes(1)
    expect(e.state.saving).toBe(false)
  })

  it('closes without a request when nothing changed', async () => {
    const { e, update } = editor()
    e.startEdit(wifi())
    expect(await e.save()).toBe('unchanged')
    expect(update).not.toHaveBeenCalled()
    expect(e.state.open).toBe(false)
  })

  it('creates from the whole form', async () => {
    const { e, create: create_, update, saved } = editor()
    e.startCreate()
    e.state.form.ssid = 'guest'
    expect(await e.save()).toBe('saved')
    expect(create_).toHaveBeenCalledWith({ ssid: 'guest' })
    expect(update).not.toHaveBeenCalled()
    expect(saved).toHaveBeenCalledWith(expect.anything(), 'create')
  })

  it("keeps the dialog open and shows the controller's reason when saving fails", async () => {
    const { e } = editor({ update: vi.fn().mockRejectedValue(new ConnectError('ssid already in use', Code.AlreadyExists)) })
    e.startEdit(wifi())
    e.state.form.ssid = 'taken'
    expect(await e.save()).toBe('error')
    expect(e.state.open).toBe(true)
    expect(e.state.error).toBe('ssid already in use')
    expect(e.state.form.ssid).toBe('taken')
    expect(e.state.saving).toBe(false)
  })

  describe('conflicts', () => {
    // Terraform changed the AP groups while the user toggled "hidden".
    const upstream = () => wifi({ apGroups: ['attic', 'porch'], etag: '2' })

    function conflicted() {
      const update = vi.fn().mockRejectedValue(new ConnectError('changed', Code.Aborted))
      const reload = vi.fn().mockResolvedValue(upstream())
      const h = editor({ update, reload })
      h.e.startEdit(wifi())
      h.e.state.form.hidden = true
      return { ...h, update, reload }
    }

    it('shows what changed and sends nothing more', async () => {
      const { e, update, reload } = conflicted()
      expect(await e.save()).toBe('conflict')
      expect(update).toHaveBeenCalledTimes(1)
      expect(reload).toHaveBeenCalledTimes(1)
      expect(e.state.open).toBe(true)
      expect(e.state.conflict?.changedUpstream.map((d) => d.path)).toEqual(['ap_groups'])
      expect(e.state.form.hidden).toBe(true) // the user's edit is kept
      expect(e.state.error).toBe('')
    })

    it('keeping my edits moves them onto the latest version, without saving', async () => {
      const { e, update } = conflicted()
      await e.save()
      e.keepMyEdits()
      expect(e.state.conflict).toBeUndefined()
      expect(e.state.base?.etag).toBe('2')
      expect(e.state.form.hidden).toBe(true)
      expect(e.state.form.apGroups).toEqual(['attic', 'porch'])
      expect(update).toHaveBeenCalledTimes(1)
    })

    it('saving afterwards is guarded by the new etag and still names only my field', async () => {
      const h = conflicted()
      await h.e.save()
      h.e.keepMyEdits()
      h.update.mockReset().mockResolvedValue(wifi({ hidden: true, apGroups: ['attic', 'porch'], etag: '3' }))
      expect(await h.e.save()).toBe('saved')
      expect(h.update.mock.calls[0]![0]).toEqual({ paths: ['hidden'], values: { hidden: true }, etag: '2' })
    })

    it('discarding my edits shows the latest version', async () => {
      const { e } = conflicted()
      await e.save()
      e.discardMyEdits()
      expect(e.state.form.hidden).toBe(false)
      expect(e.state.form.apGroups).toEqual(['attic', 'porch'])
      expect(e.state.base?.etag).toBe('2')
    })

    it('reports a resource that was deleted meanwhile', async () => {
      const { e } = editor({
        update: vi.fn().mockRejectedValue(new ConnectError('changed', Code.Aborted)),
        reload: vi.fn().mockRejectedValue(new ConnectError('not found', Code.NotFound)),
      })
      e.startEdit(wifi())
      e.state.form.hidden = true
      expect(await e.save()).toBe('deleted')
      expect(e.state.error).toContain('deleted')
    })
  })

  it('stops a save the form fails to validate, without calling the controller', async () => {
    const { e, create: create_ } = editor({ validate: (f: { ssid?: string }) => (f.ssid ? undefined : 'An SSID is required.') })
    e.startCreate()
    expect(await e.save()).toBe('error')
    expect(e.state.error).toBe('An SSID is required.')
    expect(create_).not.toHaveBeenCalled()
    expect(e.state.open).toBe(true)
  })

  it('clears secrets from the form when the dialog closes', async () => {
    const { e } = editor({ defs: [{ path: 'security_key', key: 'securityKey', kind: 'secret' }, ...wifiFields.filter((d) => d.path !== 'security_key')] })
    e.startEdit(wifi())
    e.state.form.securityKey = 'typed-secret'
    e.close()
    expect(e.state.form.securityKey).toBe('')
  })

  it('forgets everything when reopened', async () => {
    const { e } = conflicted2()
    expect(e.state.error).toBe('')
    expect(e.state.conflict).toBeUndefined()
    expect(e.state.form).toEqual({ ssid: '' })
  })
})

function conflicted2() {
  const h = editor({ update: vi.fn().mockRejectedValue(new Error('x')) })
  h.e.startEdit(wifi())
  h.e.state.form.hidden = true
  void h.e.save()
  h.e.close()
  h.e.startCreate()
  return h
}
