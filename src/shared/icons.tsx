import type { JSX } from 'preact'

/**
 * One hairline icon set, 24×24, 1.6 stroke, round joins.
 * Drawn to read at 16px first and 24px second — the sizes actually used.
 */
export type IconName =
  | 'home'
  | 'compass'
  | 'bell'
  | 'mail'
  | 'bookmark'
  | 'user'
  | 'compose'
  | 'settings'
  | 'command'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'search'
  | 'close'
  | 'check'
  | 'arrow-up'
  | 'chevron-down'
  | 'chevron-right'
  | 'more'
  | 'heart'
  | 'repeat'
  | 'message'
  | 'share'
  | 'sparkles'
  | 'filter'
  | 'keyboard'
  | 'eye'
  | 'shield'
  | 'layout'
  | 'sidebar'
  | 'type'
  | 'palette'
  | 'info'
  | 'external'
  | 'copy'
  | 'zap'

const paths: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m14.8 9.2-1.6 4.4-4.4 1.6 1.6-4.4z" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4.2 1.3 5.5 1.3 5.5H5.2s1.3-1.3 1.3-5.5Z" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 8 7.5 5 7.5-5" />
    </>
  ),
  bookmark: <path d="M7 4.5h10a1 1 0 0 1 1 1v14l-6-4-6 4v-14a1 1 0 0 1 1-1Z" />,
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6" />
    </>
  ),
  compose: (
    <>
      <path d="M20 12.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h6.5" />
      <path d="M15.5 4.6a2.1 2.1 0 0 1 3 3L12 14.2l-4 1 1-4z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.1" />
      <circle cx="9" cy="17" r="2.1" />
    </>
  ),
  command: (
    <path d="M9 4.8a2.3 2.3 0 1 0 0 4.6h6a2.3 2.3 0 1 0 0-4.6v6a2.3 2.3 0 1 0 4.6 0H9a2.3 2.3 0 1 0-4.6 0V9a2.3 2.3 0 1 0 4.6 0z" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M19 14.4A7.6 7.6 0 0 1 9.6 5a7.8 7.8 0 1 0 9.4 9.4Z" />,
  auto: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" fill-opacity=".18" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  heart: <path d="M12 19.5s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.4a4.1 4.1 0 0 1 7.5 2.7c0 4.8-7.5 9.4-7.5 9.4Z" />,
  repeat: (
    <>
      <path d="M4.5 9.5A4 4 0 0 1 8.5 5.5h9" />
      <path d="m15 3 2.5 2.5L15 8" />
      <path d="M19.5 14.5a4 4 0 0 1-4 4h-9" />
      <path d="m9 21-2.5-2.5L9 16" />
    </>
  ),
  message: <path d="M20 11.8a7.6 7.6 0 0 1-11 6.8L4.5 20l1.4-4.2A7.6 7.6 0 1 1 20 11.8Z" />,
  share: (
    <>
      <path d="M12 15V4.5" />
      <path d="m8 8 4-3.5L16 8" />
      <path d="M5.5 13v5.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V13" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 4.5l1.6 4.2 4.2 1.6-4.2 1.6L12 16l-1.6-4.1L6.2 10.3l4.2-1.6z" />
      <path d="M18 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  filter: <path d="M4.5 6.5h15l-5.6 6.6v5.4l-3.8-1.8v-3.6z" />,
  keyboard: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
      <path d="M6.5 10h.01M9.8 10h.01M13.2 10h.01M16.5 10h.01M8 13.5h8" />
    </>
  ),
  eye: (
    <>
      <path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 4.2 19 7v5.3c0 4-3 6.4-7 7.5-4-1.1-7-3.5-7-7.5V7z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  layout: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>
  ),
  type: <path d="M5 7V5.5h14V7M12 5.5v13M9 18.5h6" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9 0-1.3-1-1.7-1-2.9 0-1 .8-1.8 1.9-1.8h1.9a3.7 3.7 0 0 0 3.7-3.7C20.5 6.2 16.7 3.5 12 3.5Z" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="9.6" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8h.01" />
    </>
  ),
  external: (
    <>
      <path d="M13 4.5h6.5V11" />
      <path d="M19 5 11 13" />
      <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v10.5A1.5 1.5 0 0 0 6.5 19H17a1.5 1.5 0 0 0 1.5-1.5V15" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </>
  ),
  zap: <path d="M13 3.5 5.5 13.5H11l-1 7 8-10h-5.5z" />,
}

export interface IconProps {
  name: IconName
  size?: number
  class?: string
  strokeWidth?: number
}

export function Icon({ name, size = 20, class: className, strokeWidth = 1.6 }: IconProps): JSX.Element {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}

export function MistMark({ size = 30 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M7 21.5c0-6.4 4.6-11.5 10.6-11.5 4.2 0 7.4 2.5 7.4 6.1 0 3.4-2.7 5.9-6.2 5.9h-3.1"
        stroke="currentColor"
        stroke-width="2.1"
        stroke-linecap="round"
      />
      <path d="M11.5 25.5h7.8" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" opacity=".55" />
    </svg>
  )
}
