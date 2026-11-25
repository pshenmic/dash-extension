import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Navigate, useNavigate, useSearchParams, useOutletContext } from 'react-router-dom'
import { MIN_FEE_RELAY, MIN_REGISTRATION_DUFFS, TXID_PATTERN } from '../../../constants'
import { CORE_DASH_DECIMALS, formatDashAmount, isDashInputAllowed, parseDashAmount } from '../../../utils'
import type { EstimateCoreTransferResponse } from '../../../types/messages/response/EstimateCoreTransferResponse'
import type { PendingAssetLock } from '../../../types/messages/response/ListPendingAssetLocksResponse'
import { useAsyncState, useCoreBalance, useSdk, useExtensionAPI, useStaticAsset } from '../../hooks'
import type { LayoutContext } from '../../components/layout/Layout'
import type { IdentityPreviewData } from '../../types'
import { RegistrationError } from './stages/RegistrationError'
import { Stage1Intro } from './stages/Stage1Intro'
import { Stage2Fee } from './stages/Stage2Fee'
import { Stage3Payment } from './stages/Stage3Payment'
import { Stage4Processing } from './stages/Stage4Processing'
import { Stage5Success } from './stages/Stage5Success'
import { StageCorePayment } from './stages/StageCorePayment'
import { StageFundCore } from './stages/StageFundCore'

type Stage = 1 | 2 | 3 | 4 | 5
type Registration = { status: 'processing' } | { status: 'failed', error: string } | { status: 'succeeded', identifier: string }

interface RegistrationPayments {
  pending: PendingAssetLock | null
  legacyAddress: string | null
}

const DEFAULT_AMOUNT = formatDashAmount(MIN_REGISTRATION_DUFFS, CORE_DASH_DECIMALS)

interface RegistrationQuote {
  key: string
  estimate: EstimateCoreTransferResponse | null
  error: string | null
}

function IdentityRegistrationState (): React.JSX.Element {
  const context = useOutletContext<LayoutContext>()
  return <IdentityRegistrationFlow key={`${context.currentNetwork}:${context.currentWallet ?? ''}`} context={context} />
}

function IdentityRegistrationFlow ({ context }: { context: LayoutContext }): React.JSX.Element {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { currentWallet, currentNetwork, reloadIdentities, setCurrentIdentity, setHeaderConfigOverride } = context
  const extensionAPI = useExtensionAPI()
  const sdk = useSdk()

  const [amount, setAmount] = useState(DEFAULT_AMOUNT)
  const [password, setPassword] = useState('')
  const [transactionHash, setTransactionHash] = useState('')
  const [isCheckingPassword, setIsCheckingPassword] = useState(false)
  const [registration, setRegistration] = useState<Registration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [registeredIdentity, setRegisteredIdentity] = useState<IdentityPreviewData | null>(null)
  const submitting = useRef(false)
  const active = useRef(false)

  const rawStage = parseInt(searchParams.get('stage') ?? '1', 10)
  const routeStage = (rawStage >= 1 && rawStage <= 5 ? rawStage : 1) as Stage
  const stage = registration == null ? routeStage : registration.status === 'succeeded' ? 5 : 4
  const hasError = registration?.status === 'failed' || searchParams.get('error') === 'true'
  const isLegacyRoute = searchParams.get('legacy') === 'true'
  const isPaymentStage = stage === 2 || stage === 3
  const stageUrl = (number: Stage, legacy = false): string =>
    `/register-identity?stage=${number}${legacy ? '&legacy=true' : ''}`

  const coinImage = useStaticAsset('coin.png')
  const [payments, loadPayments] = useAsyncState<RegistrationPayments>(null, { initialLoading: true })
  const pending = payments.data?.pending ?? null
  const legacyAddress = payments.data?.legacyAddress ?? null
  const continuing = pending != null
  const useLegacyPayment = legacyAddress != null && (
    isLegacyRoute || (pending != null && (pending.fundingAddress == null || pending.fundingTxid == null))
  )
  const checkCore = isPaymentStage && !payments.loading && !useLegacyPayment && !continuing && currentWallet != null
  const { balance, loading: balanceLoading, error: balanceError, reload: reloadBalance } = useCoreBalance(currentWallet, checkCore)
  const [receiveAddress, loadReceiveAddress] = useAsyncState<string>()
  const [fee, loadFee] = useAsyncState<RegistrationQuote>()
  const [feeRevision, setFeeRevision] = useState(0)

  const amountDuffs = parseDashAmount(amount, CORE_DASH_DECIMALS)
  const balanceDuffs = balance == null ? null : BigInt(balance.balance)
  const validAmount = amountDuffs != null && amountDuffs >= MIN_REGISTRATION_DUFFS
  const quoteKey = checkCore && stage === 2 && validAmount && receiveAddress.data != null &&
    balanceDuffs != null && amountDuffs < balanceDuffs
    ? `${amountDuffs}:${receiveAddress.data}:${balanceDuffs}:${feeRevision}`
    : null
  const quote = fee.data?.key === quoteKey ? fee.data : null
  const estimate = quote?.estimate ?? null
  const insufficient = (balanceDuffs != null && amountDuffs != null && amountDuffs >= balanceDuffs) ||
    (estimate != null && balanceDuffs != null && BigInt(estimate.totalCostDuffs) > balanceDuffs) ||
    quote?.error?.includes('Insufficient funds:') === true ||
    quote?.error?.includes('This wallet has no unspent Core outputs to spend') === true
  const isFeeLoading = quoteKey != null && quote == null
  const amountError = amountDuffs != null && !validAmount
    ? `Minimum amount is ${DEFAULT_AMOUNT} Dash.`
    : null
  const paymentError = error ?? payments.error ?? balanceError ?? receiveAddress.error ?? amountError ?? (
    insufficient ? null : quote?.error ?? null
  )

  const refreshPayments = useCallback((): void => {
    if (currentWallet == null) return

    void loadPayments(async () => {
      const [locks, addresses] = await Promise.all([
        extensionAPI.listPendingAssetLocks(),
        extensionAPI.listAssetLockFundingAddresses(false, currentWallet, currentNetwork)
      ])
      const unfinished = locks.find(lock => lock.purpose === 'registration') ?? null
      const legacy = addresses.find(entry =>
        entry.purpose === 'registration' && entry.state !== 'spent' && entry.hasKey
      )
      return { pending: unfinished, legacyAddress: unfinished?.fundingAddress ?? legacy?.address ?? null }
    })
  }, [currentWallet, currentNetwork, extensionAPI, loadPayments])

  const refreshAddress = useCallback((): void => {
    void loadReceiveAddress(async () => (await extensionAPI.getCoreReceiveAddress()).address)
  }, [extensionAPI, loadReceiveAddress])

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    if (isPaymentStage) refreshPayments()
  }, [isPaymentStage, refreshPayments])

  useEffect(() => {
    if (checkCore) refreshAddress()
  }, [checkCore, refreshAddress])

  useEffect(() => {
    if (quoteKey == null || receiveAddress.data == null || amountDuffs == null) return

    const address = receiveAddress.data
    const timer = setTimeout(() => {
      void loadFee(async () => await extensionAPI.estimateCoreTransfer({
        type: 'assetLock',
        outputs: [{ address, amountDuffs: amountDuffs.toString() }]
      }).then(
        estimate => ({ key: quoteKey, estimate, error: null }),
        (e: unknown) => ({ key: quoteKey, estimate: null, error: e instanceof Error ? e.message : 'Failed to estimate the fee.' })
      ))
    }, 350)
    return () => clearTimeout(timer)
  }, [quoteKey, receiveAddress.data, amountDuffs, extensionAPI, loadFee])

  useEffect(() => {
    if (hasError) return

    if (stage === 1) {
      setHeaderConfigOverride({
        imageType: 'app',
        imageClasses: '!w-[min(100vw,26.25rem)] opacity-75',
        containerClasses: 'pointer-events-none absolute -right-24 -top-22'
      })
    } else if (stage === 4 || stage === 5) {
      setHeaderConfigOverride({ hideLeftSection: true })
    } else {
      return
    }
    return () => { setHeaderConfigOverride(null) }
  }, [stage, hasError, setHeaderConfigOverride])

  const refreshCore = (): void => {
    setError(null)
    refreshAddress()
    reloadBalance()
    setFeeRevision(revision => revision + 1)
  }

  const runRegistration = async (register: () => Promise<{ identifier: string }>): Promise<void> => {
    if (!active.current) return
    setRegistration({ status: 'processing' })
    setError(null)
    setRegisteredIdentity(null)
    void navigate(stageUrl(4, useLegacyPayment), { replace: true })

    const created = await register().catch((e: unknown) => {
      if (active.current) {
        setRegistration({ status: 'failed', error: e instanceof Error ? e.message : 'Registration failed' })
      }
      return null
    })

    if (!active.current || created == null) return

    const id = created.identifier
    setRegistration({ status: 'succeeded', identifier: id })
    setPassword('')

    void extensionAPI.getStatus()
      .then(async status => {
        if (status.currentWalletId !== currentWallet || status.network !== currentNetwork) return
        await setCurrentIdentity(id)
        await reloadIdentities(currentWallet)
      })
      .catch(console.error)

    void Promise.all([
      sdk.identities.getIdentityBalance(id),
      sdk.identities.getIdentityPublicKeys(id)
    ]).then(([identityBalance, keys]) => {
      if (!active.current) return
      setRegisteredIdentity({
        id,
        balance: identityBalance.toString(),
        publicKeys: keys.map(key => ({
          keyId: key.keyId,
          purpose: key.purpose,
          securityLevel: key.securityLevel,
          type: key.keyType,
          isAvailable: key.disabledAt == null
        }))
      })
    }).catch(console.error)
  }

  const confirmWithPassword = async (confirm: () => void | Promise<void>): Promise<void> => {
    if (submitting.current || payments.loading || payments.error != null) return
    if (password.trim() === '') {
      setError('Enter your wallet password.')
      return
    }

    submitting.current = true
    setIsCheckingPassword(true)
    setError(null)

    try {
      const result = await extensionAPI.checkPassword(password)
      if (!active.current) return
      if (!result.success) {
        setError('Invalid password')
        return
      }

      await navigator.locks.request(`register-identity:${currentNetwork}:${currentWallet ?? ''}`, { ifAvailable: true }, async lock => {
        if (!active.current) return
        if (lock == null) {
          setError('A registration is already in progress for this wallet.')
          return
        }

        const status = await extensionAPI.getStatus()
        if (!active.current) return
        if (status.currentWalletId !== currentWallet || status.network !== currentNetwork) {
          setError('The active wallet or network changed. Reopen identity registration to continue.')
          return
        }

        await confirm()
      })
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : 'Unable to continue registration.')
    } finally {
      submitting.current = false
      if (active.current) setIsCheckingPassword(false)
    }
  }

  const handleContinue = (): void => {
    if (useLegacyPayment && legacyAddress != null) {
      void confirmWithPassword(() => { void navigate(stageUrl(3, true)) })
      return
    }

    if (pending?.fundingTxid == null || pending.fundingAddress == null) return

    const { fundingAddress, fundingTxid } = pending
    void confirmWithPassword(async () => {
      if (pending.stage === 'assetLocked') {
        await runRegistration(async () => await extensionAPI.registerIdentity(fundingAddress, fundingTxid, password))
        return
      }

      const locks = await extensionAPI.listPendingAssetLocks()
      if (!locks.some(lock => lock.purpose === 'registration' && lock.fundingTxid === fundingTxid && lock.fundingAddress === fundingAddress)) {
        refreshPayments()
        setError('The pending registration changed. Check the payment details and try again.')
        return
      }

      const pendingAmount = pending.amountDuffs != null ? BigInt(pending.amountDuffs) : 0n
      // The API validates the amount before finding and resuming the recorded payment.
      const resumeAmount = pendingAmount > MIN_FEE_RELAY ? pendingAmount : MIN_FEE_RELAY + 1n
      await runRegistration(async () => await extensionAPI.registerIdentityFromWallet(resumeAmount.toString(), password))
    })
  }

  const handleCorePayment = (): void => {
    if (estimate == null || amountDuffs == null || insufficient) return

    void confirmWithPassword(async () => {
      const locks = await extensionAPI.listPendingAssetLocks()
      if (locks.some(lock => lock.purpose === 'registration')) {
        refreshPayments()
        return
      }

      await runRegistration(async () => await extensionAPI.registerIdentityFromWallet(amountDuffs.toString(), password))
    })
  }

  const handleLegacyPayment = (): void => {
    const txid = transactionHash.trim()
    if (legacyAddress == null || !TXID_PATTERN.test(txid)) return

    void confirmWithPassword(async () => await runRegistration(
      async () => await extensionAPI.registerIdentity(legacyAddress, txid, password)
    ))
  }

  const handleReturnBack = (): void => {
    setError(null)
    setRegistration(null)
    void navigate(stageUrl(2, useLegacyPayment), { replace: true })
  }

  const handlePasswordChange = (value: string): void => {
    setPassword(value)
    setError(null)
  }

  if (currentWallet == null && context.walletsLoaded) return <Navigate to='/home' replace />

  if (hasError) {
    return (
      <RegistrationError
        stage={stage}
        registrationError={registration?.status === 'failed' ? registration.error : null}
        onReturnBack={handleReturnBack}
      />
    )
  }

  if (stage === 1) {
    return <Stage1Intro stage={stage} onNext={() => { void navigate(stageUrl(2)) }} />
  }

  if (stage === 2 && (continuing || (useLegacyPayment && legacyAddress != null))) {
    if (legacyAddress == null) {
      return (
        <RegistrationError
          stage={stage}
          registrationError='The address for the pending registration is unavailable.'
          onReturnBack={() => { void navigate('/home') }}
        />
      )
    }

    return (
      <Stage2Fee
        stage={stage}
        coinImage={coinImage}
        password={password}
        passwordError={error}
        isCheckingPassword={isCheckingPassword || payments.loading}
        onPasswordChange={handlePasswordChange}
        onProceedToPayment={handleContinue}
      />
    )
  }

  if (stage === 2) {
    const isLoading = balanceLoading || payments.loading || receiveAddress.loading
    return (
      <StageCorePayment
        stage={stage}
        amount={amount}
        balanceDuffs={balanceDuffs}
        feeDuffs={estimate == null ? null : BigInt(estimate.feeDuffs)}
        assetLockFeeDuffs={estimate == null ? null : BigInt(estimate.assetLockFeeDuffs)}
        password={password}
        error={paymentError}
        isLoading={isLoading}
        isCheckingPassword={isCheckingPassword}
        isFeeLoading={isFeeLoading}
        canPay={!isLoading && payments.error == null && estimate != null && !insufficient}
        onAmountChange={value => {
          if (!isDashInputAllowed(value, CORE_DASH_DECIMALS)) return
          setError(null)
          setAmount(value)
        }}
        onPasswordChange={handlePasswordChange}
        onConfirm={handleCorePayment}
        onFundCore={insufficient && validAmount ? () => { void navigate(stageUrl(3)) } : undefined}
        onContinueLegacy={legacyAddress == null ? undefined : () => { void navigate(stageUrl(2, true)) }}
        onRefresh={() => {
          if (payments.error != null) refreshPayments()
          refreshCore()
        }}
      />
    )
  }

  if (stage === 3 && isLegacyRoute) {
    if (legacyAddress == null || password.trim() === '') return <Navigate to={stageUrl(2, useLegacyPayment)} replace />

    return (
      <Stage3Payment
        stage={stage}
        fundingAddress={legacyAddress}
        transactionHash={transactionHash}
        error={error}
        isCheckingPassword={isCheckingPassword || payments.loading}
        onTransactionHashChange={value => {
          setTransactionHash(value)
          setError(null)
        }}
        onConfirmPayment={handleLegacyPayment}
      />
    )
  }

  if (stage === 3) {
    if (pending != null) return <Navigate to={stageUrl(2)} replace />

    return (
      <StageFundCore
        stage={stage}
        address={receiveAddress.data}
        isLoading={receiveAddress.loading || payments.loading}
        error={payments.error ?? receiveAddress.error}
        onContinue={() => {
          refreshCore()
          void navigate(stageUrl(2), { replace: true })
        }}
        onRetry={payments.error != null ? refreshPayments : refreshAddress}
      />
    )
  }

  if (stage === 4) {
    return registration?.status === 'processing'
      ? <Stage4Processing stage={stage} isRegistering />
      : <Navigate to={stageUrl(2, useLegacyPayment)} replace />
  }

  if (registration?.status !== 'succeeded') return <Navigate to={stageUrl(2)} replace />

  return (
    <Stage5Success
      stage={stage}
      identity={registeredIdentity}
      identityId={registration.identifier}
      onDone={() => { void navigate('/home') }}
    />
  )
}

export default IdentityRegistrationState
