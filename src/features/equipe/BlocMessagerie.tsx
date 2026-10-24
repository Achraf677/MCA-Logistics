import { useEffect, useMemo, useState } from 'react'
import { Package } from 'lucide-react'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { getClientsActifs } from './equipe.queries'

/**
 * Fiche Équipe › bloc « Messagerie » (lot S1) : prix payé au salarié par colis livré à
 * domicile et par colis livré en point relais, et clients de messagerie pour lesquels il
 * déclare ses journées (fixés ici par l'admin, le salarié ne choisit pas).
 */
export function BlocMessagerie({ tarifDomicile, tarifRelais, onTarifs, clients, onClients }: {
  tarifDomicile: string
  tarifRelais: string
  onTarifs: (t: { domicile?: string; relais?: string }) => void
  clients: string[]
  onClients: (ids: string[]) => void
}) {
  const [liste, setListe] = useState<Array<{ id: string; name: string; tariff_mode: string | null }>>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')

  useEffect(() => {
    let vivant = true
    getClientsActifs().then(({ data, error }) => {
      if (!vivant) return
      setListe(data)
      setErreur(error ? 'Clients non chargés : ' + error.message : null)
      setChargement(false)
    })
    return () => { vivant = false }
  }, [])

  // Cochés d'abord, puis les clients « au colis », puis le reste ; filtre par nom.
  const affiches = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    return liste
      .filter(c => !t || c.name.toLowerCase().includes(t) || clients.includes(c.id))
      .sort((a, b) => {
        const rang = (c: typeof a) => (clients.includes(c.id) ? 0 : c.tariff_mode === 'colis' ? 1 : 2)
        return rang(a) - rang(b) || a.name.localeCompare(b.name, 'fr')
      })
  }, [liste, recherche, clients])

  // Un client coché mais devenu inactif reste visible pour pouvoir le décocher.
  const inconnus = clients.filter(id => !liste.some(c => c.id === id))

  const basculer = (id: string) =>
    onClients(clients.includes(id) ? clients.filter(x => x !== id) : [...clients, id])

  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] p-3">
      <div className="flex items-center gap-2">
        <Package size={15} className="text-[var(--brand)]" />
        <p className="text-sm font-semibold text-[var(--text)]">Messagerie (payé au colis)</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Colis domicile (€)</span>
          <input className="field" inputMode="decimal" placeholder="ex. 1,20" value={tarifDomicile}
            onChange={e => onTarifs({ domicile: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Colis point relais (€)</span>
          <input className="field" inputMode="decimal" placeholder="ex. 0,80" value={tarifRelais}
            onChange={e => onTarifs({ relais: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Vide = pas de tarif : le rapport affichera « tarif manquant » au lieu d’un montant dû.
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
          Clients de messagerie du salarié ({clients.length})
        </span>
        <BarreRecherche value={recherche} onChange={setRecherche} placeholder="Chercher un client" taille="sm" />
        {chargement ? (
          <p className="text-sm text-[var(--text-muted)]">Chargement des clients…</p>
        ) : erreur ? (
          <p className="text-sm text-[var(--danger)]">{erreur}</p>
        ) : (
          <div className="flex flex-col max-h-[14rem] overflow-y-auto rounded-[var(--r-md)] border border-[var(--border)] divide-y divide-[var(--border)]">
            {inconnus.map(id => (
              <label key={id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked onChange={() => basculer(id)} />
                <span className="text-[var(--text-muted)] italic">Client inactif ou introuvable</span>
              </label>
            ))}
            {affiches.length === 0 && inconnus.length === 0 && (
              <p className="px-3 py-3 text-sm text-[var(--text-muted)]">Aucun client actif trouvé.</p>
            )}
            {affiches.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[var(--bg-card-hover)]">
                <input type="checkbox" checked={clients.includes(c.id)} onChange={() => basculer(c.id)} />
                <span className="flex-1 truncate text-[var(--text)]">{c.name}</span>
                {c.tariff_mode === 'colis' && <span className="text-xs text-[var(--text-muted)]">au colis</span>}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          Le salarié déclare une journée par client coché ; il ne peut pas en choisir un autre.
        </p>
      </div>
    </div>
  )
}
