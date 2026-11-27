import { NetworkType } from '../../NetworkType'

export interface RegisterIdentityFromWalletPayload {
  // Duffs to pay to the funding address. The identity is credited with that
  // amount minus the asset lock fee, times 1000.
  amountDuffs: string
  password: string
  // The (network, wallet) the registration is bound to, and whose coins pay for
  // it. Optional, same contract as TopUpIdentityFromWalletPayload: omitted, the
  // current selection is snapshotted once when the handler starts.
  walletId?: string
  network?: NetworkType
}
