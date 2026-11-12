import { reactive } from 'vue'
import { describeError } from '@/api/errors'
import { saveMasked, type Conflict } from '@/forms/conflict'
import type { FieldDef, FormOf } from '@/forms/fields'
import { initialForm, type MaskedUpdate } from '@/forms/mask'

export interface EditorOptions<T extends { id: string; etag: string }> {
  defs: readonly FieldDef<T>[]
  /** The values a new resource's form starts with. */
  blank: () => FormOf<T>
  reload: (id: string) => Promise<T>
  /** Creates from the whole form. */
  create: (form: FormOf<T>) => Promise<T>
  /** Updates with a mask naming only the changed fields. */
  update: (u: MaskedUpdate<T>, base: T) => Promise<T>
  /** Runs after a successful create or update. */
  saved?: (value: T, mode: 'create' | 'edit') => void | Promise<void>
}

export interface EditorState<T> {
  open: boolean
  mode: 'create' | 'edit'
  /** The version being edited (edit mode). */
  base: T | undefined
  form: FormOf<T>
  saving: boolean
  error: string
  /** Set when the last save raced with another write. */
  conflict: Conflict<T> | undefined
}

export type EditorResult = 'saved' | 'unchanged' | 'conflict' | 'deleted' | 'error'

/**
 * The state of one create/edit dialog. Edits are sent as masked updates (see
 * src/forms); a conflict is surfaced, never retried: the user chooses to
 * keep their edits on top of the latest version, or to drop them, and then
 * saves again.
 */
export function useEditor<T extends { id: string; etag: string }>(o: EditorOptions<T>) {
  // reactive() would unwrap T's type parameters; the state holds plain data.
  const state = reactive<EditorState<T>>({
    open: false,
    mode: 'create',
    base: undefined,
    form: {},
    saving: false,
    error: '',
    conflict: undefined,
  }) as unknown as EditorState<T>

  function startCreate(): void {
    state.mode = 'create'
    state.base = undefined
    state.form = o.blank()
    reset()
    state.open = true
  }

  function startEdit(item: T): void {
    state.mode = 'edit'
    state.base = item
    state.form = initialForm(o.defs, item)
    reset()
    state.open = true
  }

  function reset(): void {
    state.error = ''
    state.conflict = undefined
    state.saving = false
  }

  function close(): void {
    state.open = false
    reset()
  }

  async function save(): Promise<EditorResult> {
    state.saving = true
    state.error = ''
    try {
      if (state.mode === 'create') {
        const created = await o.create(state.form)
        close()
        await o.saved?.(created, 'create')
        return 'saved'
      }
      const base = state.base!
      const r = await saveMasked({
        defs: o.defs,
        base,
        edited: state.form,
        update: (u) => o.update(u, base),
        reload: () => o.reload(base.id),
      })
      switch (r.status) {
        case 'unchanged':
          close()
          return 'unchanged'
        case 'saved':
          close()
          await o.saved?.(r.value, 'edit')
          return 'saved'
        case 'conflict':
          state.conflict = r.conflict
          return 'conflict'
        case 'deleted':
          state.error = 'This was deleted by someone else while you were editing it.'
          return 'deleted'
      }
    } catch (e) {
      state.error = describeError(e)
      return 'error'
    } finally {
      state.saving = false
    }
  }

  /**
   * After a conflict: continue from the latest version with the user's own
   * edits on top. Nothing is sent; the user saves again when they are happy.
   */
  function keepMyEdits(): void {
    const c = state.conflict
    if (!c) return
    state.base = c.latest
    state.form = c.rebased
    state.conflict = undefined
  }

  /** After a conflict: drop the edits and show the latest version. */
  function discardMyEdits(): void {
    const c = state.conflict
    if (!c) return
    state.base = c.latest
    state.form = initialForm(o.defs, c.latest)
    state.conflict = undefined
  }

  return { state, startCreate, startEdit, close, save, keepMyEdits, discardMyEdits }
}

export type Editor<T extends { id: string; etag: string }> = ReturnType<typeof useEditor<T>>
