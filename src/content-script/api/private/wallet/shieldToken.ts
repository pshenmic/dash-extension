import { EventData } from '../../../../types/EventData'
import { APIHandler } from '../../APIHandler'
import { WalletRepository } from '../../../repository/WalletRepository'
import { IdentitiesRepository } from '../../../repository/IdentitiesRepository'
import { KeypairRepository } from '../../../repository/KeypairRepository'
import { DashPlatformSDK } from 'dash-platform-sdk'
import { OrchardAddressWASM } from 'dash-platform-shielded'
import { ShieldedService } from '../../../services/ShieldedService'
import { ShieldTokenPayload } from '../../../../types/messages/payloads/ShieldTokenPayload'
import { ShieldTokenResponse } from '../../../../types/messages/response/ShieldTokenResponse'
import { resolveTokenPool, resolveTokenSigner, validateTokenSigningPayload } from './shieldedTokenSigning'

// Moves tokens from the signing identity's token balance into that token's shielded
// pool, where they are held as Orchard notes. Builds the Halo2 proof (slow) and
// broadcasts a token batch transition the identity signs and pays the fee for.
// Nothing is spent out of the pool, so there is no nullifier to confirm afterwards.
export class ShieldTokenHandler implements APIHandler {
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

  async handle (event: EventData): Promise<ShieldTokenResponse> {
    const payload: ShieldTokenPayload = event.payload
    const wallet = await this.walletRepository.getCurrent()

    if (wallet == null) {
      throw new Error('No wallet is chosen')
    }
    if (wallet.type !== 'seedphrase') {
      throw new Error('Shielding tokens is only supported for a seedphrase wallet')
    }

    const account = payload.account ?? 0
    const amount = BigInt(payload.amount)

    const pool = await resolveTokenPool(this.sdk, payload.tokenId)
    const signer = await resolveTokenSigner(this.sdk, this.identitiesRepository, this.keypairRepository, wallet, pool, payload)

    // Shielding to this wallet unless an address is named: the common case is the
    // owner putting their own tokens into the pool.
    const seed = this.shielded.deriveSeed(wallet, payload.password)
    const recipient = payload.toShieldedAddress != null && payload.toShieldedAddress.length > 0
      ? OrchardAddressWASM.fromBech32m(payload.toShieldedAddress)
      : this.sdk.keyPair.deriveShieldedAddress(seed, wallet.network, account)

    console.time('[shielded] token shield: build + prove')
    const stateTransition = await this.shielded.buildTokenShield(pool, signer, { recipient, amount, memo: payload.memo })
    console.timeEnd('[shielded] token shield: build + prove')

    console.log('[shielded] broadcasting…')
    await this.sdk.stateTransitions.broadcast(stateTransition)
    await this.sdk.stateTransitions.waitForStateTransitionResult(stateTransition)

    return {
      stHash: stateTransition.hash(false),
      tokenId: payload.tokenId,
      amount: amount.toString(),
      toShieldedAddress: recipient.toBech32m(wallet.network)
    }
  }

  validatePayload (payload: ShieldTokenPayload): string | null {
    const signingError = validateTokenSigningPayload(this.sdk, payload)

    if (signingError != null) {
      return signingError
    }
    if (payload.toShieldedAddress != null && typeof payload.toShieldedAddress !== 'string') {
      return 'toShieldedAddress must be a string'
    }
    if (payload.account != null && (!Number.isInteger(payload.account) || payload.account < 0)) {
      return 'Account must be a non-negative integer'
    }

    return this.shielded.validateMemo(payload.memo)
  }
}
