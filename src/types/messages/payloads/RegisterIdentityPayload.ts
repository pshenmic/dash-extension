import { NetworkType } from '../../NetworkType'

export interface RegisterIdentityPayload {
  /** The asset lock funding P2PKH address that received the payment */
  assetLockFundingAddress: string
  /** Txid of the asset lock funding transaction that paid to the address */
  assetLockFundingTxid: string
  /** Extension password used to decrypt the asset lock funding private key */
  password: string
  // The (network, wallet) the registration is bound to. Optional, same contract
  // as TopUpIdentityPayload: callers that omit them get the extension's current
  // selection, snapshotted once when the handler starts. A long-lived caller
  // (the registration tab, which stays open across wallet and network switches)
  // should always send them.
  walletId?: string
  network?: NetworkType
}
