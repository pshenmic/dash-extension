import { IdentityInfo } from './IdentityInfo'

export interface WalletInfo {
  identities: IdentityInfo[]
  currentIdentity: string | null
  // Core (L1) addresses of the wallet this website was granted: where it may
  // pay the user, or refund them.
  addresses: string[]
}
