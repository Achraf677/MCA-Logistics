import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
      {icon && <div className="text-[var(--text-disabled)] opacity-40">{icon}</div>}
      <div className="flex flex-col gap-1">
        <p className="font-display font-semibold text-[var(--fs-h3)] text-[var(--text-muted)]">{title}</p>
        {description && <p className="text-[var(--fs-sm)] text-[var(--text-disabled)]">{description}</p>}
      </div>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
