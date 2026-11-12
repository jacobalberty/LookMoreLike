import { create } from '@bufbuild/protobuf'
import { FieldMaskSchema, type FieldMask } from '@bufbuild/protobuf/wkt'
import { type FieldDef, type FormOf, getField, sameValue, setField, valueOf } from './fields'

/**
 * The form state for editing `original`: a copy of its editable fields, with
 * secrets left empty. A secret is never pre-filled, even if (against the
 * API's contract) one were present.
 */
export function initialForm<T>(defs: readonly FieldDef<T>[], original: T): FormOf<T> {
  const form: FormOf<T> = {}
  for (const d of defs) {
    const v = valueOf(original, d.key)
    if (d.kind === 'secret') {
      setField(form, d.key, '')
    } else if (d.kind === 'set') {
      setField(form, d.key, [...((v as string[] | undefined) ?? [])])
    } else {
      setField(form, d.key, v)
    }
  }
  return form
}

/** The fields of `edited` that differ from `original`. Fields absent from `edited` are untouched. */
export function changedFields<T>(defs: readonly FieldDef<T>[], original: T, edited: FormOf<T>): FieldDef<T>[] {
  return defs.filter((d) => {
    if (!(d.key in edited)) return false
    const was = d.kind === 'secret' ? '' : valueOf(original, d.key)
    return !sameValue(d.kind, was, getField(edited, d.key))
  })
}

export interface MaskedUpdate<T> {
  /** The update_mask paths: exactly the changed fields. */
  paths: string[]
  /** The new values of the changed fields, and nothing else. */
  values: FormOf<T>
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
  edited: FormOf<T>,
): MaskedUpdate<T> | null {
  const changed = changedFields(defs, original, edited)
  if (changed.length === 0) return null
  const values: FormOf<T> = {}
  for (const d of changed) setField(values, d.key, getField(edited, d.key))
  return { paths: changed.map((d) => d.path), values, etag: original.etag }
}

/** The update_mask message for a set of paths. */
export function maskOf(paths: string[]): FieldMask {
  return create(FieldMaskSchema, { paths })
}
