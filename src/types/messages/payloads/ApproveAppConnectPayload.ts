export interface ApproveAppConnectPayload {
  id: string
  // Identities the website may see. Omitted means every identity of the wallet.
  identities?: string[]
  // Core (L1) addresses the website may see. Omitted means every address of the
  // wallet's receiving chain.
  addresses?: string[]
}
