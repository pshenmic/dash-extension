import React from 'react'
import { Button, CopyButton, Identifier, Input, ProgressStepBar } from 'dash-ui-kit/react'
import { TXID_PATTERN } from '../../../../constants'
import { Banner, SummaryRow } from '../../../components/cards'
import { TitleBlock } from '../../../components/layout/TitleBlock'
import { FieldLabel } from '../../../components/typography'

interface Stage3PaymentProps {
  stage: number
  fundingAddress: string
  transactionHash: string
  error?: string | null
  isCheckingPassword?: boolean
  onTransactionHashChange: (value: string) => void
  onConfirmPayment: () => void
}

export function Stage3Payment ({ stage, fundingAddress, transactionHash, error, isCheckingPassword = false, onTransactionHashChange, onConfirmPayment }: Stage3PaymentProps): React.JSX.Element {
  const canConfirm = !isCheckingPassword && TXID_PATTERN.test(transactionHash.trim())

  return (
    <form
      className='flex flex-1 flex-col gap-4'
      onSubmit={e => {
        e.preventDefault()
        if (canConfirm) onConfirmPayment()
      }}
    >
      <TitleBlock
        variant='screen'
        title='Find your earlier payment'
        description='Enter the transaction ID for the transfer you already made to this address.'
      />

      <SummaryRow
        label='Paid to'
        value={
          <>
            <Identifier highlight='both' className='min-w-0'>{fundingAddress}</Identifier>
            <CopyButton text={fundingAddress} aria-label='Copy previous payment address' />
          </>
        }
      />

      <div className='flex flex-col gap-2'>
        <FieldLabel>Transaction ID</FieldLabel>
        <Input
          aria-label='Transaction ID'
          placeholder='64-character transaction ID'
          value={transactionHash}
          disabled={isCheckingPassword}
          onChange={(event) => onTransactionHashChange(event.target.value)}
          size='xl'
          variant='outlined'
        />
      </div>
      {error != null && <div role='alert'><Banner variant='error' message={error} /></div>}

      <div className='mt-auto flex flex-col gap-3'>
        <Button type='submit' colorScheme='brand' size='xl' className='w-full' disabled={!canConfirm}>
          {isCheckingPassword ? 'Checking password…' : 'Confirm Payment'}
        </Button>
        <ProgressStepBar totalSteps={5} currentStep={stage} />
      </div>
    </form>
  )
}
