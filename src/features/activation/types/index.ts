import type { RefObject } from 'react'

export type HelpSheetSection = 0 | 1 | 2

export interface HelpSheetProps {
  onClose: () => void
  title: string
  initialSection?: HelpSheetSection | null
  returnFocusRef?: RefObject<HTMLElement | null>
}
