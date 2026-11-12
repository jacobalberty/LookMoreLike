<script setup lang="ts">
import { DeviceState, ReadoptionState, type Device } from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
import { NSpace, NTag, NTooltip } from 'naive-ui'

defineProps<{ device: Device }>()
</script>

<template>
  <n-space :size="4" data-test="device-status">
    <n-tag v-if="device.state === DeviceState.ADOPTED" size="small" type="success">Adopted</n-tag>
    <n-tag v-else size="small">Pending</n-tag>

    <n-tooltip v-if="device.locked">
      <template #trigger>
        <n-tag size="small" type="warning" data-test="locked">Locked</n-tag>
      </template>
      beenfar has no credentials for this device. It is usually still managed by another controller. Import its
      key (Adapters, admins only) or reset the device; it stops being locked the next time it is seen.
    </n-tooltip>

    <n-tooltip v-if="device.readoption === ReadoptionState.AWAITING_ACCEPTANCE">
      <template #trigger>
        <n-tag size="small" type="warning" data-test="awaiting">Reset: awaiting re-adoption</n-tag>
      </template>
      The device came back without its key, typically after a factory reset. Nothing is sent to it until you
      adopt it again.
    </n-tooltip>
    <n-tag v-else-if="device.readoption === ReadoptionState.IN_PROGRESS" size="small" type="info" data-test="in-progress">
      Re-adopting
    </n-tag>
  </n-space>
</template>
