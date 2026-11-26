import React from 'react'
import { Button, ProgressStepBar, Text } from 'dash-ui-kit/react'
import { Banner } from '../../../components/cards'
import { TitleBlock } from '../../../components/layout/TitleBlock'
import { ReceiveCard } from '../../receive/ReceiveCard'

interface StageFundCoreProps {
  stage: number
  address: string | null
  isLoading: boolean
  error: string | null
  onContinue: () => void
  onRetry: () => void
}

export function StageFundCore ({ stage, address, isLoading, error, onContinue, onRetry }: StageFundCoreProps): React.JSX.Element {
  return (
    <div className='flex flex-1 flex-col gap-3'>
      <TitleBlock
        variant='screen'
        title='Receive Dash on Core'
        description='Send Dash to this wallet’s Core address. Once the deposit arrives, return to pay for registration from your Core balance.'
      />

      {address != null && (
        <ReceiveCard compact target={{ type: 'core', value: address, layer: 'Core', unit: 'Dash', balance: null, explorerUrl: null }} />
      )}
      {isLoading && <Text size='sm' dim role='status'>Loading Core address…</Text>}
      {error != null && <div role='alert'><Banner variant='error' message={error} /></div>}

      <div className='mt-auto flex flex-col gap-2'>
        {error != null && address == null
          ? <Button colorScheme='brand' size='xl' className='w-full' onClick={onRetry} disabled={isLoading}>Retry</Button>
          : (
            <Button colorScheme='brand' size='xl' className='w-full' disabled={isLoading || address == null} onClick={onContinue}>
              Check Core balance
            </Button>
            )}
        <ProgressStepBar totalSteps={5} currentStep={stage} />
      </div>
    </div>
  )
}
