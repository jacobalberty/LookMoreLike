import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach } from 'vitest'

// Dialogs are teleported into document.body; unmount after each test so one
// test's dialog is never found by the next.
enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})
