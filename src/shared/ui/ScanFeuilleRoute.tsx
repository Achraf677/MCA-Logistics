import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, ImagePlus, Trash2, ScanText, Loader2, Check, AlertTriangle, MapPin, Plus, RotateCcw, X,
} from 'lucide-react'
import { Badge } from './Badge'
import { BoutonIcone } from './BoutonIcone'
import { useToast } from './useToast'
import {
  LIBELLE_TYPE_ARRET, arretVide, fusionnerEntetes, manquesApercu, modifierArretLu, totauxApercu,
  type ArretLu, type EnteteFeuille, type TypeArretColis,
} from '../lib/tourneesColis'
import { compresserPage, creerTourneeColis, lirePageFeuille } from '../lib/tourneesColis.queries'

interface Page {
  cle: string
  file: File
  apercu: string
  etat: 'attente' | 'lecture' | 'ok' | 'erreur'
  erreur?: string
  nb?: number
}

const champ = `min-w-0 min-h-10 px-2.5 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-sm text-[var(--text)] focus:outline-none focus:border-[var(--brand)]`
const btnPrimaire = `min-h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)]
  bg-[var(--brand)] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed`
const btnSecondaire = `min-h-12 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-md)]
  border border-[var(--border)] text-[var(--text)] text-sm font-medium hover:border-[var(--border-strong)]
  disabled:opacity-40 disabled:cursor-not-allowed`

let clePage = 0

/**
 * Scanner une feuille de route de messagerie : une photo par page (appareil ou galerie),
 * lecture page par page (Edge `lire-feuille-route`), aperçu des arrêts lus à corriger
 * (modifier, supprimer, ajouter), puis création de la tournée. Rien n'est écrit avant
 * « Créer la tournée ». Partagé : le salarié scanne pour lui (Mes courses), le bureau pour
 * un salarié choisi (Tournées).
 */
export function ScanFeuilleRoute({ companyId, memberId, nomSalarie, date, clients, onCree, onAnnuler, basCollant = 'bottom-0' }: {
  companyId: string
  memberId: string
  /** Affiché quand le bureau scanne pour quelqu'un d'autre. */
  nomSalarie?: string
  date: string
  /** Clients de messagerie du salarié ; un seul = choisi d'office. */
  clients: Array<{ id: string; name: string }>
  onCree: (tourneeId: string) => void
  onAnnuler: () => void
  /** Position de la barre d'actions collée en bas (au-dessus d'une barre d'onglets fixe). */
  basCollant?: string
}) {
  const { toast } = useToast()
  const [etape, setEtape] = useState<'photos' | 'lecture' | 'apercu'>('photos')
  const [pages, setPages] = useState<Page[]>([])
  const [arrets, setArrets] = useState<ArretLu[]>([])
  const [entetes, setEntetes] = useState<Record<number, EnteteFeuille | null>>({})
  const [clientChoisi, setClientId] = useState<string>('')
  // Un seul client de messagerie : c'est lui (les noms peuvent arriver après le montage).
  const clientId = clients.length === 1 ? clients[0].id : clientChoisi
  const [seulementAVerifier, setSeulementAVerifier] = useState(false)
  const [creation, setCreation] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)

  // Les aperçus d'image sont des URL locales : on les libère en partant.
  const pagesRef = useRef(pages)
  useEffect(() => { pagesRef.current = pages }, [pages])
  useEffect(() => () => { pagesRef.current.forEach(p => URL.revokeObjectURL(p.apercu)) }, [])

  const ajouterFichiers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichiers = [...(e.target.files ?? [])].filter(f => f.type.startsWith('image/'))
    e.target.value = ''
    if (fichiers.length === 0) return
    setPages(prev => [...prev, ...fichiers.map(file => {
      clePage += 1
      return { cle: `p${clePage}`, file, apercu: URL.createObjectURL(file), etat: 'attente' as const }
    })])
  }

  const retirerPage = (cle: string) => setPages(prev => {
    const p = prev.find(x => x.cle === cle)
    if (p) URL.revokeObjectURL(p.apercu)
    return prev.filter(x => x.cle !== cle)
  })

  /** Lit une page (index 0-based) et range ses arrêts à sa place (ordre des pages). */
  const lireUne = async (index: number, liste: Page[]) => {
    const p = liste[index]
    const numero = index + 1
    setPages(prev => prev.map(x => (x.cle === p.cle ? { ...x, etat: 'lecture', erreur: undefined } : x)))
    let res: Awaited<ReturnType<typeof lirePageFeuille>>
    try {
      res = await lirePageFeuille(await compresserPage(p.file), numero)
    } catch (e) {
      res = { arrets: [], entete: null, error: e as Error }
    }
    if (res.error) {
      setPages(prev => prev.map(x => (x.cle === p.cle ? { ...x, etat: 'erreur', erreur: res.error!.message } : x)))
      return false
    }
    setPages(prev => prev.map(x => (x.cle === p.cle ? { ...x, etat: 'ok', nb: res.arrets.length } : x)))
    setEntetes(prev => ({ ...prev, [numero]: res.entete }))
    setArrets(prev => [...prev.filter(a => a.page !== numero), ...res.arrets].sort((a, b) => a.page - b.page))
    return true
  }

  const toutLire = async () => {
    const liste = pages
    setArrets([]); setEntetes({})
    setEtape('lecture')
    let ok = 0
    for (let i = 0; i < liste.length; i++) if (await lireUne(i, liste)) ok++
    if (ok === 0) {
      toast('Aucune page lue : reprends les photos à plat, bien éclairées.', 'error')
      setEtape('photos')
    } else setEtape('apercu')
  }

  const relire = async (cle: string) => {
    const i = pages.findIndex(p => p.cle === cle)
    if (i >= 0) await lireUne(i, pages)
  }

  const modifier = (cle: string, patch: Partial<Omit<ArretLu, 'cle'>>) =>
    setArrets(prev => prev.map(a => (a.cle === cle ? modifierArretLu(a, patch) : a)))
  const supprimer = (cle: string) => setArrets(prev => prev.filter(a => a.cle !== cle))
  const ajouter = () => setArrets(prev => {
    const dernier = prev[prev.length - 1]
    return [...prev, arretVide(dernier?.page ?? 1, dernier)]
  })

  const totaux = useMemo(() => totauxApercu(arrets), [arrets])
  const entete = useMemo(() => fusionnerEntetes(Object.values(entetes), pages.length), [entetes, pages.length])
  const manques = manquesApercu(arrets)
  const enLecture = pages.find(p => p.etat === 'lecture')
  const lues = pages.filter(p => p.etat === 'ok' || p.etat === 'erreur').length
  const enErreur = pages.filter(p => p.etat === 'erreur')
  const affiches = seulementAVerifier ? arrets.filter(a => a.a_verifier) : arrets

  const creer = async () => {
    if (manques.length) return
    setCreation(true)
    const { id, error } = await creerTourneeColis({
      companyId, memberId, date, clientId: clientId || null, entete, arrets,
    })
    setCreation(false)
    if (error || !id) { toast(error?.message ?? 'Création impossible', 'error'); return }
    toast(`Tournée créée : ${totaux.arrets + totaux.collectes} arrêts`, 'success')
    onCree(id)
  }

  // ── Étape 1 : photos ──────────────────────────────────────────────────────
  if (etape === 'photos') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--text-muted)]">
          Une photo par page, à plat, bien éclairée, la page entière dans le cadre.
          {nomSalarie && <> Pour <strong className="text-[var(--text)]">{nomSalarie}</strong>.</>}
        </p>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={ajouterFichiers} />
        <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={ajouterFichiers} />
        <div className="flex gap-2">
          <button type="button" onClick={() => camRef.current?.click()} className={`${btnPrimaire} flex-[2]`}>
            <Camera size={18} /> Photographier {pages.length ? 'la page suivante' : 'la page 1'}
          </button>
          <button type="button" onClick={() => galRef.current?.click()} className={`${btnSecondaire} flex-1`}>
            <ImagePlus size={18} /> Galerie
          </button>
        </div>

        {pages.length > 0 && (
          <ol className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pages.map((p, i) => (
              <li key={p.cle} className="relative rounded-[var(--r-md)] overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                <img src={p.apercu} alt={`Page ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                <span className="absolute left-1 top-1 px-1.5 rounded-[var(--r-sm)] bg-black/70 text-white text-xs font-semibold">
                  Page {i + 1}
                </span>
                <button type="button" onClick={() => retirerPage(p.cle)} aria-label={`Retirer la page ${i + 1}`}
                  className="absolute right-1 top-1 w-8 h-8 inline-flex items-center justify-center rounded-full bg-black/70 text-white">
                  <X size={16} />
                </button>
                {p.etat === 'erreur' && (
                  <span className="absolute inset-x-0 bottom-0 p-1 bg-[var(--danger)] text-white text-xs leading-tight">
                    {p.erreur}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onAnnuler} className={`${btnSecondaire} flex-1`}>Annuler</button>
          <button type="button" onClick={toutLire} disabled={pages.length === 0} className={`${btnPrimaire} flex-[2]`}>
            <ScanText size={18} /> Lire {pages.length > 1 ? `les ${pages.length} pages` : 'la page'}
          </button>
        </div>
      </div>
    )
  }

  // ── Étape 2 : lecture ─────────────────────────────────────────────────────
  if (etape === 'lecture') {
    const pct = pages.length ? Math.round((lues / pages.length) * 100) : 0
    return (
      <div className="flex flex-col gap-3 py-6" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text)]">
          <Loader2 size={18} className="animate-spin text-[var(--brand)]" />
          {enLecture ? `Lecture de la page ${pages.indexOf(enLecture) + 1} / ${pages.length}…` : 'Lecture…'}
        </div>
        <div className="h-2 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden">
          <div className="h-full bg-[var(--brand)] transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <ul className="flex flex-col gap-1 text-sm">
          {pages.map((p, i) => (
            <li key={p.cle} className="flex items-center gap-2 text-[var(--text-muted)]">
              {p.etat === 'ok' ? <Check size={16} className="text-[var(--success)]" />
                : p.etat === 'erreur' ? <AlertTriangle size={16} className="text-[var(--danger)]" />
                : p.etat === 'lecture' ? <Loader2 size={16} className="animate-spin" />
                : <span className="w-4" />}
              Page {i + 1}{p.etat === 'ok' && ` : ${p.nb} arrêt${(p.nb ?? 0) > 1 ? 's' : ''}`}
              {p.etat === 'erreur' && ` : ${p.erreur}`}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--text-muted)]">Compte une vingtaine de secondes par page.</p>
      </div>
    )
  }

  // ── Étape 3 : aperçu ──────────────────────────────────────────────────────
  const ecartFeuille = entete.nb_colis != null && entete.nb_colis !== totaux.colis
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 p-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)]">
        <p className="text-base font-semibold text-[var(--text)]">
          {totaux.arrets} arrêt{totaux.arrets > 1 ? 's' : ''} · {totaux.colis} colis
          {totaux.collectes > 0 && ` · ${totaux.collectes} collecte${totaux.collectes > 1 ? 's' : ''}`}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {pages.length} page{pages.length > 1 ? 's' : ''} lue{pages.length > 1 ? 's' : ''}
          {entete.circuit && ` · circuit ${entete.circuit}`}{entete.vehicule && ` · ${entete.vehicule}`}
          {entete.date && ` · feuille du ${entete.date}`}
        </p>
        {ecartFeuille && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            La feuille annonce {entete.nb_colis} colis, la lecture en trouve {totaux.colis} : vérifie les lignes.
          </p>
        )}
      </div>

      {enErreur.map(p => (
        <div key={p.cle} className="flex items-center gap-2 p-2.5 rounded-[var(--r-md)] text-sm
          bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)]">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1 min-w-0">Page {pages.indexOf(p) + 1} non lue : {p.erreur}</span>
          <button type="button" onClick={() => relire(p.cle)} disabled={!!enLecture}
            className="min-h-9 px-2.5 inline-flex items-center gap-1 rounded-[var(--r-md)] border border-current text-xs font-medium">
            {p.etat === 'lecture' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Relire
          </button>
        </div>
      ))}

      {clients.length > 1 && (
        <label className="flex flex-col gap-1 text-sm font-medium text-[var(--text)]">
          Client de la tournée
          <select value={clientId} onChange={e => setClientId(e.target.value)} className={`${champ} w-full`}>
            <option value="">Non précisé</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      {totaux.aVerifier > 0 && (
        <button type="button" onClick={() => setSeulementAVerifier(v => !v)} aria-pressed={seulementAVerifier}
          className={`min-h-10 px-3 inline-flex items-center gap-2 self-start rounded-[var(--r-md)] border text-sm font-medium ${
            seulementAVerifier ? 'border-[var(--warning)] text-[var(--warning)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
          <AlertTriangle size={15} /> {totaux.aVerifier} à vérifier {seulementAVerifier ? '(afficher tout)' : ''}
        </button>
      )}

      <ol className="flex flex-col gap-2">
        {affiches.map(a => (
          <LigneApercu key={a.cle} a={a} rang={arrets.indexOf(a) + 1}
            onModifier={patch => modifier(a.cle, patch)} onSupprimer={() => supprimer(a.cle)} />
        ))}
      </ol>

      <button type="button" onClick={ajouter} className={`${btnSecondaire} self-start`}>
        <Plus size={16} /> Ajouter un arrêt
      </button>

      {/* Barre d'actions fixe en bas de la zone (le bouton reste sous le pouce). */}
      <div className={`sticky ${basCollant} -mx-1 px-1 pt-2 pb-1 bg-[var(--bg-elevated)] flex flex-col gap-2 border-t border-[var(--border)]`}>
        {manques.length > 0 && (
          <p className="text-xs text-[var(--warning)]">Il manque pour créer : {manques.join(' · ')}</p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => setEtape('photos')} className={`${btnSecondaire} flex-1`} disabled={creation}>
            Photos
          </button>
          <button type="button" onClick={creer} disabled={creation || manques.length > 0 || !!enLecture}
            className={`${btnPrimaire} flex-[2]`}>
            {creation ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Créer la tournée
          </button>
        </div>
      </div>
    </div>
  )
}

const LIBELLE_GEO: Record<'numero' | 'rue' | 'aucune', { texte: string; cls: string }> = {
  numero: { texte: 'Numéro localisé', cls: 'text-[var(--success)]' },
  rue: { texte: 'Rue localisée (numéro introuvable)', cls: 'text-[var(--warning)]' },
  aucune: { texte: 'Non localisé', cls: 'text-[var(--text-muted)]' },
}

function LigneApercu({ a, rang, onModifier, onSupprimer }: {
  a: ArretLu
  rang: number
  onModifier: (patch: Partial<Omit<ArretLu, 'cle'>>) => void
  onSupprimer: () => void
}) {
  const geo = LIBELLE_GEO[a.geo_precision ?? 'aucune']
  return (
    <li className={`flex flex-col gap-2 p-2.5 rounded-[var(--r-md)] border bg-[var(--bg-card)] ${
      a.a_verifier ? 'border-[var(--warning)]/60' : 'border-[var(--border)]'}`}>
      <div className="flex items-center gap-2">
        <span className="w-7 text-xs font-semibold tabular-nums text-[var(--text-muted)]">{rang}</span>
        <input value={a.numero ?? ''} onChange={e => onModifier({ numero: e.target.value || null })}
          placeholder="N°" aria-label="Numéro" className={`${champ} w-16 shrink-0 text-center`} />
        <input value={a.rue ?? ''} onChange={e => onModifier({ rue: e.target.value || null })}
          placeholder="Rue" aria-label="Rue" className={`${champ} flex-1`}
          aria-invalid={!a.rue?.trim()} />
        <BoutonIcone icone={Trash2} libelle="Supprimer l'arrêt" onClick={onSupprimer} taille="sm" />
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-9">
        <input value={a.commune ?? ''} onChange={e => onModifier({ commune: e.target.value || null })}
          placeholder="Commune" aria-label="Commune" className={`${champ} flex-1 basis-[9rem]`}
          aria-invalid={!a.commune?.trim()} />
        <input value={a.cp ?? ''} onChange={e => onModifier({ cp: e.target.value.replace(/[^\d]/g, '').slice(0, 5) || null })}
          placeholder="CP" aria-label="Code postal" inputMode="numeric" className={`${champ} w-20`} />
        <label className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <input type="number" min={1} max={999} value={a.quantite}
            onChange={e => onModifier({ quantite: Number(e.target.value) })}
            aria-label="Colis" className={`${champ} w-14 text-center`} />
          colis
        </label>
        <select value={a.type} onChange={e => onModifier({ type: e.target.value as TypeArretColis })}
          aria-label="Type" className={`${champ} w-auto`}>
          {(Object.keys(LIBELLE_TYPE_ARRET) as TypeArretColis[]).map(t => (
            <option key={t} value={t}>{LIBELLE_TYPE_ARRET[t]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-9 text-xs">
        <span className={`inline-flex items-center gap-1 ${geo.cls}`}><MapPin size={13} /> {geo.texte}</span>
        {a.note && <span className="text-[var(--text-muted)]">{a.note}</span>}
        {a.a_verifier && (
          <button type="button" onClick={() => onModifier({ a_verifier: false })}
            className="inline-flex items-center gap-1 min-h-7">
            <Badge color="warning">À vérifier</Badge>
            <span className="text-[var(--text-muted)] underline">c'est bon</span>
          </button>
        )}
      </div>
    </li>
  )
}
