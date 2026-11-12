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
  /**
   * For a secret: the property that increases whenever it is replaced
   * (shared_secret_version). The secret itself is never returned, so a change
   * made by someone else can only be seen through this.
   */
  version?: keyof T & string
  /** The name shown to people. */
  label?: string
  /** How a value of this field reads in a sentence (conflict notices). */
  format?: (value: unknown) => string
}

/** The editable state of a message: its fields, without protobuf's own bookkeeping. */
export type FormOf<T> = Partial<Omit<T, '$typeName' | '$unknown'>>

// Generic code cannot index FormOf<T> by the keys of T, so reads and writes
// of form fields go through these two.
export function getField<T>(form: FormOf<T>, key: keyof T & string): unknown {
  return (form as Record<string, unknown>)[key]
}

export function setField<T>(form: FormOf<T>, key: keyof T & string, value: unknown): void {
  ;(form as Record<string, unknown>)[key] = value
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

/** A value as plain text, for messages. */
export function displayValue(d: { kind?: FieldKind; format?: (v: unknown) => string }, value: unknown): string {
  if (d.kind === 'secret') return 'a new secret'
  if (d.format) return d.format(value)
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (value === '' || value === undefined || value === null) return 'empty'
  return String(value)
}
