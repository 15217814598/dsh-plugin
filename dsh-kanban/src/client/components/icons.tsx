/**
 * Minimal inline SVG icon set (stroke = currentColor) so the board carries no
 * @ant-design/icons dependency. Each takes a pixel size and returns JSX.
 */
import type { ReactNode, ReactElement } from 'react'

function svg(path: ReactNode, size = 14): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: '-2px' }}
    >
      {path}
    </svg>
  )
}

export const IconBack = ({ size }: { size?: number }) => svg(<><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></>, size)
export const IconPlus = ({ size }: { size?: number }) => svg(<><path d="M12 5v14" /><path d="M5 12h14" /></>, size)
export const IconSearch = ({ size }: { size?: number }) => svg(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>, size)
export const IconEdit = ({ size }: { size?: number }) => svg(<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></>, size)
export const IconDelete = ({ size }: { size?: number }) => svg(<><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></>, size)
export const IconCalendar = ({ size }: { size?: number }) => svg(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></>, size)
export const IconUser = ({ size }: { size?: number }) => svg(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>, size)
export const IconProject = ({ size }: { size?: number }) => svg(<><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></>, size)
export const IconComment = ({ size }: { size?: number }) => svg(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>, size)
export const IconClip = ({ size }: { size?: number }) => svg(<><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></>, size)
export const IconFilter = ({ size }: { size?: number }) => svg(<><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></>, size)
export const IconClose = ({ size }: { size?: number }) => svg(<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>, size)
export const IconClear = ({ size }: { size?: number }) => svg(<><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, size)
export const IconLog = ({ size }: { size?: number }) => svg(<><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>, size)
export const IconBolt = ({ size }: { size?: number }) => svg(<><path d="M13 2L3 14h9l-1 8 10-12h-9z" /></>, size)
export const IconCheck = ({ size }: { size?: number }) => svg(<><path d="M20 6L9 17l-5-5" /></>, size)
export const IconFail = ({ size }: { size?: number }) => svg(<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" /></>, size)
export const IconCloud = ({ size }: { size?: number }) => svg(<><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></>, size)
export const IconArchive = ({ size }: { size?: number }) => svg(<><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>, size)
export const IconList = ({ size }: { size?: number }) => svg(<><rect x="3" y="5" width="6" height="6" rx="1" /><path d="M3 17h18" /><path d="M3 12h18" /><path d="M3 7h.01" /><path d="M3 19h.01" /></>, size)
export const IconRefresh = ({ size }: { size?: number }) => svg(<><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>, size)
