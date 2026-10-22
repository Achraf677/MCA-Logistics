import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Pencil, X } from 'lucide-react'
import { LIBELLE_TYPE_ARRET, type ArretColis, type TourneeColis } from '../../shared/lib/tourneesColis'
import { libelleAdresse } from './tourneeColis.logic'
import { modeOrdre, numeroAffiche } from '../../shared/lib/tourneesColisRoute'
import { FeuilleAdresse } from '../../shared/ui/FeuilleAdresse'
import { rechercherArrets } from '../../shared/lib/adresseTournee.logic'

/** Barre fine tout en haut : chercher un arrêt de la tournée, en ouvrir la fiche, corriger ou ajouter une adresse. */
export function RechercheAdresse({ tournee, arrets, verrouillee, onOuvrir, onAjoute, onModifier }: {
  tournee: TourneeColis
  arrets: ArretColis[]
  verrouillee: boolean
  onOuvrir: (a: ArretColis) => void
  onAjoute: (a: ArretColis) => void
  onModifier: (a: ArretColis) => void
}) {
  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [feuille, setFeuille] = useState<{ saisie: string } | null>(null)
  const racine = useRef<HTMLDivElement>(null)
  const mode = modeOrdre(tournee)
  const resultats = useMemo(() => rechercherArrets(arrets, q), [arrets, q])

  // Un appui ailleurs referme la liste (sans effacer ce qui est tapé).
  useEffect(() => {
    if (!ouvert) return
    const ferme = (e: PointerEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('pointerdown', ferme)
    return () => document.removeEventListener('pointerdown', ferme)
  }, [ouvert])

  const afficher = ouvert && q.trim().length > 0
  return (
    <div ref={racine} className="relative">
      <div className="flex items-center gap-1.5 px-2.5 h-9 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] focus-within:border-[var(--brand)]">
        <Search size={16} className="shrink-0 text-[var(--text-muted)]" />
        <input value={q} onChange={e => { setQ(e.target.value); setOuvert(true) }} onFocus={() => setOuvert(true)}
          type="search" enterKeyHint="search" autoComplete="off" placeholder="Chercher une adresse" aria-label="Chercher une adresse de la tournée"
          className="flex-1 min-w-0 bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none" />
        {q && (
          <button type="button" aria-label="Effacer" onClick={() => { setQ(''); setOuvert(false) }}
            className="size-7 shrink-0 inline-flex items-center justify-center rounded-full text-[var(--text-muted)]"><X size={16} /></button>
        )}
        {!verrouillee && (
          <button type="button" aria-label="Ajouter une adresse" onClick={() => setFeuille({ saisie: q })}
            className="size-7 shrink-0 inline-flex items-center justify-center rounded-full bg-[var(--brand)] text-black"><Plus size={16} /></button>
        )}
      </div>

      {afficher && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-20 max-h-[45vh] overflow-y-auto rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-lg">
          {resultats.map(a => (
            <li key={a.id} className="flex items-stretch border-b border-[var(--border)] last:border-b-0">
              <button type="button" onClick={() => { onOuvrir(a); setOuvert(false) }} className="flex-1 min-w-0 px-3 py-2 text-left">
                <span className="block text-base font-semibold text-[var(--text)] truncate">{libelleAdresse(a)}</span>
                <span className="block text-sm text-[var(--text-muted)] truncate">
                  {numeroAffiche(a, mode) != null ? <b className="text-[var(--text)]">N° {numeroAffiche(a, mode)}/{arrets.length} · </b> : null}{a.commune}{a.zone ? ` · ${a.zone.replace('ZONE', 'Zone')}` : ''} · {LIBELLE_TYPE_ARRET[a.type]}{a.statut ? ' · traité' : ''}
                </span>
              </button>
              {!verrouillee && !a.statut && (
                <button type="button" aria-label="Modifier l'adresse" onClick={() => { onModifier(a); setOuvert(false) }}
                  className="w-11 shrink-0 inline-flex items-center justify-center text-[var(--text-muted)]"><Pencil size={16} /></button>
              )}
            </li>
          ))}
          {!resultats.length && <li className="px-3 py-2 text-sm text-[var(--text-muted)]">Rien dans la tournée.</li>}
          {!verrouillee && (
            <li>
              <button type="button" onClick={() => { setFeuille({ saisie: q }); setOuvert(false) }}
                className="w-full px-3 py-2.5 inline-flex items-center gap-2 text-left text-base font-semibold text-[var(--brand)]">
                <Plus size={16} /> Ajouter « {q.trim()} »
              </button>
            </li>
          )}
        </ul>
      )}

      {feuille && (
        <FeuilleAdresse tournee={tournee} arrets={arrets} arret={null} saisie={feuille.saisie}
          onFermer={() => setFeuille(null)}
          onFait={a => { setFeuille(null); setQ(''); setOuvert(false); onAjoute(a) }} />
      )}
    </div>
  )
}
