/** Decorative grid glyph for the sidebar panel row (no host primitive deps). */
export function PanelIcon({ size, className }: { size?: number, className?: string } = {}) {
  const edge = size ?? 16
  return (
    <svg width={edge} height={edge} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <rect x="6" y="8" width="36" height="32" rx="4" fill="currentColor" opacity="0.9" />
      <rect x="6" y="16" width="36" height="3" fill="var(--dsw-alias-surface-default, #fff)" opacity="0.9" />
      <rect x="17" y="16" width="3" height="24" fill="var(--dsw-alias-surface-default, #fff)" opacity="0.6" />
      <rect x="28" y="16" width="3" height="24" fill="var(--dsw-alias-surface-default, #fff)" opacity="0.6" />
      <rect x="6" y="27" width="36" height="3" fill="var(--dsw-alias-surface-default, #fff)" opacity="0.9" />
    </svg>
  )
}
