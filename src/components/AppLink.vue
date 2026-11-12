<script setup lang="ts">
import { useRouter } from '@/context'

const props = defineProps<{ to: string }>()
const router = useRouter()

/** Navigates in-app on a plain left click; lets the browser handle the rest (new tab, etc.). */
function go(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  router.navigate(props.to)
}
</script>

<template>
  <a :href="to" @click="go"><slot /></a>
</template>
