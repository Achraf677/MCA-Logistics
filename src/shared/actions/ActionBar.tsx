import { Download, FileText, Package, Truck, Plus } from 'lucide-react'
import { Button } from '../ui/Button'

export type ActionKey = 'export' | 'facture' | 'bon-livraison' | 'lettre-voiture' | 'nouveau'

interface ActionBarProps {
  actions: ActionKey[]
  onAction?: (key: ActionKey) => void
}

const ACTION_CONFIG: Record<ActionKey, { label: string; icon: React.ElementType }> = {
  'export':          { label: 'Export',            icon: Download  },
  'facture':         { label: 'Facture',            icon: FileText  },
  'bon-livraison':   { label: 'Bon de livraison',   icon: Package   },
  'lettre-voiture':  { label: 'Lettre de voiture',  icon: Truck     },
  'nouveau':         { label: 'Nouveau',             icon: Plus      },
}

export function ActionBar({ actions, onAction }: ActionBarProps) {
  return (
    <div className="flex items-center gap-2">
      {actions.map((key) => {
        const { label, icon: Icon } = ACTION_CONFIG[key]
        const isPrimary = key === 'nouveau'
        return (
          <Button
            key={key}
            variant={isPrimary ? 'primary' : 'secondary'}
            onClick={() => onAction?.(key)}
            aria-label={label}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        )
      })}
    </div>
  )
}
