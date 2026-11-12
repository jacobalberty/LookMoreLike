import { createClient, type Client, type Transport } from '@connectrpc/connect'
import { AdapterService } from '@jacobalberty/beenfar-api/beenfar/admin/v1/adapter_pb'
import { ApiTokenService } from '@jacobalberty/beenfar-api/beenfar/admin/v1/api_token_pb'
import { AuthService } from '@jacobalberty/beenfar-api/beenfar/admin/v1/auth_pb'
import { UserService } from '@jacobalberty/beenfar-api/beenfar/admin/v1/user_pb'
import { DeviceService } from '@jacobalberty/beenfar-api/beenfar/config/v1/device_pb'
import { NetworkService } from '@jacobalberty/beenfar-api/beenfar/config/v1/network_pb'
import { RadiusServerService } from '@jacobalberty/beenfar-api/beenfar/config/v1/radius_server_pb'
import { SwitchPortService } from '@jacobalberty/beenfar-api/beenfar/config/v1/switch_port_pb'
import { WifiNetworkService } from '@jacobalberty/beenfar-api/beenfar/config/v1/wifi_network_pb'
import { createTransport } from './transport'

/** One client per beenfar service the UI uses. */
export interface Clients {
  auth: Client<typeof AuthService>
  users: Client<typeof UserService>
  tokens: Client<typeof ApiTokenService>
  adapters: Client<typeof AdapterService>
  devices: Client<typeof DeviceService>
  networks: Client<typeof NetworkService>
  wifi: Client<typeof WifiNetworkService>
  radius: Client<typeof RadiusServerService>
  ports: Client<typeof SwitchPortService>
}

export function createClients(transport: Transport = createTransport()): Clients {
  return {
    auth: createClient(AuthService, transport),
    users: createClient(UserService, transport),
    tokens: createClient(ApiTokenService, transport),
    adapters: createClient(AdapterService, transport),
    devices: createClient(DeviceService, transport),
    networks: createClient(NetworkService, transport),
    wifi: createClient(WifiNetworkService, transport),
    radius: createClient(RadiusServerService, transport),
    ports: createClient(SwitchPortService, transport),
  }
}
