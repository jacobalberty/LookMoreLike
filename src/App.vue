<script setup lang="ts">
import { darkTheme, NButton, NConfigProvider, NDialogProvider, NGlobalStyle, NMessageProvider, NResult, NSpin, useOsTheme } from 'naive-ui'
import { computed, onMounted } from 'vue'
import AppShell from './components/AppShell.vue'
import { useSession } from './context'

const session = useSession()
const os = useOsTheme()
const theme = computed(() => (os.value === 'dark' ? darkTheme : null))

onMounted(() => session.load())
</script>

<template>
  <n-config-provider :theme="theme">
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <div v-if="session.state.status === 'loading'" class="center"><n-spin size="large" /></div>
        <n-result
          v-else-if="session.state.status === 'error'"
          status="error"
          title="Cannot load beenfar"
          :description="session.state.error"
        >
          <template #footer><n-button @click="session.load()">Try again</n-button></template>
        </n-result>
        <n-result v-else-if="session.state.status === 'anonymous'" status="403" title="Sign in required" />
        <app-shell v-else />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.center {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
}
</style>
