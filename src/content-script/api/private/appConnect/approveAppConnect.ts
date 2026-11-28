import { APIHandler } from '../../APIHandler'
import { EventData } from '../../../../types/EventData'
import { ApproveAppConnectPayload } from '../../../../types/messages/payloads/ApproveAppConnectPayload'
import { VoidResponse } from '../../../../types/messages/response/VoidResponse'
import { AppConnectRepository } from '../../../repository/AppConnectRepository'
import { IdentitiesRepository } from '../../../repository/IdentitiesRepository'
import { WalletRepository } from '../../../repository/WalletRepository'
import { CoreUtxosService } from '../../../services/CoreUtxosService'
import { AppConnectStatus } from '../../../../types/enums/AppConnectStatus'
import { listGrantableAddresses } from './grantableAddresses'

export class ApproveAppConnectHandler implements APIHandler {
  appConnectRepository: AppConnectRepository
  identitiesRepository: IdentitiesRepository
  walletRepository: WalletRepository
  coreUtxos: CoreUtxosService

  constructor (
    appConnectRepository: AppConnectRepository,
    identitiesRepository: IdentitiesRepository,
    walletRepository: WalletRepository,
    coreUtxos: CoreUtxosService
  ) {
    this.appConnectRepository = appConnectRepository
    this.identitiesRepository = identitiesRepository
    this.walletRepository = walletRepository
    this.coreUtxos = coreUtxos
  }

  async handle (event: EventData): Promise<VoidResponse> {
    const payload: ApproveAppConnectPayload = event.payload

    const appConnect = await this.appConnectRepository.getById(payload.id)

    if (appConnect == null) {
      throw new Error('AppConnect not found')
    }

    const owned = (await this.identitiesRepository.getAll()).map(identity => identity.identifier)

    // Approving without naming identities grants the wallet's current ones,
    // which is what the approval screen means until it offers a choice.
    const granted = payload.identities ?? owned

    for (const identifier of granted) {
      if (!owned.includes(identifier)) {
        throw new Error(`Identity ${identifier} does not belong to this wallet`)
      }
    }

    const grantedAddresses = await this.resolveAddresses(payload.addresses)

    await this.appConnectRepository.setIdentities(payload.id, granted)
    await this.appConnectRepository.setAddresses(payload.id, grantedAddresses)
    await this.appConnectRepository.setStatus(payload.id, AppConnectStatus.approved)

    return {}
  }

  /**
   * The Core (L1) addresses the approval grants: the ones the user picked, or
   * every address of the wallet's receiving chain when the approval names none.
   *
   * The default is resolved from the L1 explorer, and a connection must not hang
   * on that explorer being up: when it cannot be read the website is approved
   * with no address at all, which the user can still grant from the connected
   * sites screen. An address the user did name is checked strictly instead - a
   * grant they asked for must not silently turn into something else.
   */
  private async resolveAddresses (asked?: string[]): Promise<string[]> {
    if (asked != null && asked.length === 0) {
      return []
    }

    if (asked == null) {
      try {
        return await listGrantableAddresses(this.walletRepository, this.coreUtxos)
      } catch (error) {
        return []
      }
    }

    const grantable = await listGrantableAddresses(this.walletRepository, this.coreUtxos)

    for (const address of asked) {
      if (!grantable.includes(address)) {
        throw new Error(`Address ${address} does not belong to this wallet`)
      }
    }

    return asked
  }

  validatePayload (payload: ApproveAppConnectPayload): null | string {
    if (typeof payload?.id !== 'string' || payload.id.length === 0) {
      return 'ID is required'
    }

    if (payload.identities != null && !Array.isArray(payload.identities)) {
      return 'identities must be an array of identifiers when provided'
    }

    if (payload.identities?.some(identifier => typeof identifier !== 'string' || identifier.length === 0) === true) {
      return 'identities must be non-empty strings'
    }

    if (payload.addresses != null && !Array.isArray(payload.addresses)) {
      return 'addresses must be an array of Core addresses when provided'
    }

    if (payload.addresses?.some(address => typeof address !== 'string' || address.length === 0) === true) {
      return 'addresses must be non-empty strings'
    }

    return null
  }
}
