import { create } from '@bufbuild/protobuf'
import { RadiusServerSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import { SwitchPortSchema, SwitchPortTagging } from '@jacobalberty/beenfar-api/beenfar/config/v1/switch_port_pb'
import { WifiNetworkSchema, WifiSecurity } from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import { describe, expect, it } from 'vitest'
import { radiusFields, switchPortFields, wifiFields } from './defs'
import { buildUpdate, changedFields, initialForm } from './mask'

const wifi = () =>
  create(WifiNetworkSchema, {
    id: 'w1',
    etag: '7',
    ssid: 'home',
    security: WifiSecurity.WPA_PERSONAL,
    securityKey: 'hunter2hunter2',
    apGroups: ['attic', 'garage'],
    hidden: false,
  })

describe('buildUpdate', () => {
  it('names only the field that changed', () => {
    const w = wifi()
    const form = initialForm(wifiFields, w)
    form.hidden = true
    const u = buildUpdate(wifiFields, w, form)
    expect(u).not.toBeNull()
    expect(u?.paths).toEqual(['hidden'])
    expect(u?.values).toEqual({ hidden: true })
    expect(u?.etag).toBe('7')
  })

  it('does not carry unchanged fields in the values either', () => {
    const w = wifi()
    const form = initialForm(wifiFields, w)
    form.ssid = 'home2'
    expect(Object.keys(buildUpdate(wifiFields, w, form)?.values ?? {})).toEqual(['ssid'])
  })

  it('sends nothing when nothing changed', () => {
    const w = wifi()
    expect(buildUpdate(wifiFields, w, initialForm(wifiFields, w))).toBeNull()
  })

  it('sends nothing when a change is undone', () => {
    const w = wifi()
    const form = initialForm(wifiFields, w)
    form.ssid = 'other'
    form.ssid = 'home'
    expect(buildUpdate(wifiFields, w, form)).toBeNull()
  })

  it('treats AP groups as a set: order alone is not a change', () => {
    const w = wifi()
    const form = initialForm(wifiFields, w)
    form.apGroups = ['garage', 'attic']
    expect(buildUpdate(wifiFields, w, form)).toBeNull()
    form.apGroups = ['garage', 'attic', 'porch']
    expect(buildUpdate(wifiFields, w, form)?.paths).toEqual(['ap_groups'])
    form.apGroups = []
    expect(buildUpdate(wifiFields, w, form)?.paths).toEqual(['ap_groups'])
  })

  it('names several changed fields, in the screen order', () => {
    const w = wifi()
    const form = initialForm(wifiFields, w)
    form.hidden = true
    form.ssid = 'new'
    expect(buildUpdate(wifiFields, w, form)?.paths).toEqual(['ssid', 'hidden'])
  })

  it('only considers fields the form holds', () => {
    const w = wifi()
    expect(changedFields(wifiFields, w, { hidden: true })).toHaveLength(1)
    expect(buildUpdate(wifiFields, w, {})).toBeNull()
  })

  it('never includes ids, etags or times', () => {
    const paths = [...wifiFields, ...switchPortFields, ...radiusFields].map((d) => d.path)
    for (const p of ['id', 'etag', 'create_time', 'update_time', 'field_writers', 'device_id', 'port_index']) {
      expect(paths).not.toContain(p)
    }
  })

  it('keeps unchanged enum fields out of the mask', () => {
    const p = create(SwitchPortSchema, { id: 'p1', etag: '2', tagging: SwitchPortTagging.CUSTOM, taggedNetworkIds: ['a', 'b'] })
    const form = initialForm(switchPortFields, p)
    form.taggedNetworkIds = ['b', 'a']
    form.name = 'uplink'
    expect(buildUpdate(switchPortFields, p, form)?.paths).toEqual(['name'])
  })
})

describe('secrets', () => {
  const server = () => create(RadiusServerSchema, { id: 'r1', etag: '3', name: 'radius', address: '10.0.0.5', authPort: 1812 })

  it('starts empty, even if a value were present', () => {
    const leaked = create(RadiusServerSchema, { id: 'r1', etag: '3', sharedSecret: 'must-not-appear' })
    expect(initialForm(radiusFields, leaked).sharedSecret).toBe('')
    expect(initialForm(radiusFields, server()).sharedSecret).toBe('')
  })

  it('is left out of the mask when empty', () => {
    const r = server()
    const form = initialForm(radiusFields, r)
    form.name = 'radius-2'
    const u = buildUpdate(radiusFields, r, form)
    expect(u?.paths).toEqual(['name'])
    expect(u?.values).not.toHaveProperty('sharedSecret')
  })

  it('is the only field in a rotation', () => {
    const r = server()
    const form = initialForm(radiusFields, r)
    form.sharedSecret = 'brand-new-secret'
    const u = buildUpdate(radiusFields, r, form)
    expect(u?.paths).toEqual(['shared_secret'])
    expect(u?.values).toEqual({ sharedSecret: 'brand-new-secret' })
  })

  it('does not treat clearing the box as a rotation', () => {
    const r = server()
    const form = initialForm(radiusFields, r)
    form.sharedSecret = 'typed'
    form.sharedSecret = ''
    expect(buildUpdate(radiusFields, r, form)).toBeNull()
  })
})
