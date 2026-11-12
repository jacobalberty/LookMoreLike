import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DeliveryNote from './DeliveryNote.vue'

describe('DeliveryNote', () => {
  it.each(['devices', 'network', 'wifi', 'radius'] as const)('says %s settings are stored, optional and unverified', (scope) => {
    const t = mount(DeliveryNote, { props: { scope } }).text()
    expect(t).toContain('Stored by beenfar')
    expect(t).toContain('optional')
    expect(t).toContain('experimental')
    expect(t).toContain('has not been verified on hardware')
    expect(t).toContain('cannot tell you here whether it is on')
  })

  it('never implies that a setting reached a device', () => {
    for (const scope of ['devices', 'network', 'wifi', 'radius'] as const) {
      const t = mount(DeliveryNote, { props: { scope } }).text()
      expect(t).not.toMatch(/\b(applied|pushed|synced|deployed)\b/i)
      expect(t).not.toMatch(/\bwill (be )?(sent|apply|applied)\b/i)
    }
  })

  it('names what the wifi push refuses, and that switch ports are never sent', () => {
    expect(mount(DeliveryNote, { props: { scope: 'wifi' } }).get('[data-test=wifi-limits]').text()).toMatch(/open and WEP.*guest.*refused/)
    expect(mount(DeliveryNote, { props: { scope: 'devices' } }).text()).toContain('never sent')
  })
})
