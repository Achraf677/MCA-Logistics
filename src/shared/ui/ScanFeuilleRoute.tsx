import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, ImagePlus, Trash2, ScanText, Loader2, Check, AlertTriangle, MapPin, Plus, RotateCcw, X, ListChecks, ChevronDown,
} from 'lucide-react'
import { Badge } from './Badge'
import { BoutonIcone } from './BoutonIcone'
import { useToast } from './useToast'
import {
  LIBELLE_TYPE_ARRET, arretVide, fusionnerEntetes, manquesApercu, modifierArretLu, ordonnerParPage, ordreHabituel, pagesEnDouble,
  pagesManquantes, retirerPhoto, totauxApercu, type ArretLu, type EnteteFeuille, type PageLue, type TypeArretColis,
} from '../lib/tourneesColis'
import { compresserPage, creerTourneeColis, lirePageFeuille } from '../lib/tourneesColis.queries'

interface Page {
  cle: string
  file: File
  apercu: string
  etat: 'attente' | 'lecture' | 'ok' | 'erreur'
  erreur?: string
  nb?: number
  /** « x/y » lu en bas à droite de la page, s'il était visible. */
  pageLue?: PageLue | null
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
 * lecture page par page (Edge `lire-feuille-route`, qui applique le référentiel : villages,
 * rues officielles, positions, relais, ordre habituel), résumé, puis création de la tournée.
 * La correction des arrêts reste possible (repliée) mais n'est jamais exigée. Rien n'est écrit avant
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
  const [details, setDetails] = useState(false)
  // Dernière commune lue par page : une page qui commence sans bandeau reprend celle d'avant.
  const communesParPage = useRef<Record<number, string | null>>({})
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

  /** Retire une photo ; ses arrêts déjà lus partent avec elle (les photos suivantes remontent). */
  const retirerPage = (cle: string) => {
    const i = pages.findIndex(x => x.cle === cle)
    if (i < 0) return
    URL.revokeObjectURL(pages[i].apercu)
    setPages(prev => prev.filter(x => x.cle !== cle))
    setArrets(prev => retirerPhoto(prev, i + 1))
    const c: Record<number, string | null> = {}
    for (const [k, v] of Object.entries(communesParPage.current)) {
      const n = Number(k)
      if (n < i + 1) c[n] = v; else if (n > i + 1) c[n - 1] = v
    }
    communesParPage.current = c
    setEntetes(prev => {
      const out: Record<number, EnteteFeuille | null> = {}
      for (const [k, v] of Object.entries(prev)) {
        const n = Number(k)
        if (n < i + 1) out[n] = v; else if (n > i + 1) out[n - 1] = v
      }
      return out
    })
  }

  /** Lit une page (index 0-based) et range ses arrêts à sa place (ordre des pages). */
  const lireUne = async (index: number, liste: Page[]) => {
    const p = liste[index]
    const numero = index + 1
    setPages(prev => prev.map(x => (x.cle === p.cle ? { ...x, etat: 'lecture', erreur: undefined } : x)))
    const precedente = communesParPage.current[numero - 1] ?? null
    let res: Awaited<ReturnType<typeof lirePageFeuille>>
    try {
      res = await lirePageFeuille(await compresserPage(p.file), numero, precedente)
    } catch (e) {
      res = { arrets: [], entete: null, pageLue: null, error: e as Error }
    }
    if (res.error) {
      setPages(prev => prev.map(x => (x.cle === p.cle ? { ...x, etat: 'erreur', erreur: res.error!.message } : x)))
      return false
    }
    communesParPage.current[numero] = [...res.arrets].reverse().find(a => a.commune)?.commune ?? precedente
    setPages(prev => prev.map(x => (x.cle === p.cle ? { ...x, etat: 'ok', nb: res.arrets.length, pageLue: res.pageLue } : x)))
    setEntetes(prev => ({ ...prev, [numero]: res.entete }))
    setArrets(prev => [...prev.filter(a => a.page !== numero), ...res.arrets])
    return true
  }

  /** Lit les pages pas encore lues : une page ajoutée après coup ne fait pas perdre les corrections. */
  const toutLire = async () => {
    const liste = pages
    setEtape('lecture')
    let ok = liste.filter(p => p.etat === 'ok').length
    for (let i = 0; i < liste.length; i++) if (liste[i].etat !== 'ok' && await lireUne(i, liste)) ok++
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
    const dernier = ordonnerParPage(prev, pages.map(p => p.pageLue)).at(-1)
    return [...prev, arretVide(dernier?.page ?? 1, dernier)]
  })

  // Ordre de la feuille (« x/y » lus), qui sera aussi le rang enregistré.
  const ordonnes = useMemo(() => ordonnerParPage(arrets, pages.map(p => p.pageLue)), [arrets, pages])
  const totaux = useMemo(() => totauxApercu(arrets), [arrets])
  const entete = useMemo(() => fusionnerEntetes(Object.values(entetes), pages.length), [entetes, pages.length])
  const manques = manquesApercu(arrets)
  const enLecture = pages.find(p => p.etat === 'lecture')
  const traitees = pages.filter(p => p.etat === 'ok' || p.etat === 'erreur').length
  const enErreur = pages.filter(p => p.etat === 'erreur')
  const lues = pages.filter(p => p.etat === 'ok').map(p => p.pageLue)
  const manquantes = pagesManquantes(lues)
  const enDouble = pagesEnDouble(lues)
  const totalFeuille = Math.max(0, ...lues.map(p => p?.total ?? 0))
  const affiches = seulementAVerifier ? ordonnes.filter(a => a.a_verifier) : ordonnes
  const habituel = useMemo(() => ordreHabituel(ordonnes) != null, [ordonnes])

  const creer = async () => {
    if (manques.length) return
    setCreation(true)
    const { id, error } = await creerTourneeColis({
      companyId, memberId, date, clientId: clientId || null, entete, arrets: ordonnes,
    })
    setCreation(false)
    if (error || !id) { toast(error?.message ?? 'Création impossible', 'error'); return }
    toast(`Tournée créée : ${totaux.arrets + totaux.collectes} arrêts`, 'success')
    onCree(id)
  }

  const aLire = pages.filter(p => p.etat !== 'ok').length

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
          <button type="button" onClick={aLire === 0 ? () => setEtape('apercu') : toutLire}
            disabled={pages.length === 0} className={`${btnPrimaire} flex-[2]`}>
            <ScanText size={18} />
            {aLire === 0 ? 'Voir les arrêts lus' : `Lire ${aLire > 1 ? `les ${aLire} pages` : 'la page'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Étape 2 : lecture ─────────────────────────────────────────────────────
  if (etape === 'lecture') {
    const pct = pages.length ? Math.round((traitees / pages.length) * 100) : 0
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
  // Même règle que le contrôle par ligne : tous les numéros (collectes comprises).
  const colisFeuille = arrets.reduce((n, a) => n + a.quantite, 0)
  const ecartFeuille = entete.nb_colis != null && entete.nb_colis !== colisFeuille
  const ecartPgeo = entete.nb_pgeo != null && entete.nb_pgeo !== arrets.length
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 p-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)]">
        <p className="text-base font-semibold text-[var(--text)]">
          {totaux.arrets} arrêt{totaux.arrets > 1 ? 's' : ''} · {totaux.colis} colis
        </p>
        <p className="text-sm text-[var(--text)]">
          {[
            totaux.relais > 0 && `${totaux.relais} relais`,
            totaux.collectes > 0 && `${totaux.collectes} collecte${totaux.collectes > 1 ? 's' : ''}`,
            totaux.villages > 0 && `${totaux.villages} village${totaux.villages > 1 ? 's' : ''}`,
          ].filter(Boolean).join(' · ')}
        </p>
        <ul className="flex flex-col gap-0.5 py-1 text-sm">
          {totaux.connus > 0 && (
            <li className="flex items-start gap-1.5 text-[var(--success)]">
              <Check size={15} className="shrink-0 mt-0.5" />
              {totaux.connus === arrets.length ? 'Toutes les adresses reconnues' : `${totaux.connus} adresses sur ${arrets.length} reconnues`}
            </li>
          )}
          {habituel && (
            <li className="flex items-start gap-1.5 text-[var(--success)]">
              <Check size={15} className="shrink-0 mt-0.5" /> Rangée dans ton ordre habituel
            </li>
          )}
          {totaux.aPlacer > 0 && (
            <li className="flex items-start gap-1.5 text-[var(--text-muted)]">
              <MapPin size={15} className="shrink-0 mt-0.5" />
              {totaux.aPlacer} adresse{totaux.aPlacer > 1 ? 's' : ''} à placer sur la carte pendant la tournée
            </li>
          )}
        </ul>
        <p className="text-xs text-[var(--text-muted)]">
          {pages.length} page{pages.length > 1 ? 's' : ''} lue{pages.length > 1 ? 's' : ''}
          {totalFeuille > 0 && ` sur ${totalFeuille}`}
          {entete.circuit && ` · circuit ${entete.circuit}`}{entete.vehicule && ` · ${entete.vehicule}`}
          {entete.date && ` · feuille du ${entete.date}`}{entete.depart && ` · départ ${entete.depart}`}
          {entete.livreur && ` · ${entete.livreur}`}
        </p>
        {manquantes.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--danger)]">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            Page{manquantes.length > 1 ? 's' : ''} {manquantes.map(n => `${n}/${totalFeuille}`).join(', ')} non
            scannée{manquantes.length > 1 ? 's' : ''} : ajoute {manquantes.length > 1 ? 'les photos' : 'la photo'} (bouton Photos).
          </p>
        )}
        {enDouble.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            Page{enDouble.length > 1 ? 's' : ''} {enDouble.join(', ')} photographiée{enDouble.length > 1 ? 's' : ''} deux
            fois : supprime les arrêts en double.
          </p>
        )}
        {ecartPgeo && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            La feuille annonce {entete.nb_pgeo} PGEO, la lecture trouve {arrets.length} numéros.
          </p>
        )}
        {ecartFeuille && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            La feuille annonce {entete.nb_colis} colis, la lecture en trouve {colisFeuille} : vérifie les lignes.
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

      {/* Rien à faire d'habitude : les arrêts se corrigent seulement si on le veut. */}
      <button type="button" onClick={() => setDetails(v => !v)} aria-expanded={details}
        className={`${btnSecondaire} justify-between`}>
        <span className="inline-flex items-center gap-2">
          <ListChecks size={16} /> Voir / corriger les arrêts
          {totaux.aVerifier > 0 && <Badge color="warning">{totaux.aVerifier} à vérifier</Badge>}
        </span>
        <ChevronDown size={16} className={details ? 'rotate-180' : ''} />
      </button>

      {details && (
        <>
          {totaux.aVerifier > 0 && (
            <button type="button" onClick={() => setSeulementAVerifier(v => !v)} aria-pressed={seulementAVerifier}
              className={`min-h-10 px-3 inline-flex items-center gap-2 self-start rounded-[var(--r-md)] border text-sm font-medium ${
                seulementAVerifier ? 'border-[var(--warning)] text-[var(--warning)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
              <AlertTriangle size={15} /> {seulementAVerifier ? 'Afficher tout' : `Seulement les ${totaux.aVerifier} à vérifier`}
            </button>
          )}

          <ol className="flex flex-col gap-2">
            {affiches.map(a => (
              <LigneApercu key={a.cle} a={a} rang={ordonnes.indexOf(a) + 1}
                onModifier={patch => modifier(a.cle, patch)} onSupprimer={() => supprimer(a.cle)} />
            ))}
          </ol>

          <button type="button" onClick={ajouter} className={`${btnSecondaire} self-start`}>
            <Plus size={16} /> Ajouter un arrêt
          </button>
        </>
      )}

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
  rue: { texte: 'Numéro voisin ou milieu de rue', cls: 'text-[var(--text-muted)]' },
  aucune: { texte: 'À placer sur la carte', cls: 'text-[var(--text-muted)]' },
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
      {a.secteur && (
        <p className="pl-[6.75rem] -mt-1.5 text-xs text-[var(--text-muted)] truncate" title="Secteur (colonne District)">
          {a.secteur}
        </p>
      )}
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
          <button type="button" onClick={() => onModifier({ a_verifier: false, motif: null })}
            className="inline-flex flex-wrap items-center gap-1 min-h-7 text-left">
            <Badge color="warning">À vérifier</Badge>
            {a.motif && <span className="text-[var(--warning)]">{a.motif}</span>}
            <span className="text-[var(--text-muted)] underline">c'est bon</span>
          </button>
        )}
      </div>
    </li>
  )
}
