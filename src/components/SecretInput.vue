<script setup lang="ts">
import { NInput } from 'naive-ui'

/**
 * A write-only field. It only ever holds what the user typed in this
 * session: callers start it empty and the API never returns a secret, so
 * there is nothing to pre-fill. Password managers are told it is a new
 * secret, so they do not offer a saved one.
 */
defineProps<{ placeholder?: string }>()
const model = defineModel<string>({ default: '' })
</script>

<template>
  <n-input
    v-model:value="model"
    type="password"
    show-password-on="click"
    :placeholder="placeholder"
    :input-props="{ autocomplete: 'new-password', spellcheck: false, autocapitalize: 'off' }"
  />
</template>
