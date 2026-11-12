import { create } from '@bufbuild/protobuf'
import { TimestampSchema } from '@bufbuild/protobuf/wkt'
import { describe, expect, it } from 'vitest'
import { formatTime, timeAgo } from './format'

const at = (iso: string) => create(TimestampSchema, { seconds: BigInt(Math.floor(Date.parse(iso) / 1000)) })
const now = new Date('2026-11-12T12:00:00Z')

describe('timeAgo', () => {
  it.each([
    ['2026-11-12T11:59:58Z', 'just now'],
    ['2026-11-12T11:59:30Z', '30 seconds ago'],
    ['2026-11-12T11:59:00Z', '1 minute ago'],
    ['2026-11-12T11:15:00Z', '45 minutes ago'],
    ['2026-11-12T10:00:00Z', '2 hours ago'],
    ['2026-11-10T12:00:00Z', '2 days ago'],
  ])('%s is %s', (iso, want) => {
    expect(timeAgo(at(iso), now)).toBe(want)
  })

  it('says never without a time', () => {
    expect(timeAgo(undefined)).toBe('never')
  })

  it('does not go negative for clock skew', () => {
    expect(timeAgo(at('2026-11-12T12:00:30Z'), now)).toBe('just now')
  })
})

describe('formatTime', () => {
  it('shows a dash without a time', () => {
    expect(formatTime(undefined)).toBe('—')
    expect(formatTime(at('2026-11-12T12:00:00Z'))).not.toBe('—')
  })
})
