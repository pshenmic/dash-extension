import React from 'react'
import { Button, ProgressStepBar } from 'dash-ui-kit/react'
import { TitleBlock } from '../../../components/layout/TitleBlock'

interface Stage1IntroProps {
  stage: number
  onNext: () => void
}

export function Stage1Intro ({ stage, onNext }: Stage1IntroProps): React.JSX.Element {
  return (
    <div className='flex flex-1 flex-col gap-4'>
      <TitleBlock
        variant='screen'
        title='Identity Registration'
        description='Create an identity on Dash Platform using DASH from your Core wallet.'
      />

      <div className='mt-auto flex flex-col gap-3'>
        <Button
          colorScheme='brand'
          className='w-full'
          onClick={onNext}
        >
          Next
        </Button>
        <ProgressStepBar totalSteps={5} currentStep={stage} />
      </div>
    </div>
  )
}
