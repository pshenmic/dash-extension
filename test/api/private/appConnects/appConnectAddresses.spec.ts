import { ApproveAppConnectHandler } from '../../../../src/content-script/api/private/appConnect/approveAppConnect'
import { SetAppConnectAddressesHandler } from '../../../../src/content-script/api/private/appConnect/setAppConnectAddresses'
import { CoreAddressChain } from '../../../../src/types/enums/CoreAddressChain'
import { AppConnectStatus } from '../../../../src/types/enums/AppConnectStatus'
import { CoreAddressEntry } from '../../../../src/utils/coreAddresses'

const CONNECT_ID = 'abc123'
const RECEIVING = ['yRecv0', 'yRecv1']
const CHANGE = ['yChange0']

const entry = (address: string, index: number, chain: CoreAddressChain): CoreAddressEntry =>
  ({ address, index, chain, derivationPath: `m/44'/1'/0'/${chain === CoreAddressChain.receiving ? 0 : 1}/${index}` })

// The account as the explorer and the xpub describe it: both chains, in
// derivation order, the way CoreUtxosService hands it over.
const ownedAccount = (): Map<string, CoreAddressEntry> => new Map([
  ...RECEIVING.map((address, index) => [address, entry(address, index, CoreAddressChain.receiving)] as const),
  ...CHANGE.map((address, index) => [address, entry(address, index, CoreAddressChain.change)] as const)
])

// Which of the wallet's Core (L1) addresses a website is allowed to see. The
// identity half of the same grant is covered by appConnectPermissions.spec.
describe('the Core addresses a website is granted', () => {
  let appConnectRepository: any
  let identitiesRepository: any
  let walletRepository: any
  let coreUtxos: any

  const event = (method: string, payload: any): any =>
    ({ id: '1', context: 'dash-platform-extension', method, type: 'request', payload })

  const approve = async (payload: any = { id: CONNECT_ID }): Promise<any> =>
    await new ApproveAppConnectHandler(appConnectRepository, identitiesRepository, walletRepository, coreUtxos)
      .handle(event('APPROVE_APP_CONNECT', payload))

  const setAddresses = async (payload: any): Promise<any> =>
    await new SetAppConnectAddressesHandler(appConnectRepository, walletRepository, coreUtxos)
      .handle(event('SET_APP_CONNECT_ADDRESSES', payload))

  beforeEach(() => {
    jest.clearAllMocks()

    appConnectRepository = {
      getById: jest.fn(async () => ({
        id: CONNECT_ID, url: 'https://app.example.com', status: AppConnectStatus.pending, identities: [], addresses: []
      })),
      setIdentities: jest.fn(),
      setAddresses: jest.fn(),
      setStatus: jest.fn()
    }
    identitiesRepository = { getAll: jest.fn(async () => []) }
    walletRepository = {
      getCurrent: jest.fn(async () => ({ walletId: 'wallet1', type: 'seedphrase', network: 'testnet' })),
      getCoreAccountXpub: jest.fn(async () => 'tpubAccountXpub')
    }
    coreUtxos = {
      ownedAddresses: jest.fn(async () => ({ owned: ownedAccount(), nextUnused: { receiving: 1, change: 0 } }))
    }
  })

  describe('on approval', () => {
    it('grants every receiving address of the wallet when the approval names none', async () => {
      await approve()

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, RECEIVING)
      expect(appConnectRepository.setStatus).toHaveBeenCalledWith(CONNECT_ID, AppConnectStatus.approved)
    })

    it('never grants a change address', async () => {
      await approve()

      const [, granted] = appConnectRepository.setAddresses.mock.calls[0]

      expect(granted).not.toContain(CHANGE[0])
    })

    it('grants only the addresses the approval names', async () => {
      await approve({ id: CONNECT_ID, addresses: [RECEIVING[1]] })

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, [RECEIVING[1]])
    })

    it('grants nothing when the approval names an empty list, without reading L1', async () => {
      await approve({ id: CONNECT_ID, addresses: [] })

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, [])
      expect(coreUtxos.ownedAddresses).not.toHaveBeenCalled()
    })

    it('refuses an address the wallet does not own, and approves nothing', async () => {
      await expect(approve({ id: CONNECT_ID, addresses: ['yNotOurs'] }))
        .rejects.toThrow('Address yNotOurs does not belong to this wallet')

      expect(appConnectRepository.setAddresses).not.toHaveBeenCalled()
      expect(appConnectRepository.setStatus).not.toHaveBeenCalled()
    })

    it('refuses a change address of this very wallet', async () => {
      await expect(approve({ id: CONNECT_ID, addresses: [CHANGE[0]] }))
        .rejects.toThrow('does not belong to this wallet')
    })

    it('grants no address when the wallet has no Core xpub yet', async () => {
      walletRepository.getCoreAccountXpub.mockResolvedValue(null)

      await approve()

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, [])
      expect(coreUtxos.ownedAddresses).not.toHaveBeenCalled()
    })

    it('still connects the website when the default grant cannot be read from L1', async () => {
      coreUtxos.ownedAddresses.mockRejectedValue(new Error('Core explorer error for xpub summary: HTTP 502'))

      await approve()

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, [])
      expect(appConnectRepository.setStatus).toHaveBeenCalledWith(CONNECT_ID, AppConnectStatus.approved)
    })
  })

  describe('on a later change', () => {
    it('replaces the whole grant', async () => {
      await setAddresses({ id: CONNECT_ID, addresses: [RECEIVING[0]] })

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, [RECEIVING[0]])
    })

    it('revokes every address without touching the connection', async () => {
      await setAddresses({ id: CONNECT_ID, addresses: [] })

      expect(appConnectRepository.setAddresses).toHaveBeenCalledWith(CONNECT_ID, [])
      expect(appConnectRepository.setStatus).not.toHaveBeenCalled()
    })

    it('refuses an address the wallet does not own', async () => {
      await expect(setAddresses({ id: CONNECT_ID, addresses: ['yNotOurs'] }))
        .rejects.toThrow('Address yNotOurs does not belong to this wallet')

      expect(appConnectRepository.setAddresses).not.toHaveBeenCalled()
    })

    it('throws when the connection is unknown', async () => {
      appConnectRepository.getById.mockResolvedValue(null)

      await expect(setAddresses({ id: CONNECT_ID, addresses: [] })).rejects.toThrow('AppConnect not found')
    })

    it('rejects a payload that is not a list of addresses', () => {
      const handler = new SetAppConnectAddressesHandler(appConnectRepository, walletRepository, coreUtxos)

      expect(handler.validatePayload({ id: CONNECT_ID } as any)).toMatch(/must be an array/)
      expect(handler.validatePayload({ id: CONNECT_ID, addresses: [''] })).toMatch(/non-empty/)
      expect(handler.validatePayload({ id: CONNECT_ID, addresses: [RECEIVING[0]] })).toBeNull()
    })
  })
})
