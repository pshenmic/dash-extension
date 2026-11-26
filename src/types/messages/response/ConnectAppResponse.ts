import { IdentityInfo } from '../../IdentityInfo'

export interface ConnectAppResponse {
  redirectUrl: string
  status: 'pending' | 'approved' | 'rejected' | 'error'
  identities: IdentityInfo[]
  currentIdentity: string | null
  // Core (L1) addresses of the wallet the website was granted, empty until the
  // connection is approved.
  addresses: string[]
  // null until the connection is approved
  network: string | null
}
