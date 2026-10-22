import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useToast } from './useToast'
import { useProfile } from '../../app/providers'
import { LIBELLE_TYPE_ARRET, type ArretColis, type TourneeColis, type TypeArretColis } from '../lib/tourneesColis'
import { ajouterArret, appliquerZones, communesTraitees, modifierAdresseArret, ruesDeCommune } from '../lib/tourneesColis.queries'
import { analyserSaisie, cpDeLaCommune, normaliser, zoneDeLaRue } from '../lib/adresseTournee.logic'

const champCls = `w-full min-h-12 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-base text-[var(--text)] focus:outline-none focus:border-[var(--brand)] disabled:opacity-60`
const boutonPrimaireCls = `min-h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] bg-[var(--brand)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed`

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
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={arret ? "Modifier l'adresse" : 'Ajouter une adresse'}>
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
