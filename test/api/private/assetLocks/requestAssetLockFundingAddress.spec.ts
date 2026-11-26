import { RequestAssetLockFundingAddressHandler } from '../../../../src/content-script/api/private/assetLocks/requestAssetLockFundingAddress'

const ADDRESS = 'yFundingAddress'

describe('RequestAssetLockFundingAddressHandler', () => {
  let walletRepository: any
  let assetLockFundingAddressesRepository: any
  let sdk: any
  let storageAdapter: any
  let handler: RequestAssetLockFundingAddressHandler

  const handle = async (payload: any = {}): Promise<any> =>
    await handler.handle({
      id: '1',
      context: 'dash-platform-extension',
      method: 'REQUEST_ASSET_LOCK_FUNDING_ADDRESS',
      type: 'request',
      payload
    } as any)

  beforeEach(() => {
    jest.clearAllMocks()

    walletRepository = {
      getCurrent: jest.fn(async () => ({ walletId: 'wallet1', network: 'testnet' })),
      forScope: jest.fn(() => walletRepository)
    }

    assetLockFundingAddressesRepository = {
      findUnused: jest.fn(async () => ({ address: ADDRESS })),
      bindToRecipient: jest.fn(async () => {}),
      create: jest.fn(async () => {}),
      forScope: jest.fn(() => assetLockFundingAddressesRepository)
    }

    sdk = { keyPair: { p2pkhAddress: jest.fn(() => ADDRESS) } }
    storageAdapter = { get: jest.fn(async () => 'passwordPublicKey') }

    handler = new RequestAssetLockFundingAddressHandler(
      assetLockFundingAddressesRepository,
      walletRepository,
      sdk,
      storageAdapter
    )
  })

  it('issues the address under the pair the caller names', async () => {
    const scope = { network: 'testnet', walletId: 'wallet1' }

    const response = await handle({ purpose: 'registration', ...scope })

    expect(response).toEqual({ address: ADDRESS })
    expect(walletRepository.forScope).toHaveBeenCalledWith(scope)
    expect(assetLockFundingAddressesRepository.forScope).toHaveBeenCalledWith(scope)
    // The pair comes from the payload, so the current selection is never read.
    expect(walletRepository.getCurrent).toHaveBeenCalledTimes(1)
  })

  it('falls back to the current selection when the caller names no pair', async () => {
    await handle()

    expect(walletRepository.forScope).toHaveBeenCalledWith({ network: 'testnet', walletId: 'wallet1' })
    expect(assetLockFundingAddressesRepository.findUnused).toHaveBeenCalledWith('registration', undefined)
  })

  it('refuses a pair whose wallet does not exist', async () => {
    walletRepository.getCurrent.mockResolvedValue(null)

    await expect(handle({ walletId: 'wallet2', network: 'testnet' }))
      .rejects.toThrow('Wallet wallet2 does not exist on testnet')
    expect(assetLockFundingAddressesRepository.findUnused).not.toHaveBeenCalled()
  })

  describe('validatePayload', () => {
    it('accepts a payload with both halves of the pair', () => {
      expect(handler.validatePayload({ purpose: 'registration', walletId: 'wallet1', network: 'testnet' })).toBeNull()
    })

    it('rejects half a pair and an unknown network', () => {
      expect(handler.validatePayload({ walletId: 'wallet1' })).toMatch(/together/)
      expect(handler.validatePayload({ network: 'testnet' })).toMatch(/together/)
      expect(handler.validatePayload({ walletId: 'wallet1', network: 'regtest' as any })).toMatch(/testnet or mainnet/)
    })
  })
})
