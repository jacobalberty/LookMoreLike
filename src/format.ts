import { timestampDate, type Timestamp } from '@bufbuild/protobuf/wkt'

export function toDate(ts: Timestamp | undefined): Date | undefined {
  return ts ? timestampDate(ts) : undefined
}

/** "3 minutes ago", "2 days ago", or "never" when there is no time. */
export function timeAgo(ts: Timestamp | undefined, now: Date = new Date()): string {
  const d = toDate(ts)
  if (!d) return 'never'
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s} seconds ago`
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ]
  for (const [size, name] of units) {
    if (s >= size) {
      const n = Math.floor(s / size)
      return `${n} ${name}${n === 1 ? '' : 's'} ago`
    }
  }
  return `${s} seconds ago`
}

/** The date and time in the viewer's locale, or an em dash. */
export function formatTime(ts: Timestamp | undefined): string {
  const d = toDate(ts)
  return d ? d.toLocaleString() : '—'
}
