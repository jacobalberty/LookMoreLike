/**
 * Describes the editable fields of a resource, so that updates can be built
 * from what the user changed instead of from the whole object.
 *
 * beenfar's Update RPCs take an update_mask: only the fields it names are
 * written. Terraform manages some fields of a resource and the UI others, so
 * the UI must name exactly the fields a person changed. Sending the whole
 * object would overwrite what Terraform (or another configuration) owns.
 */
export type FieldKind =
  /** Compared with ===. */
  | 'scalar'
  /** A list of strings whose order does not matter (e.g. ap_groups). */
  | 'set'
  /**
   * Write-only: the API never returns it, an empty value keeps the stored
   * one, so it is changed exactly when the user typed something. Forms start
   * with it empty and never copy a value into it.
   */
  | 'secret'

export interface FieldDef<T> {
  /** The proto field name, as it appears in an update_mask ("ap_groups"). */
  path: string
  /** The property of the generated message ("apGroups"). */
  key: keyof T & string
  kind?: FieldKind
}

export function valueOf<T>(obj: T, key: keyof T & string): unknown {
  return obj[key]
}

/** True when two values of a field are the same for the purpose of an update. */
export function sameValue(kind: FieldKind | undefined, a: unknown, b: unknown): boolean {
  switch (kind) {
    case 'set': {
      const x = [...((a as string[] | undefined) ?? [])].sort()
      const y = [...((b as string[] | undefined) ?? [])].sort()
      return x.length === y.length && x.every((v, i) => v === y[i])
    }
    case 'secret':
      // An empty secret means "keep the stored one", whatever is stored.
      return ((a as string | undefined) ?? '') === ((b as string | undefined) ?? '')
    default:
      return a === b
  }
}
