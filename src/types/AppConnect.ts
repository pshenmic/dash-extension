import { AppConnectStatus } from './enums/AppConnectStatus'

export interface AppConnect {
  id: string
  url: string
  status: AppConnectStatus
  identities: string[]
  // Core (L1) addresses of this wallet the website may see, to be paid to or
  // refunded on. Empty until the user approves the connection.
  addresses: string[]
}
