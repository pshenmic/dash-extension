import React from 'react'
import { ProcessingScreen } from '../../../components/layout/screens/ProcessingScreen'

interface Stage4ProcessingProps {
  stage: number
  isRegistering: boolean
}

export function Stage4Processing ({ stage, isRegistering }: Stage4ProcessingProps): React.JSX.Element {
  return (
    <ProcessingScreen
      stage={stage}
      totalSteps={5}
      titleVariant='screen'
      title='Registering your identity…'
      description={
        isRegistering
          ? 'Keep this window open while the payment and identity registration are processed.'
          : 'Preparing your registration.'
      }
    />
  )
}
