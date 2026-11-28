export interface SendShieldedTokenTransferPayload {
  tokenId: string
  // Identity whose key signs the batch transition and pays its fee.
  identity: string
  keyId: number
  password: string
  // Token units, as a string: bigint does not cross the messaging boundary.
  amount: string
  toShieldedAddress: string
  account?: number
  memo?: string
  // Narrows the spend to notes on these shielded addresses.
  fromAddresses?: string[]
  userFeeIncrease?: number
}
