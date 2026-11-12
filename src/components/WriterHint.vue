<script setup lang="ts">
import { FieldWriterKind, type FieldWriter } from '@jacobalberty/beenfar-api/beenfar/config/v1/field_writer_pb'
import { computed } from 'vue'
import { formatTime, timeAgo } from '@/format'

/**
 * "last set by API token terraform-ci, 3 days ago", for one field. beenfar
 * records who named a field in a create or an update mask; that is evidence of
 * a write, not a claim that anyone manages the field. Fields nobody has
 * written since recording began show nothing.
 */
const props = defineProps<{ writers: readonly FieldWriter[] | undefined; path: string }>()

const writer = computed(() => props.writers?.find((w) => w.field === props.path))
const who = computed(() => {
  const w = writer.value
  if (!w) return ''
  return w.kind === FieldWriterKind.API_TOKEN ? `API token ${w.writer}` : w.kind === FieldWriterKind.USER ? `user ${w.writer}` : w.writer
})
</script>

<template>
  <div v-if="writer" class="writer" :title="formatTime(writer.writeTime)" :data-test="'writer-' + path">
    last set by {{ who }}, {{ timeAgo(writer.writeTime) }}
  </div>
</template>

<style scoped>
.writer {
  flex-basis: 100%;
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.7;
}
</style>
