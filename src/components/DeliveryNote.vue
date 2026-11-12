<script setup lang="ts">
import { NAlert } from 'naive-ui'

/**
 * What beenfar can and cannot say about whether a setting reached a device.
 * The controller does not report whether the optional UniFi push is on, so
 * these notes describe the situation in general and never imply delivery.
 */
defineProps<{ scope: 'devices' | 'network' | 'wifi' | 'radius' }>()
</script>

<template>
  <n-alert type="info" title="Stored by beenfar; delivery to devices is optional" data-test="delivery-note">
    <p>
      Settings here are stored by the controller. Sending them to UniFi devices (the <code>system_cfg</code> push) is
      optional (<code>BEENFAR_UNIFI_SYSTEM_CFG</code>, off by default), experimental, and has not been verified on
      hardware. beenfar cannot tell you here whether it is on, or whether a device received a setting.
    </p>
    <p v-if="scope === 'wifi'" data-test="wifi-limits">
      When the push is on, open and WEP networks and guest networks are refused and not sent.
    </p>
    <p v-else-if="scope === 'devices'">Switch port settings are never sent to devices yet.</p>
  </n-alert>
</template>

<style scoped>
p {
  margin: 0 0 6px;
}
p:last-child {
  margin: 0;
}
</style>
