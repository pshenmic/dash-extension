import React from 'react'
import { Button, Identifier, ProgressStepBar } from 'dash-ui-kit/react'
import { TitleBlock } from '../../../components/layout/TitleBlock'
import { IdentityPreview } from '../../../components/Identities'
import type { IdentityPreviewData } from '../../../types'

interface Stage5SuccessProps {
  stage: number
  identity: IdentityPreviewData | null
  identityId?: string
  onDone: () => void
}

export function Stage5Success ({ stage, identity, identityId, onDone }: Stage5SuccessProps): React.JSX.Element {
  return (
    <div className='flex flex-1 flex-col gap-4'>
      <TitleBlock
        variant='screen'
        title='Identity registered'
        description='Your identity is ready to use on Dash Platform.'
      />

      {identity != null && (
        <IdentityPreview identity={identity} />
      )}
      {identity == null && identityId != null && (
        <Identifier avatar highlight='both' middleEllipsis edgeChars={8}>{identityId}</Identifier>
      )}

      <div className='mt-auto flex flex-col gap-3'>
        <Button
          colorScheme='brand'
          className='w-full'
          onClick={onDone}
        >
          Done
        </Button>
        <ProgressStepBar totalSteps={5} currentStep={stage} />
      </div>
    </div>
  )
}
