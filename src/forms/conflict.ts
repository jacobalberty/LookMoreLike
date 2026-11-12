import { Code, ConnectError } from '@connectrpc/connect'
import { type FieldDef, sameValue, valueOf } from './fields'
import { buildUpdate, changedFields, initialForm, type MaskedUpdate } from './mask'

/**
 * Etags cover the whole resource, so an update that raced with any other
 * write, even to a field the user did not touch (Terraform changing the
 * AP groups, say), is rejected with ABORTED. The UI never retries that on
 * its own: it re-reads the resource, shows what changed and lets the user
 * decide to apply their edits again on top of the new version.
 */
export interface Conflict<T> {
  /** The resource as it is now. */
  latest: T
  /** Fields that changed on the controller since the user opened the form. */
  changedUpstream: FieldDef<T>[]
  /**
   * Fields the user also edited that now hold a different value upstream:
   * applying the edit again overwrites someone else's change to these.
   */
  clashing: FieldDef<T>[]
  /**
   * The form to apply the user's edits again: the latest values with only the
   * fields the user changed overlaid. Fields they did not touch keep their
   * upstream value, so applying again never reverts someone else's change.
   * Save it with `base: latest`.
   */
  rebased: Partial<T>
}

export type SaveResult<T> =
  | { status: 'unchanged' }
  | { status: 'saved'; value: T; sent: string[] }
  | { status: 'conflict'; conflict: Conflict<T> }
  /** The resource was deleted while the user was editing it. */
  | { status: 'deleted' }

export interface SaveOptions<T extends { etag: string }> {
  defs: readonly FieldDef<T>[]
  /** The version the user started from. */
  base: T
  edited: Partial<T>
  update: (u: MaskedUpdate<T>) => Promise<T>
  /** Re-reads the resource. */
  reload: () => Promise<T>
}

/**
 * Sends only the changed fields. On a conflict nothing is retried: it
 * returns what changed so the screen can show it. To apply the user's edits
 * again, call saveMasked once more with `base: conflict.latest` and
 * `edited: conflict.rebased`.
 */
export async function saveMasked<T extends { etag: string }>(o: SaveOptions<T>): Promise<SaveResult<T>> {
  const update = buildUpdate(o.defs, o.base, o.edited)
  if (!update) return { status: 'unchanged' }
  try {
    const value = await o.update(update)
    return { status: 'saved', value, sent: update.paths }
  } catch (e) {
    if (ConnectError.from(e).code !== Code.Aborted) throw e
  }
  let latest: T
  try {
    latest = await o.reload()
  } catch (e) {
    if (ConnectError.from(e).code === Code.NotFound) return { status: 'deleted' }
    throw e
  }
  return { status: 'conflict', conflict: analyzeConflict(o.defs, o.base, latest, o.edited) }
}

export function analyzeConflict<T>(
  defs: readonly FieldDef<T>[],
  base: T,
  latest: T,
  edited: Partial<T>,
): Conflict<T> {
  // The secret is never returned, so "changed upstream" cannot be known for it.
  const comparable = defs.filter((d) => d.kind !== 'secret')
  const changedUpstream = comparable.filter((d) => !sameValue(d.kind, valueOf(base, d.key), valueOf(latest, d.key)))
  const mine = changedFields(defs, base, edited)
  const minePaths = new Set(mine.map((d) => d.path))
  const clashing = changedUpstream.filter(
    (d) => minePaths.has(d.path) && !sameValue(d.kind, valueOf(latest, d.key), edited[d.key]),
  )
  const rebased = initialForm(defs, latest)
  for (const d of mine) rebased[d.key] = edited[d.key]
  return { latest, changedUpstream, clashing, rebased }
}
