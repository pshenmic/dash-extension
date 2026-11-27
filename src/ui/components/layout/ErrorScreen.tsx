import React from 'react'
import { Button, ProgressStepBar } from 'dash-ui-kit/react'
import { TitleBlock } from '../layout/TitleBlock'

interface ErrorScreenProps {
  title: React.ReactNode
  titleVariant?: 'default' | 'screen'
  error: string | null
  defaultError?: string
  totalSteps: number
  currentStep: number
  actionText?: string
  onReturnBack: () => void
}

export function ErrorScreen ({
  title,
  titleVariant = 'default',
  error,
  defaultError = 'An unexpected error occurred.',
  totalSteps,
  currentStep,
  actionText = 'Return Back',
  onReturnBack
}: ErrorScreenProps): React.JSX.Element {
  return (
    <div className={`flex flex-col ${titleVariant === 'screen' ? 'flex-1 gap-4' : 'h-full pt-[90px]'}`}>
      <TitleBlock
        variant={titleVariant}
        title={title}
        description={error ?? defaultError}
        containerClassName='!mb-0'
      />

      <div className='flex-1' />

      <div className='flex flex-col gap-4'>
        <Button
          colorScheme='lightBlue'
          className='w-full'
          onClick={onReturnBack}
        >
          {actionText}
        </Button>
        <ProgressStepBar
          totalSteps={totalSteps}
          currentStep={currentStep}
          color='red'
        />
      </div>
    </div>
  )
}
