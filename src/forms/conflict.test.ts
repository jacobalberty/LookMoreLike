import { create } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { RadiusServerSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import { WifiNetworkSchema, type WifiNetwork } from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import { describe, expect, it, vi } from 'vitest'
import { analyzeConflict, saveMasked } from './conflict'
import { radiusFields, wifiFields } from './defs'
import { initialForm, type MaskedUpdate } from './mask'

const base = () =>
  create(WifiNetworkSchema, { id: 'w1', etag: '1', ssid: 'home', securityKey: 'hunter2hunter2', apGroups: ['attic'], hidden: false })

function harness(opts: { update?: (u: MaskedUpdate<WifiNetwork>) => Promise<WifiNetwork>; reload?: () => Promise<WifiNetwork> }) {
  const update = vi.fn(opts.update ?? (() => Promise.reject(new Error('unexpected update'))))
  const reload = vi.fn(opts.reload ?? (() => Promise.reject(new Error('unexpected reload'))))
  return { update, reload }
}

const aborted = () => new ConnectError('the resource changed', Code.Aborted)

describe('saveMasked', () => {
  it('does not call the controller when nothing changed', async () => {
    const b = base()
    const h = harness({})
    const r = await saveMasked({ defs: wifiFields, base: b, edited: initialForm(wifiFields, b), ...h })
    expect(r.status).toBe('unchanged')
    expect(h.update).not.toHaveBeenCalled()
    expect(h.reload).not.toHaveBeenCalled()
  })

  it('sends the mask and the etag of the version that was edited', async () => {
    const b = base()
    const saved = create(WifiNetworkSchema, { ...b, hidden: true, etag: '2' })
    const h = harness({ update: () => Promise.resolve(saved) })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    const r = await saveMasked({ defs: wifiFields, base: b, edited, ...h })
    expect(r).toEqual({ status: 'saved', value: saved, sent: ['hidden'] })
    expect(h.update).toHaveBeenCalledOnce()
    expect(h.update.mock.calls[0]?.[0]).toEqual({ paths: ['hidden'], values: { hidden: true }, etag: '1' })
  })

  it('on ABORTED re-reads and reports the conflict instead of retrying', async () => {
    const b = base()
    // Terraform changed the AP groups while the user was toggling "hidden".
    const latest = create(WifiNetworkSchema, { ...b, apGroups: ['attic', 'porch'], etag: '2' })
    const h = harness({ update: () => Promise.reject(aborted()), reload: () => Promise.resolve(latest) })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    const r = await saveMasked({ defs: wifiFields, base: b, edited, ...h })
    expect(r.status).toBe('conflict')
    if (r.status !== 'conflict') return
    expect(h.update).toHaveBeenCalledTimes(1) // not retried
    expect(h.reload).toHaveBeenCalledTimes(1)
    expect(r.conflict.latest).toBe(latest)
    expect(r.conflict.changedUpstream.map((d) => d.path)).toEqual(['ap_groups'])
    expect(r.conflict.clashing).toEqual([]) // the user's edit does not touch what changed
  })

  it('applying again is an explicit second save on the new version', async () => {
    const b = base()
    const latest = create(WifiNetworkSchema, { ...b, apGroups: ['porch'], etag: '2' })
    const h = harness({
      update: vi.fn().mockRejectedValueOnce(aborted()).mockResolvedValueOnce(create(WifiNetworkSchema, { ...latest, hidden: true, etag: '3' })),
      reload: () => Promise.resolve(latest),
    })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    const first = await saveMasked({ defs: wifiFields, base: b, edited, ...h })
    if (first.status !== 'conflict') throw new Error('expected a conflict')
    const second = await saveMasked({ defs: wifiFields, base: first.conflict.latest, edited: first.conflict.rebased, ...h })
    expect(second.status).toBe('saved')
    // The second request is guarded by the new etag and still names only
    // "hidden": the AP groups Terraform changed in between are not reverted.
    expect(h.update.mock.calls[1]?.[0]).toEqual({ paths: ['hidden'], values: { hidden: true }, etag: '2' })
  })

  it('re-applying a secret rotation after a conflict still sends the secret', async () => {
    const r = create(RadiusServerSchema, { id: 'r1', etag: '1', name: 'radius', address: '10.0.0.5' })
    const latest = create(RadiusServerSchema, { ...r, address: '10.0.0.6', etag: '2' })
    const edited = initialForm(radiusFields, r)
    edited.sharedSecret = 'new-secret'
    const c = analyzeConflict(radiusFields, r, latest, edited)
    expect(c.changedUpstream.map((d) => d.path)).toEqual(['address']) // the secret is never compared
    expect(c.rebased.sharedSecret).toBe('new-secret')
    expect(c.rebased.address).toBe('10.0.0.6')
  })

  describe('shared secrets', () => {
    const server = (over = {}) =>
      create(RadiusServerSchema, { id: 'r1', etag: '1', name: 'radius', address: '10.0.0.5', sharedSecretVersion: 2n, ...over })

    it('flags two clients rotating the same secret as a clash', async () => {
      const r = server()
      const latest = server({ etag: '2', sharedSecretVersion: 3n }) // someone else rotated it
      const edited = initialForm(radiusFields, r)
      edited.sharedSecret = 'my-new-secret'
      const c = analyzeConflict(radiusFields, r, latest, edited)
      expect(c.changedUpstream.map((d) => d.path)).toEqual(['shared_secret'])
      expect(c.clashing.map((d) => d.path)).toEqual(['shared_secret'])
      expect(c.rebased.sharedSecret).toBe('my-new-secret') // kept, but only on request
    })

    it('reports a rotation by someone else even when the user is not rotating', () => {
      const r = server()
      const latest = server({ etag: '2', sharedSecretVersion: 3n })
      const edited = initialForm(radiusFields, r)
      edited.name = 'renamed'
      const c = analyzeConflict(radiusFields, r, latest, edited)
      expect(c.changedUpstream.map((d) => d.path)).toEqual(['shared_secret'])
      expect(c.clashing).toEqual([]) // nothing of the user's overlaps
      expect(c.rebased.sharedSecret).toBe('') // and no secret is carried over
    })

    it('does not report a secret whose version did not move', () => {
      const r = server()
      const latest = server({ etag: '2', address: '10.0.0.6' })
      const edited = initialForm(radiusFields, r)
      edited.sharedSecret = 'my-new-secret'
      const c = analyzeConflict(radiusFields, r, latest, edited)
      expect(c.changedUpstream.map((d) => d.path)).toEqual(['address'])
      expect(c.clashing).toEqual([])
    })

    it('through a save: the raced rotation is shown, not retried', async () => {
      const r = server()
      const h = harness({
        update: () => Promise.reject(aborted()),
        reload: () => Promise.resolve(server({ etag: '2', sharedSecretVersion: 3n }) as never),
      })
      const edited = initialForm(radiusFields, r)
      edited.sharedSecret = 'my-new-secret'
      const res = await saveMasked({ defs: radiusFields, base: r, edited, update: h.update as never, reload: h.reload as never })
      expect(res.status).toBe('conflict')
      if (res.status === 'conflict') expect(res.conflict.clashing.map((d) => d.path)).toEqual(['shared_secret'])
      expect(h.update).toHaveBeenCalledTimes(1)
    })
  })

  it('reports a resource deleted while it was being edited', async () => {
    const b = base()
    const h = harness({
      update: () => Promise.reject(aborted()),
      reload: () => Promise.reject(new ConnectError('not found', Code.NotFound)),
    })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    expect((await saveMasked({ defs: wifiFields, base: b, edited, ...h })).status).toBe('deleted')
  })

  it('lets other errors through untouched', async () => {
    const b = base()
    const invalid = new ConnectError('ssid must be 1-32 bytes', Code.InvalidArgument)
    const h = harness({ update: () => Promise.reject(invalid) })
    const edited = initialForm(wifiFields, b)
    edited.ssid = ''
    await expect(saveMasked({ defs: wifiFields, base: b, edited, ...h })).rejects.toBe(invalid)
    expect(h.reload).not.toHaveBeenCalled()
  })
})

describe('analyzeConflict', () => {
  it('flags fields both sides changed to different values', () => {
    const b = base()
    const latest = create(WifiNetworkSchema, { ...b, ssid: 'tf-name', etag: '2' })
    const edited = initialForm(wifiFields, b)
    edited.ssid = 'ui-name'
    const c = analyzeConflict(wifiFields, b, latest, edited)
    expect(c.changedUpstream.map((d) => d.path)).toEqual(['ssid'])
    expect(c.clashing.map((d) => d.path)).toEqual(['ssid'])
  })

  it('does not call it a clash when both sides made the same change', () => {
    const b = base()
    const latest = create(WifiNetworkSchema, { ...b, hidden: true, etag: '2' })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    expect(analyzeConflict(wifiFields, b, latest, edited).clashing).toEqual([])
  })

  it('reports no upstream change when only unrelated state moved', () => {
    const b = base()
    const latest = create(WifiNetworkSchema, { ...b, etag: '2' })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    const c = analyzeConflict(wifiFields, b, latest, edited)
    expect(c.changedUpstream).toEqual([])
    expect(c.clashing).toEqual([])
  })

  it('rebases the edits onto the latest version', () => {
    const b = base()
    const latest = create(WifiNetworkSchema, { ...b, apGroups: ['porch'], ssid: 'tf-name', etag: '2' })
    const edited = initialForm(wifiFields, b)
    edited.hidden = true
    const c = analyzeConflict(wifiFields, b, latest, edited)
    expect(c.rebased.hidden).toBe(true) // the user's edit
    expect(c.rebased.apGroups).toEqual(['porch']) // someone else's change, kept
    expect(c.rebased.ssid).toBe('tf-name')
  })

  it('treats AP groups as a set when comparing versions', () => {
    const b = create(WifiNetworkSchema, { ...base(), apGroups: ['a', 'b'] })
    const latest = create(WifiNetworkSchema, { ...b, apGroups: ['b', 'a'], etag: '2' })
    expect(analyzeConflict(wifiFields, b, latest, {}).changedUpstream).toEqual([])
  })
})
