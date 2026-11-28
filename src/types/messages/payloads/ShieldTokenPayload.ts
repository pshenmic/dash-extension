export interface ShieldTokenPayload {
  tokenId: string
  // Identity whose token balance pays, and whose key signs the batch transition.
  identity: string
  keyId: number
  password: string
  // Token units, as a string: bigint does not cross the messaging boundary.
  amount: string
  // Defaults to this wallet's own shielded address for the account.
  toShieldedAddress?: string
  account?: number
  memo?: string
  userFeeIncrease?: number
}
