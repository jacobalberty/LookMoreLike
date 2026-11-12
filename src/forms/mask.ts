import { type FieldDef, sameValue, valueOf } from './fields'

/**
 * The form state for editing `original`: a copy of its editable fields, with
 * secrets left empty. A secret is never pre-filled, even if (against the
 * API's contract) one were present.
 */
export function initialForm<T>(defs: readonly FieldDef<T>[], original: T): Partial<T> {
  const form: Partial<T> = {}
  for (const d of defs) {
    const v = valueOf(original, d.key)
    if (d.kind === 'secret') {
      form[d.key] = '' as T[keyof T & string]
    } else if (d.kind === 'set') {
      form[d.key] = [...((v as string[] | undefined) ?? [])] as T[keyof T & string]
    } else {
      form[d.key] = v as T[keyof T & string]
    }
  }
  return form
}

/** The fields of `edited` that differ from `original`. Fields absent from `edited` are untouched. */
export function changedFields<T>(defs: readonly FieldDef<T>[], original: T, edited: Partial<T>): FieldDef<T>[] {
  return defs.filter((d) => {
    if (!(d.key in edited)) return false
    const was = d.kind === 'secret' ? '' : valueOf(original, d.key)
    return !sameValue(d.kind, was, edited[d.key])
  })
}

export interface MaskedUpdate<T> {
  /** The update_mask paths: exactly the changed fields. */
  paths: string[]
  /** The new values of the changed fields, and nothing else. */
  values: Partial<T>
  /** The etag the update is guarded by (the version the user edited). */
  etag: string
}

/**
 * What to send to update `original` to `edited`, or null when nothing
 * changed (so no request is made at all).
 */
export function buildUpdate<T extends { etag: string }>(
  defs: readonly FieldDef<T>[],
  original: T,
  edited: Partial<T>,
): MaskedUpdate<T> | null {
  const changed = changedFields(defs, original, edited)
  if (changed.length === 0) return null
  const values: Partial<T> = {}
  for (const d of changed) values[d.key] = edited[d.key]
  return { paths: changed.map((d) => d.path), values, etag: original.etag }
}
