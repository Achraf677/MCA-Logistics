import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Pencil, X } from 'lucide-react'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { LIBELLE_TYPE_ARRET, type ArretColis, type TourneeColis, type TypeArretColis } from '../../shared/lib/tourneesColis'
import { ajouterArret, appliquerZones, communesTraitees, modifierAdresseArret, ruesDeCommune } from '../../shared/lib/tourneesColis.queries'
import { libelleAdresse } from './tourneeColis.logic'
import { champCls, boutonPrimaireCls } from './EspaceCommun'
import { analyserSaisie, cpDeLaCommune, normaliser, rechercherArrets, zoneDeLaRue } from './rechercheAdresse.logic'

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
                  {a.commune}{a.zone ? ` · ${a.zone.replace('ZONE', 'Zone')}` : ''} · {LIBELLE_TYPE_ARRET[a.type]}{a.statut ? ' · traité' : ''}
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

/** Ajout (arret = null) ou correction d'une adresse ; servie par la recherche et par le crayon des arrêts. */
export function FeuilleAdresse({ tournee, arrets, arret, saisie = '', onFermer, onFait }: {
  tournee: TourneeColis
  arrets: ArretColis[]
  arret: ArretColis | null
  saisie?: string
  onFermer: () => void
  onFait: (a: ArretColis, ajout: boolean) => void
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const depart = useMemo(() => (arret ? { numero: arret.numero ?? '', rue: arret.rue } : analyserSaisie(saisie)), [arret, saisie])
  const [communes, setCommunes] = useState<string[]>([])
  const [commune, setCommune] = useState(arret?.commune ?? '')
  const [rues, setRues] = useState<string[]>([])
  const [rue, setRue] = useState(depart.rue)
  const [numero, setNumero] = useState(depart.numero)
  const [type, setType] = useState<TypeArretColis>(arret?.type ?? 'c')
  const [quantite, setQuantite] = useState(arret?.quantite ?? 1)
  const [occupe, setOccupe] = useState(false)
  const zonesTournee = useMemo(() => [...new Set(arrets.map(a => a.zone).filter((z): z is string => !!z))].sort((x, y) => x.localeCompare(y, 'fr', { numeric: true })), [arrets])
  const [zone, setZone] = useState<string | null>(arret?.zone ?? null)

  const chargerRues = (c: string) => { setRues([]); if (c) ruesDeCommune(c).then(setRues) }
  useEffect(() => {
    communesTraitees().then(setCommunes)
    if (arret?.commune) ruesDeCommune(arret.commune).then(setRues)
  }, [arret?.commune])
  // Commune de l'arrêt éditée mais absente de la liste du référentiel : on la garde en tête de liste.
  const choix = useMemo(() => (commune && !communes.some(c => normaliser(c) === normaliser(commune)) ? [commune, ...communes] : communes), [communes, commune])

  const zoneVisible = zonesTournee.length > 0 && normaliser(commune) === normaliser(arrets.find(a => a.zone)?.commune)
  const valide = commune.trim() !== '' && rue.trim() !== ''
  const enregistrer = async () => {
    if (!valide || occupe || !companyId) return
    setOccupe(true)
    const adresse = { commune, cp: cpDeLaCommune(arrets, commune), rue, numero }
    const r = arret
      ? await modifierAdresseArret(arret, adresse, zoneVisible ? zone : null)
      : await ajouterArret({ tourneeId: tournee.id, companyId, adresse, type, quantite, zone: zoneVisible ? zone : null })
    // La zone choisie à la main est retenue pour la rue (elle servira aux prochaines feuilles).
    if (r.data?.zone) await appliquerZones(tournee.id)
    setOccupe(false)
    if (r.error || !r.data) { toast(r.error?.message ?? 'Adresse non enregistrée', 'error'); return }
    if (r.data.lat == null) toast('Adresse enregistrée mais position introuvable : place-la sur la carte', 'error')
    onFait(r.data, !arret)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={arret ? "Modifier l'adresse" : 'Ajouter une adresse'}>
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[88vh] overflow-y-auto flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]
        rounded-t-[var(--r-xl,1.25rem)] bg-[var(--bg-elevated)] border-t border-[var(--border-strong)]">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xl font-bold text-[var(--text)]">{arret ? "Modifier l'adresse" : 'Ajouter une adresse'}</p>
          <button type="button" onClick={onFermer} aria-label="Fermer"
            className="size-12 shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]"><X size={22} /></button>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-muted)]">Village
          <select value={commune} onChange={e => { setCommune(e.target.value); chargerRues(e.target.value); setZone(zoneDeLaRue(arrets, e.target.value, rue)) }} className={champCls}>
            <option value="">Choisir un village</option>
            {choix.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-muted)]">Numéro
            <input value={numero} onChange={e => setNumero(e.target.value)} className={champCls} inputMode="text" autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-muted)]">Rue
            <input value={rue} onChange={e => { setRue(e.target.value); const z = zoneDeLaRue(arrets, commune, e.target.value); if (z) setZone(z) }} list="rues-commune" className={champCls} autoComplete="off"
              placeholder={commune ? 'Rue (propositions du village)' : "Choisis d'abord le village"} />
            <datalist id="rues-commune">{rues.map(r => <option key={r} value={r} />)}</datalist>
          </label>
        </div>
        {zoneVisible && (
          <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-muted)]">Zone
            <select value={zone ?? ''} onChange={e => setZone(e.target.value || null)} className={champCls}>
              <option value="">Aucune zone</option>
              {zonesTournee.map(z => <option key={z} value={z}>{z.charAt(0)}{z.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
        )}
        {!arret && (
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-muted)]">Type
              <select value={type} onChange={e => setType(e.target.value as TypeArretColis)} className={champCls}>
                {(Object.keys(LIBELLE_TYPE_ARRET) as TypeArretColis[]).map(t => <option key={t} value={t}>{LIBELLE_TYPE_ARRET[t]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-muted)]">Colis
              <input type="number" min={1} max={999} value={quantite} onChange={e => setQuantite(Number(e.target.value))} className={champCls} inputMode="numeric" />
            </label>
          </div>
        )}
        <button type="button" disabled={!valide || occupe} onClick={enregistrer} className={`${boutonPrimaireCls} w-full`}>
          {occupe ? 'Enregistrement…' : arret ? 'Enregistrer' : 'Ajouter à la tournée'}
        </button>
      </div>
    </div>
  )
}
