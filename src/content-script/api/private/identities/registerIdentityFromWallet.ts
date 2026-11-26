import { DashCoreSDK } from 'dash-core-sdk'
import { DashPlatformSDK } from 'dash-platform-sdk'
import { EventData } from '../../../../types'
import { APIHandler } from '../../APIHandler'
import { WalletRepository } from '../../../repository/WalletRepository'
import { AssetLockFundingAddressesRepository } from '../../../repository/AssetLockFundingAddressesRepository'
import { PendingAssetLocksRepository } from '../../../repository/PendingAssetLocksRepository'
import { AssetLockFundingService } from '../../../services/AssetLockFundingService'
import { RequestAssetLockFundingAddressHandler } from '../assetLocks/requestAssetLockFundingAddress'
import { RegisterIdentityHandler } from './registerIdentity'
import { RegisterIdentityFromWalletPayload } from '../../../../types/messages/payloads/RegisterIdentityFromWalletPayload'
import { RegisterIdentityFromWalletResponse } from '../../../../types/messages/response/RegisterIdentityFromWalletResponse'
import { RepositoryScope } from '../../../../types/RepositoryScope'
import { validateRepositoryScopePayload } from '../../../../utils/validateRepositoryScopePayload'
import { deriveCoreAccountXpub } from '../../../../utils/coreAddresses'
import { findUnfinishedAssetLock } from '../../../../utils/pendingAssetLocks'
import { WalletType } from '../../../../types/WalletType'
import { MIN_FEE_RELAY } from '../../../../constants'

// Registers an identity with the wallet's own Core coins, in one call: reserve
// an asset lock funding address, pay it from the wallet's unspent outputs, then
// create the identity from that deposit.
//
// The third of the Core to Platform chains, next to TOP_UP_IDENTITY_FROM_WALLET
// and FUND_PLATFORM_ADDRESS_FROM_WALLET, and interrupted the same way: a caller
// that closed between the payment and the asset lock used to leave the coins at
// the funding address with nothing coming back for them.
export class RegisterIdentityFromWalletHandler implements APIHandler {
  walletRepository: WalletRepository
  assetLockFundingAddressesRepository: AssetLockFundingAddressesRepository
  pendingAssetLocksRepository: PendingAssetLocksRepository
  assetLockFunding: AssetLockFundingService
  requestAssetLockFundingAddress: RequestAssetLockFundingAddressHandler
  registerIdentity: RegisterIdentityHandler
  sdk: DashPlatformSDK
  coreSDK: DashCoreSDK

  constructor (
    walletRepository: WalletRepository,
    assetLockFundingAddressesRepository: AssetLockFundingAddressesRepository,
    pendingAssetLocksRepository: PendingAssetLocksRepository,
    assetLockFunding: AssetLockFundingService,
    requestAssetLockFundingAddress: RequestAssetLockFundingAddressHandler,
    registerIdentity: RegisterIdentityHandler,
    sdk: DashPlatformSDK,
    coreSDK: DashCoreSDK
  ) {
    this.walletRepository = walletRepository
    this.assetLockFundingAddressesRepository = assetLockFundingAddressesRepository
    this.pendingAssetLocksRepository = pendingAssetLocksRepository
    this.assetLockFunding = assetLockFunding
    this.requestAssetLockFundingAddress = requestAssetLockFundingAddress
    this.registerIdentity = registerIdentity
    this.sdk = sdk
    this.coreSDK = coreSDK
  }

  async handle (event: EventData): Promise<RegisterIdentityFromWalletResponse> {
    const payload: RegisterIdentityFromWalletPayload = event.payload

    // Resolved once and handed to every step, so the funding address, the
    // payment and the identity all belong to the same (network, wallet) even if
    // the selection changes while the asset lock is waiting for its proof.
    const scope = await this.resolveScope(payload)

    const walletRepository = this.walletRepository.forScope(scope)
    const wallet = await walletRepository.getCurrent()

    if (wallet == null) {
      throw new Error(`Wallet ${scope.walletId} does not exist on ${scope.network}`)
    }
    if (wallet.type !== WalletType.seedphrase) {
      throw new Error('Identity registration is only supported for seedphrase wallets')
    }

    // An earlier attempt may have got as far as putting the asset lock on L1.
    // A registration names no recipient - it creates one - so any unfinished
    // registration is this one, and finishing it is what a repeat is for.
    const unfinished = findUnfinishedAssetLock(
      await this.pendingAssetLocksRepository.forScope(scope).getAll(), 'registration', null
    )

    if (unfinished != null) {
      const resumed = await this.register(scope, unfinished.fundingAddress, unfinished.fundingTxid, payload.password, event)

      return { ...resumed, coreFeeDuffs: '0', resumed: true }
    }

    const account = 0
    const xpub = await walletRepository.getCoreAccountXpub(account) ??
      await deriveCoreAccountXpub(wallet, payload.password, account, this.sdk)

    // The registration pool, which is what REQUEST_ASSET_LOCK_FUNDING_ADDRESS
    // hands out by default: an address already waiting for a deposit is reused
    // rather than left behind.
    const { address: fundingAddress } = await this.requestAssetLockFundingAddress.handle({
      ...event,
      payload: { purpose: 'registration', walletId: scope.walletId, network: scope.network }
    })

    const funding = await this.assetLockFunding.fundFromWallet({
      wallet,
      xpub,
      account,
      fundingAddress,
      amountDuffs: BigInt(payload.amountDuffs),
      password: payload.password,
      assetLockFundingAddressesRepository: this.assetLockFundingAddressesRepository.forScope(scope)
    })

    const registered = await this.register(scope, fundingAddress, funding.fundingTxid, payload.password, event)

    return {
      ...registered,
      coreFeeDuffs: funding.feeDuffs.toString(),
      // Nothing was paid when the funding address already held the deposit of
      // an earlier attempt, so this call continued that one.
      resumed: !funding.paid
    }
  }

  // The Platform half: create the identity from this deposit.
  private async register (scope: RepositoryScope, fundingAddress: string, fundingTxid: string, password: string, event: EventData): Promise<Omit<RegisterIdentityFromWalletResponse, 'coreFeeDuffs' | 'resumed'>> {
    const registered = await this.registerIdentity.handle({
      ...event,
      payload: {
        assetLockFundingAddress: fundingAddress,
        assetLockFundingTxid: fundingTxid,
        password,
        walletId: scope.walletId,
        network: scope.network
      }
    })

    return {
      identifier: registered.identifier,
      stateTransitionHash: registered.stateTransitionHash,
      assetLockTxid: registered.assetLockTxid,
      fundingAddress,
      fundingTxid
    }
  }

  // Same contract as REGISTER_IDENTITY, and the same reason to check both SDKs:
  // they are fixed to a network for the lifetime of the document that built
  // them, and this call spends real coins before the registration handler gets
  // to make the check itself.
  private async resolveScope (payload: RegisterIdentityFromWalletPayload): Promise<RepositoryScope> {
    let scope: RepositoryScope

    if (payload.walletId != null && payload.network != null) {
      scope = { network: payload.network, walletId: payload.walletId }
    } else {
      const currentWallet = await this.walletRepository.getCurrent()

      if (currentWallet == null) {
        throw new Error('No wallet is chosen')
      }

      scope = { network: currentWallet.network, walletId: currentWallet.walletId }
    }

    if (this.sdk.getNetwork() !== scope.network || this.coreSDK.network !== scope.network) {
      throw new Error(
        `Registration is bound to ${scope.network}, but this context is connected to ` +
        `${this.sdk.getNetwork()} (platform) and ${this.coreSDK.network} (core) - reopen the registration page`
      )
    }

    return scope
  }

  validatePayload (payload: RegisterIdentityFromWalletPayload): string | null {
    if (typeof payload.amountDuffs !== 'string' || !/^\d+$/.test(payload.amountDuffs)) {
      return 'amountDuffs must be a positive integer string of duffs'
    }
    // Below this there is nothing left to lock: the asset lock pays its own fee
    // out of the deposit.
    if (BigInt(payload.amountDuffs) <= MIN_FEE_RELAY) {
      return `amountDuffs must be greater than the asset lock fee (${MIN_FEE_RELAY.toString()} duffs)`
    }
    if (typeof payload.password !== 'string' || payload.password.length === 0) {
      return 'password must be provided'
    }

    return validateRepositoryScopePayload(payload)
  }
}
