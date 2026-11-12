import { useDialog } from 'naive-ui'

export interface ConfirmOptions {
  title: string
  content: string
  /** Label of the confirming button. */
  action: string
}

/** Asks before something that cannot be undone; resolves true when confirmed. */
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const dialog = useDialog()
  return (o) =>
    new Promise((resolve) => {
      dialog.warning({
        title: o.title,
        content: o.content,
        positiveText: o.action,
        negativeText: 'Cancel',
        onPositiveClick: () => resolve(true),
        onNegativeClick: () => resolve(false),
        onClose: () => resolve(false),
        onMaskClick: () => resolve(false),
      })
    })
}
