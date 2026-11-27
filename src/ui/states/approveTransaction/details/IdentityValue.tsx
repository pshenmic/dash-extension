import React from 'react'
import { Identifier } from 'dash-ui-kit/react'

/** Full identity identifier with avatar and optional balanced wrapping. */
export function IdentityValue ({ identifier, linesAdjustment = false }: { identifier: string, linesAdjustment?: boolean }): React.JSX.Element {
  return (
    <Identifier size='xs' avatar highlight='both' linesAdjustment={linesAdjustment} className='min-w-0 text-left'>{identifier}</Identifier>
  )
}
