import { EventData } from '../../../../types/EventData'
import { APIHandler } from '../../APIHandler'
import { WalletRepository } from '../../../repository/WalletRepository'
import { IdentitiesRepository } from '../../../repository/IdentitiesRepository'
import { KeypairRepository } from '../../../repository/KeypairRepository'
import { DashPlatformSDK } from 'dash-platform-sdk'
import { ShieldedService } from '../../../services/ShieldedService'
import { UnshieldTokenPayload } from '../../../../types/messages/payloads/UnshieldTokenPayload'
import { UnshieldTokenResponse } from '../../../../types/messages/response/UnshieldTokenResponse'
import { resolveTokenPool, resolveTokenSigner, validateTokenSigningPayload } from './shieldedTokenSigning'

// Takes tokens back out of their shielded pool into an identity's public token
// balance. Spends this wallet's notes in that pool and credits `recipientId`, which
// defaults to the signing identity, so taking your own tokens back needs no address.
export class UnshieldTokenHandler implements APIHandler {
  walletRepository: WalletRepository
  identitiesRepository: IdentitiesRepository
  keypairRepository: KeypairRepository
  sdk: DashPlatformSDK
  shielded: ShieldedService

  constructor (
    walletRepository: WalletRepository,
    identitiesRepository: IdentitiesRepository,
    keypairRepository: KeypairRepository,
    sdk: DashPlatformSDK,
    shielded: ShieldedService
  ) {
    this.walletRepository = walletRepository
    this.identitiesRepository = identitiesRepository
    this.keypairRepository = keypairRepository
    this.sdk = sdk
    this.shielded = shielded
  }

  async handle (event: EventData): Promise<UnshieldTokenResponse> {
    const payload: UnshieldTokenPayload = event.payload
    const wallet = await this.walletRepository.getCurrent()

    if (wallet == null) {
      throw new Error('No wallet is chosen')
    }
    if (wallet.type !== 'seedphrase') {
      throw new Error('Unshielding tokens is only supported for a seedphrase wallet')
    }

    const account = payload.account ?? 0
    const amount = BigInt(payload.amount)
    const recipientId = payload.recipientId != null && payload.recipientId.length > 0 ? payload.recipientId : payload.identity
    const seed = this.shielded.deriveSeed(wallet, payload.password)

    const pool = await resolveTokenPool(this.sdk, payload.tokenId)
    const signer = await resolveTokenSigner(this.sdk, this.identitiesRepository, this.keypairRepository, wallet, pool, payload)
    const spend = await this.shielded.prepareTokenSpend(seed, wallet.network, account, amount, payload.tokenId, payload.fromAddresses)

    console.time('[shielded] token unshield: build + prove')
    const stateTransition = await this.shielded.buildTokenUnshield(pool, signer, { spend, seed, account }, {
      recipientId,
      amount,
      memo: payload.memo
    })
    console.timeEnd('[shielded] token unshield: build + prove')

    console.log('[shielded] broadcasting…')
    await this.sdk.stateTransitions.broadcast(stateTransition)
    // Not the SDK's wait on its own: a proof it cannot verify would otherwise read
    // as a spend that never happened, and the caller would send another.
    await this.shielded.confirmSpend(stateTransition, spend.nullifiers)

    return {
      stHash: stateTransition.hash(false),
      tokenId: payload.tokenId,
      amount: amount.toString(),
      recipientId
    }
  }

  validatePayload (payload: UnshieldTokenPayload): string | null {
    const signingError = validateTokenSigningPayload(this.sdk, payload)

    if (signingError != null) {
      return signingError
    }
    if (payload.recipientId != null && !this.sdk.utils.validateIdentifier(payload.recipientId)) {
      return 'Could not decode recipient identity identifier'
    }
    if (payload.account != null && (!Number.isInteger(payload.account) || payload.account < 0)) {
      return 'Account must be a non-negative integer'
    }
    if (payload.fromAddresses != null) {
      if (!Array.isArray(payload.fromAddresses) || payload.fromAddresses.length === 0) {
        return 'fromAddresses must be a non-empty array of addresses'
      }
      if (!payload.fromAddresses.every(address => typeof address === 'string' && address.length > 0)) {
        return 'fromAddresses must contain only non-empty address strings'
      }
    }

    return this.shielded.validateMemo(payload.memo)
  }
}
