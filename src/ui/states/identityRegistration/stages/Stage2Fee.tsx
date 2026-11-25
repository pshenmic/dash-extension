import React from 'react'
import { Button, Input, Text, ProgressStepBar } from 'dash-ui-kit/react'
import { TitleBlock } from '../../../components/layout/TitleBlock'
import { FieldLabel } from '../../../components/typography'

interface Stage2FeeProps {
  stage: number
  coinImage: string | undefined
  password: string
  passwordError: string | null
  isCheckingPassword?: boolean
  onPasswordChange: (value: string) => void
  onProceedToPayment: () => void
}

export function Stage2Fee ({
  stage,
  coinImage,
  password,
  passwordError,
  isCheckingPassword = false,
  onPasswordChange,
  onProceedToPayment
}: Stage2FeeProps): React.JSX.Element {
  const canContinue = !isCheckingPassword && password.trim() !== ''

  return (
    <form
      className='flex flex-1 flex-col gap-4'
      onSubmit={(event) => {
        event.preventDefault()
        if (canContinue) onProceedToPayment()
      }}
    >
      <TitleBlock
        variant='screen'
        title='Continue Registration'
        description='Unlock your wallet to continue using the Dash you previously sent.'
      />

      <div className='flex-1 flex items-center justify-center relative'>
        <div className='w-[200px] h-[200px]'>
          <img src={coinImage} alt='Dash coin' className='w-full h-full object-contain' />
        </div>
        <div className='absolute top-[10px] right-[24px] w-[100px] h-[100px] rotate-34'>
          <img src={coinImage} alt='Dash coin' className='w-full h-full object-contain' />
        </div>
        <div className='absolute bottom-[34px] left-[24px] w-[100px] h-[100px] -rotate-31'>
          <img src={coinImage} alt='Dash coin' className='w-full h-full object-contain' />
        </div>
      </div>

      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <FieldLabel>Password</FieldLabel>
          <Input
            type='password'
            placeholder='Enter your wallet password'
            value={password}
            disabled={isCheckingPassword}
            onChange={(e) => {
              onPasswordChange(e.target.value)
            }}
            error={passwordError != null}
          />
          {passwordError != null && (
            <Text size='sm' className='text-red-500'>{passwordError}</Text>
          )}
        </div>
        <Button
          type='submit'
          colorScheme='brand'
          className='w-full'
          disabled={!canContinue}
        >
          {isCheckingPassword ? 'Checking password…' : 'Continue'}
        </Button>
        <ProgressStepBar totalSteps={5} currentStep={stage} />
      </div>
    </form>
  )
}
