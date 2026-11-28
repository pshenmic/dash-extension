import { EventData } from '../../../../types/EventData'
import { APIHandler } from '../../APIHandler'
import { WalletRepository } from '../../../repository/WalletRepository'
import { IdentitiesRepository } from '../../../repository/IdentitiesRepository'
import { KeypairRepository } from '../../../repository/KeypairRepository'
import { DashPlatformSDK } from 'dash-platform-sdk'
import { OrchardAddressWASM } from 'dash-platform-shielded'
import { ShieldedService } from '../../../services/ShieldedService'
import { SendShieldedTokenTransferPayload } from '../../../../types/messages/payloads/SendShieldedTokenTransferPayload'
import { SendShieldedTokenTransferResponse } from '../../../../types/messages/response/SendShieldedTokenTransferResponse'
import { resolveTokenPool, resolveTokenSigner, validateTokenSigningPayload } from './shieldedTokenSigning'

// Sends tokens privately inside one token's shielded pool (pool -> pool). Selects and
// witnesses this wallet's notes in that pool, builds the Halo2 proof (slow) and
// broadcasts a token batch transition the signing identity pays the fee for - the
// notes cover the amount alone, since no fee comes out of the token pool.
export class SendShieldedTokenTransferHandler implements APIHandler {
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

  async handle (event: EventData): Promise<SendShieldedTokenTransferResponse> {
    const payload: SendShieldedTokenTransferPayload = event.payload
    const wallet = await this.walletRepository.getCurrent()

    if (wallet == null) {
      throw new Error('No wallet is chosen')
    }
    if (wallet.type !== 'seedphrase') {
      throw new Error('Shielded token transfer is only supported for a seedphrase wallet')
    }

    const account = payload.account ?? 0
    const amount = BigInt(payload.amount)
    const seed = this.shielded.deriveSeed(wallet, payload.password)

    const pool = await resolveTokenPool(this.sdk, payload.tokenId)
    const signer = await resolveTokenSigner(this.sdk, this.identitiesRepository, this.keypairRepository, wallet, pool, payload)
    const spend = await this.shielded.prepareTokenSpend(seed, wallet.network, account, amount, payload.tokenId, payload.fromAddresses)

    console.time('[shielded] token transfer: build + prove')
    const stateTransition = await this.shielded.buildTokenTransfer(pool, signer, { spend, seed, account }, {
      recipient: OrchardAddressWASM.fromBech32m(payload.toShieldedAddress),
      amount,
      memo: payload.memo
    })
    console.timeEnd('[shielded] token transfer: build + prove')

    console.log('[shielded] broadcasting…')
    await this.sdk.stateTransitions.broadcast(stateTransition)
    // Not the SDK's wait on its own: a proof it cannot verify would otherwise read
    // as a spend that never happened, and the caller would send another.
    await this.shielded.confirmSpend(stateTransition, spend.nullifiers)

    return {
      stHash: stateTransition.hash(false),
      tokenId: payload.tokenId,
      amount: amount.toString(),
      toShieldedAddress: payload.toShieldedAddress
    }
  }

  validatePayload (payload: SendShieldedTokenTransferPayload): string | null {
    const signingError = validateTokenSigningPayload(this.sdk, payload)

    if (signingError != null) {
      return signingError
    }
    if (typeof payload.toShieldedAddress !== 'string' || payload.toShieldedAddress.length === 0) {
      return 'Recipient shielded address must be provided'
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
