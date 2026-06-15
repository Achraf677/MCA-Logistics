import { useState, useEffect, useCallback } from 'react'
import { LayoutTemplate } from 'lucide-react'
import { Shell }       from '../../app/Shell'
import { Button }      from '../../shared/ui/Button'
import { EmptyState }  from '../../shared/ui/EmptyState'
import { SkeletonTable } from '../../shared/ui/Skeleton'
import { useToast }    from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
import { listTemplates } from './modeles.queries'
import { tripSummary, ttcFromHt } from './modeles.logic'
import { DrawerModele } from './DrawerModele'
import type { DeliveryTemplate } from './modeles.types'
import type { ActionKey } from '../../shared/actions/ActionBar'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ttcOf(t: DeliveryTemplate): number | null {
  if (t.amount_ht_cts == null) return null
  return ttcFromHt(t.amount_ht_cts, t.tva_rate ?? 20)
}

// ── Composant principal ────────────────────────────────────────────────────────

export function Modeles() {
  const { toast } = useToast()

  const [templates, setTemplates]   = useState<DeliveryTemplate[]>([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selected, setSelected]     = useState<DeliveryTemplate | null>(null)

  // ── Chargement ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const { data, error } = await listTemplates()
    if (error) {
      setLoadError((error as { message?: string }).message ?? 'Erreur de chargement')
      toast('Erreur de chargement des modèles', 'error')
    } else {
      setTemplates(data ?? [])
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNew = () => {
    setSelected(null)
    setDrawerOpen(true)
  }

  const openEdit = (t: DeliveryTemplate) => {
    setSelected(t)
    setDrawerOpen(true)
  }

  const handleSaved = () => load()

  const handleAction = (key: ActionKey) => {
    if (key === 'nouveau') openNew()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Shell pageTitle="Modèles" actions={['nouveau']} onAction={handleAction}>
      <div className="flex flex-col gap-5">

        {loading ? (
          <SkeletonTable />
        ) : loadError ? (
          <p className="text-[var(--danger)] text-[var(--fs-sm)]">{loadError}</p>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate size={40} />}
            title="Aucun modèle"
            description="Créez un modèle de course récurrent pour gagner du temps."
          />
        ) : (
          <>
            {/* Table (desktop) */}
            <div className="hidden md:block overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
              <table className="w-full text-[var(--fs-sm)]">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                    {['Libellé', 'Client', 'Trajet', 'TTC', ''].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-medium text-[var(--text-muted)] text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {templates.map(t => {
                    const trip = tripSummary(t.pickup_address, t.delivery_address)
                    const ttc = ttcOf(t)
                    return (
                      <tr key={t.id}
                        className="hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                        onClick={() => openEdit(t)}>
                        <td className="px-4 py-3 font-medium text-[var(--text)] whitespace-nowrap">
                          {t.label}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                          {t.clients?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] max-w-xs truncate">
                          {trip ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-mono font-medium whitespace-nowrap">
                          {ttc != null ? formatMoney(ttc) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Button size="compact" variant="secondary"
                            onClick={e => { e.stopPropagation(); openEdit(t) }}>
                            Ouvrir
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cartes (mobile) */}
            <div className="flex flex-col gap-3 md:hidden">
              {templates.map(t => {
                const trip = tripSummary(t.pickup_address, t.delivery_address)
                const ttc = ttcOf(t)
                return (
                  <div key={t.id}
                    className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-2 cursor-pointer hover:border-[var(--brand)]/40 transition-colors"
                    onClick={() => openEdit(t)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text)]">{t.label}</span>
                      <span className="font-mono font-semibold text-[var(--text)] shrink-0">
                        {ttc != null ? formatMoney(ttc) : '—'}
                      </span>
                    </div>
                    <p className="text-[var(--fs-sm)] text-[var(--text-muted)] truncate">
                      {t.clients?.name ?? '—'}
                    </p>
                    {trip && (
                      <p className="text-[var(--fs-xs)] text-[var(--text-muted)] truncate">
                        {trip}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <DrawerModele
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        template={selected}
        onSaved={handleSaved}
      />
    </Shell>
  )
}
