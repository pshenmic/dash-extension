export interface GetShieldedTokenBalancePayload {
  tokenId: string
  // Notes are trial-decrypted with the wallet's viewing key, which is derived from
  // the seed, so reading a shielded balance needs the password.
  password: string
  account?: number
}
