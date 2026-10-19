import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import type { ArretColis } from '../../shared/lib/tourneesColis'
import { IDS_POSTE, etatRelais, jourParis, libellePlages, minutesParis, sitePosteDeLArret, type HorairesJour } from '../../shared/lib/relaisPoste'
import { horairesRelaisPoste } from '../../shared/lib/tourneesColis.queries'

const COULEUR = { ouvert: 'var(--success)', ferme: 'var(--warning)', ferme_aujourdhui: 'var(--danger)' } as const

/**
 * Horaires du jour d'un relais / agence / bureau de La Poste (open data La Poste), sur les arrêts dont
 * l'adresse est un de ces points. Rien d'affiché pour un autre arrêt ou si La Poste ne répond pas.
 */
export function HorairesRelais({ arret }: { arret: Pick<ArretColis, 'commune' | 'rue' | 'numero' | 'type'> }) {
  const site = arret.type === 'c' ? null : sitePosteDeLArret(arret)
  const [horaires, setHoraires] = useState<HorairesJour | null>(null)

  useEffect(() => {
    if (!site) return
    let actif = true
    horairesRelaisPoste(IDS_POSTE, jourParis()).then(r => { if (actif) setHoraires(r[site.id] ?? null) })
    return () => { actif = false }
  }, [site])

  if (!site || !horaires) return null
  const e = etatRelais(horaires, minutesParis())
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: COULEUR[e.etat] }}>
      <Clock size={14} className="shrink-0" />
      <span>{e.texte}</span>
      {horaires.plages.length > 0 && <span className="font-normal text-[var(--text-muted)]">({libellePlages(horaires.plages)})</span>}
    </p>
  )
}
