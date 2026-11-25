import React from 'react'
import { Button, Input, ProgressStepBar, Text } from 'dash-ui-kit/react'
import { CORE_DASH_DECIMALS, formatDashAmount } from '../../../../utils'
import { Banner, SummaryRow } from '../../../components/cards'
import { RefreshButton } from '../../../components/common'
import { AssetBalanceLabel } from '../../../components/data'
import { PasswordField } from '../../../components/forms'
import { TitleBlock } from '../../../components/layout/TitleBlock'
import { FieldLabel } from '../../../components/typography'

interface StageCorePaymentProps {
  stage: number
  amount: string
  balanceDuffs: bigint | null
  feeDuffs: bigint | null
  assetLockFeeDuffs: bigint | null
  password: string
  error: string | null
  isLoading: boolean
  isFeeLoading: boolean
  isCheckingPassword?: boolean
  canPay: boolean
  onAmountChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onConfirm: () => void
  onFundCore?: () => void
  onContinueLegacy?: () => void
  onRefresh: () => void
}

export function StageCorePayment ({
  stage,
  amount,
  balanceDuffs,
  feeDuffs,
  assetLockFeeDuffs,
  password,
  error,
  isLoading,
  isFeeLoading,
  isCheckingPassword = false,
  canPay,
  onAmountChange,
  onPasswordChange,
  onConfirm,
  onFundCore,
  onContinueLegacy,
  onRefresh
}: StageCorePaymentProps): React.JSX.Element {
  let feeLabel = 'Unavailable'
  if (isFeeLoading) feeLabel = 'Estimating…'
  else if (feeDuffs != null) feeLabel = `~${formatDashAmount(feeDuffs, CORE_DASH_DECIMALS)} Dash`

  return (
    <form
      className='flex flex-1 flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault()
        if (canPay && !isLoading && !isCheckingPassword && onFundCore == null) onConfirm()
      }}
    >
      <TitleBlock
        variant='screen'
        title='Pay from Core'
        description='Use Dash from your wallet to register an identity and fund its starting balance.'
      />

      <div className='flex flex-col gap-2'>
        <FieldLabel>Amount (Dash)</FieldLabel>
        <Input
          aria-label='Amount (Dash)'
          inputMode='decimal'
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
          size='xl'
          variant='outlined'
          disabled={isCheckingPassword}
        />
        <div className='flex items-center gap-2' aria-live='polite'>
          {balanceDuffs == null
            ? <Text size='xs' dim>{isLoading ? 'Checking Core balance…' : 'Core balance unavailable'}</Text>
            : <AssetBalanceLabel balance={formatDashAmount(balanceDuffs, CORE_DASH_DECIMALS)} unit='Dash' />}
          <RefreshButton label='Refresh Core balance' loading={isLoading} onClick={onRefresh} />
        </div>
      </div>

      <div className='flex flex-col gap-2'>
        <SummaryRow label='Core transaction fee' value={feeLabel} />
        {assetLockFeeDuffs != null && (
          <SummaryRow
            label='Asset lock fee (included)'
            value={`${formatDashAmount(assetLockFeeDuffs, CORE_DASH_DECIMALS)} Dash`}
          />
        )}
      </div>

      {onFundCore == null && (
        <fieldset disabled={isCheckingPassword} className='min-w-0'>
          <PasswordField value={password} onChange={onPasswordChange} variant='outlined' />
        </fieldset>
      )}
      {error != null && <div role='alert'><Banner variant='error' message={error} /></div>}

      <div className='mt-auto flex flex-col gap-3'>
        {onFundCore != null && error == null && (
          <Banner variant='info' message='Add Dash to your Core balance to cover the amount and transaction fee.' />
        )}
        {onFundCore == null
          ? (
            <Button type='submit' colorScheme='brand' size='xl' className='w-full' disabled={isLoading || isCheckingPassword || !canPay}>
              {isCheckingPassword ? 'Checking password…' : 'Pay from Core'}
            </Button>
            )
          : (
            <Button type='button' colorScheme='brand' size='xl' className='w-full' disabled={isCheckingPassword} onClick={onFundCore}>
              Receive Dash
            </Button>
            )}
        {onContinueLegacy != null && (
          <Button type='button' colorScheme='lightBlue' className='w-full' disabled={isCheckingPassword} onClick={onContinueLegacy}>
            Continue an earlier payment
          </Button>
        )}
        <ProgressStepBar totalSteps={5} currentStep={stage} />
      </div>
    </form>
  )
}
