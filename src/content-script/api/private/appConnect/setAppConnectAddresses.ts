import { APIHandler } from '../../APIHandler'
import { EventData } from '../../../../types/EventData'
import { SetAppConnectAddressesPayload } from '../../../../types/messages/payloads/SetAppConnectAddressesPayload'
import { VoidResponse } from '../../../../types/messages/response/VoidResponse'
import { AppConnectRepository } from '../../../repository/AppConnectRepository'
import { WalletRepository } from '../../../repository/WalletRepository'
import { CoreUtxosService } from '../../../services/CoreUtxosService'
import { listGrantableAddresses } from './grantableAddresses'

// Changes which of the wallet's Core (L1) addresses an already connected website
// may see, from the connected sites screen. An empty list leaves the connection
// in place with no address to pay or refund the user on.
export class SetAppConnectAddressesHandler implements APIHandler {
  appConnectRepository: AppConnectRepository
  walletRepository: WalletRepository
  coreUtxos: CoreUtxosService

  constructor (appConnectRepository: AppConnectRepository, walletRepository: WalletRepository, coreUtxos: CoreUtxosService) {
    this.appConnectRepository = appConnectRepository
    this.walletRepository = walletRepository
    this.coreUtxos = coreUtxos
  }

  async handle (event: EventData): Promise<VoidResponse> {
    const payload: SetAppConnectAddressesPayload = event.payload

    if (await this.appConnectRepository.getById(payload.id) == null) {
      throw new Error('AppConnect not found')
    }

    if (payload.addresses.length > 0) {
      const grantable = await listGrantableAddresses(this.walletRepository, this.coreUtxos)

      for (const address of payload.addresses) {
        if (!grantable.includes(address)) {
          throw new Error(`Address ${address} does not belong to this wallet`)
        }
      }
    }

    await this.appConnectRepository.setAddresses(payload.id, payload.addresses)

    return {}
  }

  validatePayload (payload: SetAppConnectAddressesPayload): null | string {
    if (typeof payload?.id !== 'string' || payload.id.length === 0) {
      return 'ID is required'
    }

    if (!Array.isArray(payload.addresses)) {
      return 'addresses must be an array of Core addresses'
    }

    if (payload.addresses.some(address => typeof address !== 'string' || address.length === 0)) {
      return 'addresses must be non-empty strings'
    }

    return null
  }
}
