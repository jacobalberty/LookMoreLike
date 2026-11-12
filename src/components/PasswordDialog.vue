<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput, NModal, NSpace, useMessage } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { describeError } from '@/api/errors'
import { useClients } from '@/context'

const props = defineProps<{
  show: boolean
  userId: string
  username: string
  /** A user changing their own password must give the current one. */
  self: boolean
}>()
const emit = defineEmits<{ 'update:show': [boolean] }>()

const clients = useClients()
const message = useMessage()

const current = ref('')
const password = ref('')
const again = ref('')
const busy = ref(false)
const error = ref('')

watch(
  () => props.show,
  () => {
    current.value = password.value = again.value = error.value = ''
  },
)

const problem = computed(() => {
  if (password.value.length < 8) return 'The new password must be at least 8 characters.'
  if (password.value !== again.value) return 'The two passwords do not match.'
  if (props.self && !current.value) return 'Enter your current password.'
  return ''
})

async function save() {
  if (problem.value) {
    error.value = problem.value
    return
  }
  busy.value = true
  error.value = ''
  try {
    await clients.users.setUserPassword({ id: props.userId, password: password.value, currentPassword: props.self ? current.value : '' })
    message.success(`Changed the password of ${props.username}`)
    emit('update:show', false)
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
    current.value = password.value = again.value = ''
  }
}
</script>

<template>
  <n-modal :show="show" preset="card" :title="`Password of ${username}`" style="width: 440px; max-width: 95vw" :mask-closable="false" data-test="password-dialog" @update:show="(v: boolean) => emit('update:show', v)">
    <n-form label-placement="top" @submit.prevent="save()">
      <n-form-item v-if="self" label="Current password">
        <n-input v-model:value="current" type="password" show-password-on="click" :input-props="{ autocomplete: 'current-password' }" data-test="p-current" />
      </n-form-item>
      <n-form-item label="New password" feedback="At least 8 characters.">
        <n-input v-model:value="password" type="password" show-password-on="click" :input-props="{ autocomplete: 'new-password' }" data-test="p-new" />
      </n-form-item>
      <n-form-item label="New password again">
        <n-input v-model:value="again" type="password" show-password-on="click" :input-props="{ autocomplete: 'new-password' }" data-test="p-again" @keydown.enter.prevent="save()" />
      </n-form-item>
      <n-alert v-if="error" type="error" data-test="password-error">{{ error }}</n-alert>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button :disabled="busy" @click="emit('update:show', false)">Cancel</n-button>
        <n-button type="primary" :loading="busy" data-test="password-save" @click="save()">Change password</n-button>
      </n-space>
    </template>
  </n-modal>
</template>
