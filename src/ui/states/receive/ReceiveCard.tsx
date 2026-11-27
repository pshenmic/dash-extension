import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { CopyButton, ExternalLinkIcon, Identifier, Text } from 'dash-ui-kit/react'
import { IconChip } from '../../components/common'
import type { ReceiveTarget } from './types'

interface ReceiveCardProps {
  target: ReceiveTarget
  compact?: boolean
}

/** QR plus the full address, the two things a sender actually needs. */
export function ReceiveCard ({ target, compact = false }: ReceiveCardProps): React.JSX.Element {
  return (
    <div className={`flex flex-col items-center rounded-[14px] px-[15px] bg-[rgba(12,28,51,0.04)] ${compact ? 'gap-3 py-4' : 'gap-4 py-5'}`}>
      <div className={`rounded-2xl bg-white ${compact ? 'p-3' : 'p-4'}`}>
        <QRCodeSVG
          value={target.value}
          fgColor='#4C7EFF'
          bgColor='transparent'
          size={160}
        />
      </div>

      <div className='flex items-start gap-2 w-full min-w-0'>
        <Identifier highlight='both' className='!leading-[1.2] flex-1'>
          {target.value}
        </Identifier>
        {target.explorerUrl != null && (
          <IconChip label='View in explorer' href={target.explorerUrl}>
            <ExternalLinkIcon size={14} color='#000000' />
          </IconChip>
        )}
        <IconChip label='Copy address'>
          <CopyButton
            text={target.value}
            aria-label='Copy address'
            className='!p-0 !bg-transparent [&_svg]:!size-3.5'
          />
        </IconChip>
      </div>

      <Text size='xs' weight='medium' className='!text-dash-primary-dark-blue/35 !text-center'>
        Scan the code or copy the address to receive {target.unit} here.
      </Text>
    </div>
  )
}
