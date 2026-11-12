import { create } from '@bufbuild/protobuf'
import { timestampFromDate } from '@bufbuild/protobuf/wkt'
import { FieldWriterKind, FieldWriterSchema } from '@jacobalberty/beenfar-api/beenfar/config/v1/field_writer_pb'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WriterHint from './WriterHint.vue'

const ago = (ms: number) => timestampFromDate(new Date(Date.now() - ms))
const writers = [
  create(FieldWriterSchema, { field: 'ap_groups', writer: 'terraform-ci', kind: FieldWriterKind.API_TOKEN, writeTime: ago(3 * 86400_000) }),
  create(FieldWriterSchema, { field: 'hidden', writer: 'alice', kind: FieldWriterKind.USER, writeTime: ago(2 * 3600_000) }),
]

describe('WriterHint', () => {
  it('says which API token last set a field, and when', () => {
    const t = mount(WriterHint, { props: { writers, path: 'ap_groups' } }).text()
    expect(t).toContain('last set by API token terraform-ci')
    expect(t).toContain('3 days ago')
  })

  it('names users as users', () => {
    expect(mount(WriterHint, { props: { writers, path: 'hidden' } }).text()).toContain('last set by user alice, 2 hours ago')
  })

  it('claims nothing about fields nobody has written', () => {
    expect(mount(WriterHint, { props: { writers, path: 'ssid' } }).text()).toBe('')
    expect(mount(WriterHint, { props: { writers: undefined, path: 'ssid' } }).text()).toBe('')
  })

  it('does not call the writer an owner or say "managed"', () => {
    const t = mount(WriterHint, { props: { writers, path: 'ap_groups' } }).text()
    expect(t).not.toMatch(/manag|own/i)
  })
})
