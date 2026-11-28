import { DashPlatformSDK } from 'dash-platform-sdk'
import { WalletType } from '../../../../types/WalletType'
import { Wallet } from '../../../../types/Wallet'
import { ShieldedTokenPool, ShieldedTokenSigner } from '../../../../types/ShieldedTokens'
import { IdentitiesRepository } from '../../../repository/IdentitiesRepository'
import { KeypairRepository } from '../../../repository/KeypairRepository'
import { deriveIdentityPrivateKey, deriveKeystorePrivateKey } from '../../../../utils'

/**
 * The token pool a token id belongs to. A token is one position inside one data
 * contract, and the contract binds the pool, so both come from the network rather
 * than from the caller - a wrong pair would build a transition consensus rejects.
 */
export const resolveTokenPool = async (sdk: DashPlatformSDK, tokenId: string): Promise<ShieldedTokenPool> => {
  const { dataContractId, tokenContractPosition } = await sdk.tokens.getTokenContractInfo(tokenId)

  return { tokenId, dataContractId: dataContractId.base58(), tokenContractPosition }
}

/**
 * The identity that signs a token batch transition: the key pair out of this wallet
 * and the nonce the transition must carry.
 *
 * Platform counts these per identity and per contract and expects the next one, so
 * the nonce it reports is incremented here, exactly as the SDK's own token base
 * transition does.
 */
export const resolveTokenSigner = async (
  sdk: DashPlatformSDK,
  identitiesRepository: IdentitiesRepository,
  keypairRepository: KeypairRepository,
  wallet: Wallet,
  pool: ShieldedTokenPool,
  params: { identity: string, keyId: number, password: string, userFeeIncrease?: number }
): Promise<ShieldedTokenSigner> => {
  const identity = await identitiesRepository.getByIdentifier(params.identity)

  if (identity == null) {
    throw new Error(`Identity with identifier ${params.identity} not found`)
  }

  let privateKey

  if (wallet.type === WalletType.keystore) {
    privateKey = await deriveKeystorePrivateKey(wallet, params.password, params.identity, params.keyId, keypairRepository)
  } else if (wallet.type === WalletType.seedphrase) {
    privateKey = await deriveIdentityPrivateKey(wallet, params.password, identity.index, params.keyId, sdk)
  } else {
    throw new Error('Unsupported wallet type')
  }

  // The public key comes from the identity as Platform holds it: the transition is
  // verified against that key, and its security level has to allow a token action.
  const identityWASM = await sdk.identities.getIdentityByIdentifier(params.identity)
  const identityPublicKey = identityWASM.getPublicKeyById(params.keyId)

  if (identityPublicKey == null) {
    throw new Error(`Identity ${params.identity} has no public key with id ${params.keyId}`)
  }

  const identityContractNonce = await sdk.identities.getIdentityContractNonce(params.identity, pool.dataContractId)

  return {
    ownerId: params.identity,
    identityPublicKey,
    privateKey,
    identityContractNonce: identityContractNonce + 1n,
    userFeeIncrease: params.userFeeIncrease ?? 0
  }
}

/**
 * What every token handler checks before it touches the network: the payload names a
 * token, an identity with a key, a password and a positive amount of token units.
 */
export const validateTokenSigningPayload = (
  sdk: DashPlatformSDK,
  payload: { tokenId: string, identity: string, keyId: number, password: string, amount: string, userFeeIncrease?: number }
): string | null => {
  if (!sdk.utils.validateIdentifier(payload.tokenId)) {
    return 'Could not decode token identifier'
  }

  if (!sdk.utils.validateIdentifier(payload.identity)) {
    return 'Could not decode identity identifier'
  }

  if (!Number.isInteger(payload.keyId) || payload.keyId < 0) {
    return 'Key id must be a non-negative integer'
  }

  if (typeof payload.password !== 'string' || payload.password.length === 0) {
    return 'Password must be provided'
  }

  if (typeof payload.amount !== 'string' || !/^\d+$/.test(payload.amount) || BigInt(payload.amount) <= 0n) {
    return 'Amount must be a positive integer string of token units'
  }

  if (payload.userFeeIncrease != null && (!Number.isInteger(payload.userFeeIncrease) || payload.userFeeIncrease < 0)) {
    return 'userFeeIncrease must be a non-negative integer'
  }

  return null
}
