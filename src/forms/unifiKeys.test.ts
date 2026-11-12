import { describe, expect, it } from 'vitest'
import { parseUnifiKeys } from './unifiKeys'

const KEY = '00112233445566778899aabbccddeeff'

describe('parseUnifiKeys', () => {
  it('reads devices in any common MAC notation', () => {
    const r = parseUnifiKeys(JSON.stringify([{ mac: 'DE:AD:BE:EF:00:01', authkey: KEY, gcm: true }, { mac: 'dead.beef.0002', authkey: KEY }]))
    expect(r.errors).toEqual([])
    expect(r.keys).toEqual([
      { mac: 'DE:AD:BE:EF:00:01', authkey: KEY, gcm: true },
      { mac: 'dead.beef.0002', authkey: KEY, gcm: false },
    ])
  })

  it.each([
    ['', /Paste/],
    ['nope', /not valid JSON/],
    ['{}', /array/],
    ['[]', /empty/],
    ['[1]', /Entry 1 is not an object/],
    [JSON.stringify([{ mac: 'xyz', authkey: KEY }]), /"mac" must be a MAC address/],
    [JSON.stringify([{ mac: 'de:ad:be:ef:00:01', authkey: 'short' }]), /32 hex digits/],
    [JSON.stringify([{ mac: 'de:ad:be:ef:00:01', authkey: KEY, gcm: 'yes' }]), /"gcm" must be/],
  ])('rejects %j', (text, want) => {
    const r = parseUnifiKeys(text)
    expect(r.keys).toEqual([])
    expect(r.errors.join(' ')).toMatch(want)
  })

  it('rejects the same device twice, whatever the notation', () => {
    const r = parseUnifiKeys(JSON.stringify([{ mac: 'de:ad:be:ef:00:01', authkey: KEY }, { mac: 'DE-AD-BE-EF-00-01', authkey: KEY }]))
    expect(r.errors.join(' ')).toContain('more than once')
  })

  it('imports nothing when any entry is bad, and never echoes a key in an error', () => {
    const bad = '00112233445566778899aabbccddeefz'
    const r = parseUnifiKeys(JSON.stringify([{ mac: 'de:ad:be:ef:00:01', authkey: KEY }, { mac: 'de:ad:be:ef:00:02', authkey: bad }]))
    expect(r.keys).toEqual([])
    expect(r.errors).toHaveLength(1)
    expect(JSON.stringify(r.errors)).not.toContain(bad)
    expect(JSON.stringify(r.errors)).not.toContain(KEY)
  })
})
