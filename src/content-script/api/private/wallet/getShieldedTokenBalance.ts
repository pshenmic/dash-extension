import { EventData } from '../../../../types/EventData'
import { APIHandler } from '../../APIHandler'
import { WalletRepository } from '../../../repository/WalletRepository'
import { DashPlatformSDK } from 'dash-platform-sdk'
import { ShieldedService } from '../../../services/ShieldedService'
import { GetShieldedTokenBalancePayload } from '../../../../types/messages/payloads/GetShieldedTokenBalancePayload'
import { GetShieldedTokenBalanceResponse } from '../../../../types/messages/response/GetShieldedTokenBalanceResponse'

// What this wallet holds in one token's shielded pool. Note-based like the credit
// balance and read the same way: the pool's note set is scanned, trial-decrypted with
// the wallet's viewing key (needs the password -> seed) and filtered by spent
// nullifiers. Every token has a pool of its own, so the token id picks which one.
export class GetShieldedTokenBalanceHandler implements APIHandler {
  walletRepository: WalletRepository
  sdk: DashPlatformSDK
  shielded: ShieldedService

  constructor (walletRepository: WalletRepository, sdk: DashPlatformSDK, shielded: ShieldedService) {
    this.walletRepository = walletRepository
    this.sdk = sdk
    this.shielded = shielded
  }

  async handle (event: EventData): Promise<GetShieldedTokenBalanceResponse> {
    const payload: GetShieldedTokenBalancePayload = event.payload
    const wallet = await this.walletRepository.getCurrent()

    if (wallet == null) {
      throw new Error('No wallet is chosen')
    }
    if (wallet.type !== 'seedphrase') {
      throw new Error('Shielded token balance can only be read from a seedphrase wallet')
    }

    const account = payload.account ?? 0
    const seed = this.shielded.deriveSeed(wallet, payload.password)

    const { balance, spendableNotes } = await this.shielded.tokenPoolBalance(seed, wallet.network, account, payload.tokenId)

    return {
      tokenId: payload.tokenId,
      balance: balance.toString(),
      spendableNotes
    }
  }

  validatePayload (payload: GetShieldedTokenBalancePayload): string | null {
    if (!this.sdk.utils.validateIdentifier(payload.tokenId)) {
      return 'Could not decode token identifier'
    }
    if (typeof payload.password !== 'string' || payload.password.length === 0) {
      return 'Password must be provided'
    }
    if (payload.account != null && (!Number.isInteger(payload.account) || payload.account < 0)) {
      return 'Account must be a non-negative integer'
    }

    return null
  }
}
