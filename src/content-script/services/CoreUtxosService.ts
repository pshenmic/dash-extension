import { DashPlatformSDK } from 'dash-platform-sdk'
import { Wallet } from '../../types/Wallet'
import { NetworkType } from '../../types/PlatformExplorer'
import { CoreAddressChain } from '../../types/enums/CoreAddressChain'
import { CoreAddressEntry, deriveCoreAddressesFromXpub } from '../../utils/coreAddresses'
import { CoreExplorerService, CoreWalletUtxo } from './CoreExplorerService'

export interface OwnedCoreAddresses {
  // Every address of the account the explorer has seen, plus the next free one
  // on each chain - the extent that counts as "this wallet's own". Keyed by
  // address, in derivation order: the receiving chain first, then change.
  owned: Map<string, CoreAddressEntry>
  nextUnused: Record<CoreAddressChain, number>
}

export interface SpendableCoreUtxos extends OwnedCoreAddresses {
  // What can be spent now. The explorer indexes the mempool, so a send made a
  // moment ago is already reflected: the outputs it consumed are gone from this
  // set and the change it paid us is in it.
  utxos: CoreWalletUtxo[]
}

/**
 * One answer to "what does this wallet have on L1 right now", shared by the
 * UTXO list, the balance, the fee estimate and the send, so that none of them
 * can disagree with the others.
 */
export class CoreUtxosService {
  sdk: DashPlatformSDK
  coreExplorer: CoreExplorerService

  constructor (sdk: DashPlatformSDK, coreExplorer: CoreExplorerService) {
    this.sdk = sdk
    this.coreExplorer = coreExplorer
  }

  // Which addresses of the account exist at all. One explorer round trip: the
  // gap scan says how far the account reaches, and the addresses themselves are
  // always derived locally from the xpub, because an explorer that returned
  // them directly could hand back one the wallet does not own.
  async ownedAddresses (wallet: Wallet, xpub: string, account: number = 0): Promise<OwnedCoreAddresses> {
    const { nextUnused } = await this.coreExplorer.getXpubSummary(xpub, wallet.network as NetworkType)

    const owned = new Map<string, CoreAddressEntry>()

    for (const chain of [CoreAddressChain.receiving, CoreAddressChain.change]) {
      for (const entry of deriveCoreAddressesFromXpub(this.sdk, xpub, wallet.network, account, chain, nextUnused[chain] + 1)) {
        owned.set(entry.address, entry)
      }
    }

    return { owned, nextUnused }
  }

  // `addresses` narrows the read to some of the wallet's own addresses; without
  // it the whole account is read. An address the account does not derive is
  // refused: there is no key to sign its outputs with, so listing them could
  // only lead to a transaction nobody can sign.
  async spendable (wallet: Wallet, xpub: string, account: number = 0, addresses?: string[]): Promise<SpendableCoreUtxos> {
    const network = wallet.network as NetworkType
    const { owned, nextUnused } = await this.ownedAddresses(wallet, xpub, account)

    for (const address of addresses ?? []) {
      if (!owned.has(address)) {
        throw new Error('Source address not found in this wallet')
      }
    }

    const asked = addresses ?? [...owned.keys()]
    const explorerUtxos = await this.coreExplorer.getAddressesUtxos(asked, network)

    // An output the explorer could not attribute to one of the addresses we
    // asked about has no key to sign it, and must not reach coin selection.
    const askedSet = new Set(asked)

    return {
      utxos: explorerUtxos.filter(utxo => askedSet.has(utxo.address)),
      owned,
      nextUnused
    }
  }

  // Sum of what can be spent now.
  async availableDuffs (wallet: Wallet, xpub: string, account: number = 0): Promise<bigint> {
    const { utxos } = await this.spendable(wallet, xpub, account)

    return utxos.reduce((sum, utxo) => sum + utxo.amount, 0n)
  }
}
