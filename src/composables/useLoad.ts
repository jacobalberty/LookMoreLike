import { onMounted, ref, type Ref } from 'vue'
import { describeError } from '@/api/errors'

/** Loads data on mount and on demand, keeping the last good value while reloading. */
export function useLoad<T>(load: () => Promise<T>, initial: T) {
  const data = ref(initial) as Ref<T>
  const loading = ref(false)
  const error = ref('')

  async function reload(): Promise<void> {
    loading.value = true
    try {
      data.value = await load()
      error.value = ''
    } catch (e) {
      error.value = describeError(e)
    } finally {
      loading.value = false
    }
  }

  onMounted(reload)
  return { data, loading, error, reload }
}
