<script setup lang="ts" generic="T">
import { NAlert, NButton, NSpace } from 'naive-ui'
import { computed } from 'vue'
import type { Conflict } from '@/forms/conflict'
import { displayValue, valueOf, type FieldDef } from '@/forms/fields'

const props = defineProps<{ conflict: Conflict<T>; defs: readonly FieldDef<T>[] }>()
defineEmits<{ keep: []; discard: [] }>()

const changes = computed(() =>
  props.conflict.changedUpstream.map((d) => ({
    path: d.path,
    label: d.label ?? d.path,
    now: displayValue(d, valueOf(props.conflict.latest, d.key)),
    clash: props.conflict.clashing.some((c) => c.path === d.path),
  })),
)
</script>

<template>
  <n-alert type="warning" title="This changed while you were editing" data-test="conflict">
    <n-space vertical :size="8">
      <template v-if="changes.length">
        <span>Someone else (or another tool, such as Terraform) changed:</span>
        <ul>
          <li v-for="c in changes" :key="c.path" :data-test="'changed-' + c.path">
            <strong>{{ c.label }}</strong> is now <em>{{ c.now }}</em>
            <span v-if="c.clash" class="clash"> (you also changed this)</span>
          </li>
        </ul>
      </template>
      <span v-else>
        The resource was updated, but none of the fields you can edit here changed, so your edits do not overlap.
      </span>
      <span>Nothing was saved. Your edits are kept until you choose.</span>
      <n-space>
        <n-button size="small" type="primary" data-test="keep-mine" @click="$emit('keep')">
          Keep my edits on the latest version
        </n-button>
        <n-button size="small" data-test="discard-mine" @click="$emit('discard')">Discard my edits</n-button>
      </n-space>
    </n-space>
  </n-alert>
</template>

<style scoped>
ul {
  margin: 0;
  padding-left: 20px;
}
.clash {
  color: var(--n-warning-color, #f0a020);
}
</style>
