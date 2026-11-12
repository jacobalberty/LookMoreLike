import type { User } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import type { Network } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import type { RadiusServer } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import { PoeMode, SwitchPortTagging, type SwitchPort } from '@jacobalberty/beenfar-api/beenfar/config/v1/switch_port_pb'
import { WifiBand, WifiSecurity, type WifiNetwork } from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import type { FieldDef } from './fields'

/*
 * The fields each screen edits, by update_mask path. Identifying and
 * read-only fields (id, etag, times, field_writers, a port's device and
 * index) are not here. The deprecated wifi radius_profile is not offered.
 */

export const securityLabels: Record<number, string> = {
  [WifiSecurity.OPEN]: 'Open',
  [WifiSecurity.WEP]: 'WEP',
  [WifiSecurity.WPA_PERSONAL]: 'WPA personal',
  [WifiSecurity.WPA_ENTERPRISE]: 'WPA enterprise',
}

export const bandLabels: Record<number, string> = {
  [WifiBand.WIFI_BAND_UNSPECIFIED]: 'Both bands',
  [WifiBand.WIFI_BAND_BOTH]: 'Both bands',
  [WifiBand.WIFI_BAND_2G]: '2.4 GHz',
  [WifiBand.WIFI_BAND_5G]: '5 GHz',
}

export const wifiFields: readonly FieldDef<WifiNetwork>[] = [
  { path: 'ssid', key: 'ssid', label: 'SSID' },
  { path: 'security', key: 'security', label: 'Security', format: (v) => securityLabels[v as number] ?? String(v) },
  { path: 'security_key', key: 'securityKey', label: 'Passphrase', format: () => 'a different passphrase' },
  { path: 'band', key: 'band', label: 'Bands', format: (v) => bandLabels[v as number] ?? String(v) },
  { path: 'network_id', key: 'networkId', label: 'Network', format: (v) => (v ? `network ${String(v)}` : 'the default network') },
  { path: 'guest', key: 'guest', label: 'Guest network' },
  { path: 'hidden', key: 'hidden', label: 'Hidden' },
  { path: 'ap_groups', key: 'apGroups', kind: 'set', label: 'Access point groups', format: (v) => ((v as string[]).length ? (v as string[]).join(', ') : 'all access points') },
  { path: 'default_user_group', key: 'defaultUserGroup', label: 'Default user group' },
  { path: 'radius_server_id', key: 'radiusServerId', label: 'RADIUS server', format: (v) => (v ? `server ${String(v)}` : 'none') },
]

export const networkFields: readonly FieldDef<Network>[] = [
  { path: 'name', key: 'name', label: 'Name' },
  { path: 'vlan_id', key: 'vlanId', label: 'VLAN ID', format: (v) => (v === 0 ? 'untagged' : String(v)) },
  { path: 'subnet', key: 'subnet', label: 'Gateway and subnet' },
  { path: 'dhcp_enabled', key: 'dhcpEnabled', label: 'DHCP' },
  { path: 'dhcp_start', key: 'dhcpStart', label: 'DHCP range start' },
  { path: 'dhcp_stop', key: 'dhcpStop', label: 'DHCP range end' },
  { path: 'domain_name', key: 'domainName', label: 'Domain name' },
]

export const radiusFields: readonly FieldDef<RadiusServer>[] = [
  { path: 'name', key: 'name', label: 'Name' },
  { path: 'address', key: 'address', label: 'Address' },
  { path: 'auth_port', key: 'authPort', label: 'Authentication port' },
  { path: 'accounting_port', key: 'accountingPort', label: 'Accounting port', format: (v) => (v === 0 ? 'no accounting' : String(v)) },
  { path: 'shared_secret', key: 'sharedSecret', kind: 'secret', label: 'Shared secret' },
]

export const taggingLabels: Record<number, string> = {
  [SwitchPortTagging.UNSPECIFIED]: 'All networks',
  [SwitchPortTagging.ALL]: 'All networks',
  [SwitchPortTagging.NONE]: 'None (native network only)',
  [SwitchPortTagging.CUSTOM]: 'Selected networks',
}

export const poeLabels: Record<number, string> = {
  [PoeMode.UNSPECIFIED]: 'Auto',
  [PoeMode.AUTO]: 'Auto',
  [PoeMode.OFF]: 'Off',
}

export const switchPortFields: readonly FieldDef<SwitchPort>[] = [
  { path: 'name', key: 'name', label: 'Name' },
  { path: 'disabled', key: 'disabled', label: 'Port disabled' },
  { path: 'native_network_id', key: 'nativeNetworkId', label: 'Native network', format: (v) => (v ? `network ${String(v)}` : 'the default network') },
  { path: 'tagging', key: 'tagging', label: 'Tagged networks', format: (v) => taggingLabels[v as number] ?? String(v) },
  { path: 'tagged_network_ids', key: 'taggedNetworkIds', kind: 'set', label: 'Selected tagged networks', format: (v) => ((v as string[]).length ? (v as string[]).join(', ') : 'none') },
  { path: 'poe_mode', key: 'poeMode', label: 'PoE', format: (v) => poeLabels[v as number] ?? String(v) },
]

/** The fields of a user an admin can edit. UpdateUser has no mask: it sends the whole user. */
export const userFields: readonly FieldDef<User>[] = [
  { path: 'username', key: 'username', label: 'Username' },
  { path: 'admin', key: 'admin', label: 'Administrator' },
]
