import type { IdentityPublicKeyWASM, PrivateKeyWASM } from 'pshenmic-dpp'

// The shielded pool of one token. The credit pool is one per network; a token pool
// belongs to one token of one data contract, so every token action names it.
export interface ShieldedTokenPool {
  tokenId: string
  dataContractId: string
  tokenContractPosition: number
}

// The identity that signs a token batch transition and pays its fee out of its own
// credit balance. Platform counts these transitions per identity and per contract,
// which is what identityContractNonce carries.
export interface ShieldedTokenSigner {
  ownerId: string
  identityPublicKey: IdentityPublicKeyWASM
  privateKey: PrivateKeyWASM
  identityContractNonce: bigint
  userFeeIncrease: number
}

// What a wallet holds in one token pool, with the notes it could spend.
export interface ShieldedTokenBalance {
  tokenId: string
  balance: string
  spendableNotes: number
}
