import { WalletRepository } from '../../../repository/WalletRepository'
import { CoreUtxosService } from '../../../services/CoreUtxosService'
import { CoreAddressChain } from '../../../../types/enums/CoreAddressChain'

/**
 * The Core (L1) addresses of the current wallet that a website may be granted:
 * its receiving chain, as far as that chain reaches today.
 *
 * Change addresses are left out of every grant. They are an internal concern of
 * spending, the same reason GET_CORE_RECEIVE_ADDRESS refuses to hand one out.
 * A wallet whose Core xpub has not been initialized yet - every keystore
 * wallet, and a seedphrase one until INIT_ACCOUNT_XPUBS runs - has nothing to
 * grant.
 */
export const listGrantableAddresses = async (
  walletRepository: WalletRepository,
  coreUtxos: CoreUtxosService
): Promise<string[]> => {
  const wallet = await walletRepository.getCurrent()

  if (wallet == null) {
    throw new Error('No wallet is chosen')
  }

  const account = 0
  const xpub = await walletRepository.getCoreAccountXpub(account)

  if (xpub == null) {
    return []
  }

  const { owned } = await coreUtxos.ownedAddresses(wallet, xpub, account)

  return [...owned.values()]
    .filter(entry => entry.chain === CoreAddressChain.receiving)
    .map(entry => entry.address)
}
