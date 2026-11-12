<script setup lang="ts" generic="T extends { id: string; etag: string }">
import { NAlert, NButton, NModal, NSpace } from 'naive-ui'
import type { Editor } from '@/composables/useEditor'
import type { FieldDef } from '@/forms/fields'
import ConflictNotice from './ConflictNotice.vue'

defineProps<{ editor: Editor<T>; defs: readonly FieldDef<T>[]; title: string; width?: number }>()
</script>

<template>
  <n-modal
    :show="editor.state.open"
    preset="card"
    :title="title"
    :style="{ width: (width ?? 560) + 'px', maxWidth: '95vw' }"
    :mask-closable="false"
    :closable="!editor.state.saving"
    :close-on-esc="!editor.state.saving"
    data-test="editor"
    @update:show="(v: boolean) => !v && editor.close()"
  >
    <n-space vertical :size="16">
      <conflict-notice
        v-if="editor.state.conflict"
        :conflict="editor.state.conflict"
        :defs="defs"
        @keep="editor.keepMyEdits()"
        @discard="editor.discardMyEdits()"
      />
      <n-alert v-if="editor.state.error" type="error" data-test="editor-error">{{ editor.state.error }}</n-alert>
      <slot />
    </n-space>
    <template #footer>
      <n-space justify="end">
        <n-button :disabled="editor.state.saving" data-test="cancel" @click="editor.close()">Cancel</n-button>
        <n-button
          type="primary"
          :loading="editor.state.saving"
          :disabled="!!editor.state.conflict"
          data-test="save"
          @click="editor.save()"
        >
          Save
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style>
/* Lets a field's "last set by" note sit on its own line under the input. */
.n-card .n-form-item-blank {
  flex-wrap: wrap;
}
</style>
