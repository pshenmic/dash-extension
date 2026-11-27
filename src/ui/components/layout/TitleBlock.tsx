import React from 'react'
import { DashLogo, Text } from 'dash-ui-kit/react'

interface TitleBlockProps {
  title: string | React.ReactNode
  description?: string
  logoSize?: string
  showLogo?: boolean
  centered?: boolean
  titleClassName?: string
  containerClassName?: string
  // The screen variant uses compact spacing and hides the logo by default.
  variant?: 'default' | 'screen'
  // Element shown at the right of the title, e.g. a type chip.
  badge?: React.ReactNode
}

const SCREEN_TITLE_CLASS = 'text-dash-primary-dark-blue !text-[2.125rem] !font-medium !leading-[1.25] tracking-[-0.03em]'

export const TitleBlock: React.FC<TitleBlockProps> = ({
  title,
  description,
  logoSize = '3rem',
  showLogo,
  centered = false,
  titleClassName,
  containerClassName,
  variant = 'default',
  badge
}) => {
  const isScreen = variant === 'screen'
  const logoVisible = showLogo ?? !isScreen
  const baseContainerClass = `flex ${centered ? 'items-center' : ''} flex-col w-full ${isScreen ? 'gap-3' : 'gap-2.5 mb-6'}`

  const containerClass = containerClassName !== null && containerClassName !== undefined && containerClassName !== ''
    ? `${baseContainerClass} ${containerClassName}`
    : baseContainerClass

  const heading = <Text as='h1' className={`${SCREEN_TITLE_CLASS} ${titleClassName ?? ''}`}>{title}</Text>

  return (
    <div className={containerClass}>
      {logoVisible &&
        <DashLogo containerSize={logoSize} />}

      {badge != null
        ? (
          <div className='flex items-center justify-between gap-3 w-full'>
            {heading}
            {badge}
          </div>
          )
        : heading}

      {description !== null && description !== undefined && description !== '' && (
        <div className='!leading-tight break-words'>
          <Text size={isScreen ? 'xs' : 'sm'} weight={isScreen ? 'medium' : undefined} dim>
            {description}
          </Text>
        </div>
      )}
    </div>
  )
}
