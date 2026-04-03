interface BadgeProps {
  label: string
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export function Badge({ label, variant = 'default' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{label}</span>
}

export function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    pending:     { label: '待生產', variant: 'default' },
    in_progress: { label: '進行中', variant: 'info' },
    completed:   { label: '已完工', variant: 'success' },
    cancelled:   { label: '已取消', variant: 'danger' },
    split:       { label: '已拆分', variant: 'warning' },
  }
  const cfg = map[status] ?? { label: status, variant: 'default' }
  return <Badge label={cfg.label} variant={cfg.variant} />
}
