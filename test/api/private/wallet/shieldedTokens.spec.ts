import { GetShieldedTokenBalanceHandler } from '../../../../src/content-script/api/private/wallet/getShieldedTokenBalance'
import { ShieldTokenHandler } from '../../../../src/content-script/api/private/wallet/shieldToken'
import { UnshieldTokenHandler } from '../../../../src/content-script/api/private/wallet/unshieldToken'
import { SendShieldedTokenTransferHandler } from '../../../../src/content-script/api/private/wallet/sendShieldedTokenTransfer'
import { ShieldedService } from '../../../../src/content-script/services/ShieldedService'

// Keep the real shielded module and only stub the address parser the handlers call.
jest.mock('dash-platform-shielded', () => {
  const actual = jest.requireActual('dash-platform-shielded')
  return {
    ...actual,
    OrchardAddressWASM: { ...actual.OrchardAddressWASM, fromBech32m: jest.fn((addr) => ({ addr, toBech32m: () => addr })) }
  }
})

// The builder returns proof bytes; nothing here decodes them, so the transition is stubbed.
jest.mock('pshenmic-dpp', () => {
  const actual = jest.requireActual('pshenmic-dpp')
  return {
    ...actual,
    StateTransitionWASM: { ...actual.StateTransitionWASM, fromBytes: jest.fn(() => ({ hash: () => 'stHash' })) }
  }
})

// A seedphrase wallet signs with a key derived from the seed, never from the keystore.
jest.mock('../../../../src/utils', () => {
  const actual = jest.requireActual('../../../../src/utils')
  return {
    ...actual,
    deriveIdentityPrivateKey: jest.fn(async () => ({ bytes: () => new Uint8Array([2]) })),
    deriveKeystorePrivateKey: jest.fn(async () => ({ bytes: () => new Uint8Array([3]) }))
  }
})

const TOKEN_ID = 'HT3pUBM1Uv2mKgdPEN1gxa7A4PdsvNY89aJbdSKQb5wR'
const CONTRACT_ID = '2HPEBQW4JgatyogjFc5KdYzAXaPAyTEG4ShYYKS7w643'
const IDENTITY = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const OTHER_IDENTITY = '5iV1XkMbsPKEuafDmWqCSLnPxwMFtjCGScE2vdZgnSA3'
const TO_ADDRESS = 'orchardRecipient'
const CONTRACT_POSITION = 3

describe('shielded token pools', () => {
  let walletRepository: any
  let identitiesRepository: any
  let keypairRepository: any
  let sdk: any
  let builder: any
  let shielded: ShieldedService

  const event = (method: string, payload: any): any =>
    ({ context: 'dash-extension', id: 'id', method, type: 'request', payload })

  const signedPayload = {
    tokenId: TOKEN_ID,
    identity: IDENTITY,
    keyId: 1,
    password: 'test',
    amount: '10'
  }

  beforeEach(() => {
    jest.clearAllMocks()

    walletRepository = {
      getCurrent: jest.fn(async () => ({
        walletId: 'wallet1',
        type: 'seedphrase',
        network: 'testnet',
        label: null,
        encryptedMnemonic: 'encryptedMnemonic',
        seedHash: 'seedHash',
        currentIdentity: null
      }))
    }
    identitiesRepository = { getByIdentifier: jest.fn(async () => ({ identifier: IDENTITY, index: 0 })) }
    keypairRepository = {}

    builder = {
      tokenShield: jest.fn(async () => new Uint8Array([1])),
      tokenUnshield: jest.fn(async () => new Uint8Array([1])),
      tokenShieldedTransfer: jest.fn(async () => new Uint8Array([1]))
    }

    sdk = {
      utils: { validateIdentifier: jest.fn(() => true) },
      keyPair: {
        mnemonicToSeed: jest.fn(() => new Uint8Array([1, 2, 3])),
        deriveShieldedAddress: jest.fn(() => ({ toBech32m: () => 'ourOwnShieldedAddress' }))
      },
      tokens: {
        getTokenContractInfo: jest.fn(async () => ({
          dataContractId: { base58: () => CONTRACT_ID },
          tokenContractPosition: CONTRACT_POSITION
        }))
      },
      identities: {
        getIdentityByIdentifier: jest.fn(async () => ({ getPublicKeyById: jest.fn(() => ({ bytes: () => new Uint8Array([4]) })) })),
        getIdentityContractNonce: jest.fn(async () => 4n)
      },
      shielded: { getShieldedBuilder: jest.fn(async () => builder) },
      stateTransitions: {
        broadcast: jest.fn(async () => {}),
        waitForStateTransitionResult: jest.fn(async () => {})
      }
    }

    shielded = new ShieldedService({} as any, sdk)
    jest.spyOn(shielded, 'deriveSeed').mockReturnValue(new Uint8Array([1, 2, 3]))
    jest.spyOn(shielded, 'prepareTokenSpend').mockResolvedValue({
      spends: [],
      nullifiers: [new Uint8Array([7])],
      anchor: new Uint8Array([9]),
      changeAddress: {} as any,
      coinType: 1
    })
    jest.spyOn(shielded, 'confirmSpend').mockResolvedValue(undefined)
  })

  describe('the balance of one token pool', () => {
    const handle = async (payload: any = { tokenId: TOKEN_ID, password: 'test' }): Promise<any> =>
      await new GetShieldedTokenBalanceHandler(walletRepository, sdk, shielded).handle(event('GET_SHIELDED_TOKEN_BALANCE', payload))

    it('reads the notes of that token, not the credit pool', async () => {
      const poolBalance = jest.spyOn(shielded, 'tokenPoolBalance').mockResolvedValue({ balance: 250n, spendableNotes: 2 })

      const response = await handle()

      expect(poolBalance).toHaveBeenCalledWith(expect.any(Uint8Array), 'testnet', 0, TOKEN_ID)
      expect(response).toEqual({ tokenId: TOKEN_ID, balance: '250', spendableNotes: 2 })
    })

    it('refuses a wallet with no seed to read notes with', async () => {
      walletRepository.getCurrent.mockResolvedValue({ walletId: 'wallet1', type: 'keystore', network: 'testnet' })

      await expect(handle()).rejects.toThrow('seedphrase wallet')
    })

    it('requires the password, which is what derives the viewing key', () => {
      const handler = new GetShieldedTokenBalanceHandler(walletRepository, sdk, shielded)

      expect(handler.validatePayload({ tokenId: TOKEN_ID, password: '' })).toMatch(/Password/)
      expect(handler.validatePayload({ tokenId: TOKEN_ID, password: 'test' })).toBeNull()
    })
  })

  describe('shielding tokens', () => {
    const handle = async (payload: any = signedPayload): Promise<any> =>
      await new ShieldTokenHandler(walletRepository, identitiesRepository, keypairRepository, sdk, shielded)
        .handle(event('SHIELD_TOKEN', payload))

    it('binds the action to the pool the token belongs to', async () => {
      await handle()

      expect(sdk.tokens.getTokenContractInfo).toHaveBeenCalledWith(TOKEN_ID)
      expect(sdk.identities.getIdentityContractNonce).toHaveBeenCalledWith(IDENTITY, CONTRACT_ID)

      const [, , , position, , amount] = builder.tokenShield.mock.calls[0]

      expect(position).toBe(CONTRACT_POSITION)
      expect(amount).toBe(10n)
    })

    it('carries the next nonce, not the one Platform reports', async () => {
      await handle()

      const call = builder.tokenShield.mock.calls[0]

      expect(call[call.length - 2]).toBe(5n)
    })

    it('shields to this wallet when no address is named', async () => {
      const response = await handle()

      expect(sdk.keyPair.deriveShieldedAddress).toHaveBeenCalled()
      expect(response.toShieldedAddress).toBe('ourOwnShieldedAddress')
    })

    it('shields to the address it is given', async () => {
      const response = await handle({ ...signedPayload, toShieldedAddress: TO_ADDRESS })

      expect(response.toShieldedAddress).toBe(TO_ADDRESS)
    })

    it('waits for the result instead of confirming a spend, having spent no note', async () => {
      await handle()

      expect(sdk.stateTransitions.broadcast).toHaveBeenCalled()
      expect(sdk.stateTransitions.waitForStateTransitionResult).toHaveBeenCalled()
      expect(shielded.confirmSpend).not.toHaveBeenCalled()
    })

    it('refuses an identity the wallet does not hold', async () => {
      identitiesRepository.getByIdentifier.mockResolvedValue(null)

      await expect(handle()).rejects.toThrow('not found')
    })

    it('refuses a key the identity does not have', async () => {
      sdk.identities.getIdentityByIdentifier.mockResolvedValue({ getPublicKeyById: jest.fn(() => null) })

      await expect(handle()).rejects.toThrow('no public key with id 1')
    })
  })

  describe('transferring tokens inside the pool', () => {
    const handle = async (payload: any = { ...signedPayload, toShieldedAddress: TO_ADDRESS }): Promise<any> =>
      await new SendShieldedTokenTransferHandler(walletRepository, identitiesRepository, keypairRepository, sdk, shielded)
        .handle(event('SEND_SHIELDED_TOKEN_TRANSFER', payload))

    it('spends notes of that token pool and confirms them afterwards', async () => {
      const response = await handle()

      expect(shielded.prepareTokenSpend).toHaveBeenCalledWith(expect.any(Uint8Array), 'testnet', 0, 10n, TOKEN_ID, undefined)
      expect(builder.tokenShieldedTransfer).toHaveBeenCalled()
      expect(shielded.confirmSpend).toHaveBeenCalledWith(expect.anything(), [new Uint8Array([7])])
      expect(response).toEqual({ stHash: 'stHash', tokenId: TOKEN_ID, amount: '10', toShieldedAddress: TO_ADDRESS })
    })

    it('narrows the spend to the source addresses it is given', async () => {
      await handle({ ...signedPayload, toShieldedAddress: TO_ADDRESS, fromAddresses: ['orchardSource0'] })

      expect(shielded.prepareTokenSpend).toHaveBeenCalledWith(expect.any(Uint8Array), 'testnet', 0, 10n, TOKEN_ID, ['orchardSource0'])
    })

    it('requires a recipient and a positive amount', () => {
      const handler = new SendShieldedTokenTransferHandler(walletRepository, identitiesRepository, keypairRepository, sdk, shielded)

      expect(handler.validatePayload({ ...signedPayload, toShieldedAddress: '' })).toMatch(/Recipient/)
      expect(handler.validatePayload({ ...signedPayload, toShieldedAddress: TO_ADDRESS, amount: '0' })).toMatch(/positive integer/)
      expect(handler.validatePayload({ ...signedPayload, toShieldedAddress: TO_ADDRESS })).toBeNull()
    })
  })

  describe('unshielding tokens', () => {
    const handle = async (payload: any = signedPayload): Promise<any> =>
      await new UnshieldTokenHandler(walletRepository, identitiesRepository, keypairRepository, sdk, shielded)
        .handle(event('UNSHIELD_TOKEN', payload))

    it('credits the signing identity when no recipient is named', async () => {
      const response = await handle()

      expect(response.recipientId).toBe(IDENTITY)
      expect(shielded.confirmSpend).toHaveBeenCalled()
    })

    it('credits the identity it is given', async () => {
      const response = await handle({ ...signedPayload, recipientId: OTHER_IDENTITY })

      expect(response.recipientId).toBe(OTHER_IDENTITY)
    })

    it('refuses a recipient identifier it cannot decode', () => {
      sdk.utils.validateIdentifier.mockImplementation((value: string) => value !== 'notAnIdentifier')
      const handler = new UnshieldTokenHandler(walletRepository, identitiesRepository, keypairRepository, sdk, shielded)

      expect(handler.validatePayload({ ...signedPayload, recipientId: 'notAnIdentifier' })).toMatch(/recipient identity/)
    })
  })
})
