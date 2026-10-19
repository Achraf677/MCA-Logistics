import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Camera, ImagePlus, Trash2, ScanText, Loader2, Check, AlertTriangle, MapPin, Plus, RotateCcw, X, ListChecks, ChevronDown,
} from 'lucide-react'
import { Badge } from './Badge'
import { BoutonIcone } from './BoutonIcone'
import { useToast } from './useToast'
import {
  LIBELLE_TYPE_ARRET, arretVide, fusionnerEntetes, manquesApercu, modifierArretLu, ordonnerParPage, ordreHabituel, pagesEnDouble,
  pagesManquantes, totauxApercu, type ArretLu, type EnteteFeuille, type PageLue, type TypeArretColis,
} from '../lib/tourneesColis'
import {
  SCAN_COUPE_APRES_MS, abandonnerScan, calculerItineraire, compresserPage, creerTourneeColis, lancerScan, relancerScan,
  resultatScan, suivreScan, terminerScan, type ScanPage, type ScanSuivi,
} from '../lib/tourneesColis.queries'

/** Photo choisie sur ce téléphone, pas encore envoyée. */
interface Photo {
  cle: string
  file: File
  apercu: string
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
export function ScanFeuilleRoute({ companyId, memberId, nomSalarie, date, clients, reprendre = null, onCree, onAnnuler, basCollant = 'bottom-0' }: {
  companyId: string
  memberId: string
  /** Affiché quand le bureau scanne pour quelqu'un d'autre. */
  nomSalarie?: string
  date: string
  /** Clients de messagerie du salarié ; un seul = choisi d'office. */
  clients: Array<{ id: string; name: string }>
  /** Scan déjà envoyé (lecture en cours ou prête) à retrouver : on reprend là où il en est. */
  reprendre?: string | null
  onCree: (tourneeId: string) => void
  onAnnuler: () => void
  /** Position de la barre d'actions collée en bas (au-dessus d'une barre d'onglets fixe). */
  basCollant?: string
}) {
  const { toast } = useToast()
  const [etape, setEtape] = useState<'photos' | 'lecture' | 'apercu'>(reprendre ? 'lecture' : 'photos')
  // Photos pas encore envoyées (les pages déjà envoyées vivent côté serveur : `pagesScan`).
  const [pages, setPages] = useState<Photo[]>([])
  const [scanId, setScanId] = useState<string | null>(reprendre)
  const [suivi, setSuivi] = useState<ScanSuivi | null>(null)
  const [pagesScan, setPagesScan] = useState<ScanPage[]>([])
  const [pageLues, setPageLues] = useState<Record<number, PageLue | null>>({})
  const [arrets, setArrets] = useState<ArretLu[]>([])
  const [entetes, setEntetes] = useState<Record<number, EnteteFeuille | null>>({})
  const [clientChoisi, setClientId] = useState<string>('')
  // Un seul client de messagerie : c'est lui (les noms peuvent arriver après le montage).
  const clientId = clients.length === 1 ? clients[0].id : (clientChoisi || suivi?.client_id || '')
  const [seulementAVerifier, setSeulementAVerifier] = useState(false)
  const [details, setDetails] = useState(false)
  const [creation, setCreation] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  /** Pages à recharger quand la lecture finit (null = toutes, au retour sur un scan). */
  const aRecharger = useRef<number[] | null>(reprendre ? null : [])
  const dernierLancement = useRef(0)
  /** Quand chaque page est passée « en lecture » (sert à animer la barre entre deux pages). */
  const [debutLecture, setDebutLecture] = useState<Record<number, number>>({})
  const [maintenant, setMaintenant] = useState(() => Date.now())

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
      return { cle: `p${clePage}`, file, apercu: URL.createObjectURL(file) }
    })])
  }

  /** Retire une photo pas encore envoyée. */
  const retirerPage = (cle: string) => {
    const p = pages.find(x => x.cle === cle)
    if (!p) return
    URL.revokeObjectURL(p.apercu)
    setPages(prev => prev.filter(x => x.cle !== cle))
  }

  /** Ramène les arrêts lus par le serveur (toutes les pages, ou seulement celles qui viennent d'être relues). */
  const chargerResultats = useCallback(async (id: string) => {
    const numeros = aRecharger.current
    const { data, error } = await resultatScan(id, numeros ?? undefined)
    if (error) { toast(error.message, 'error'); return }
    aRecharger.current = []
    for (const r of data) {
      if (r.etat !== 'ok') continue
      setArrets(prev => [...prev.filter(a => a.page !== r.numero), ...r.arrets])
      setEntetes(prev => ({ ...prev, [r.numero]: r.entete }))
      setPageLues(prev => ({ ...prev, [r.numero]: r.pageLue }))
    }
    setEtape('apercu')
  }, [toast])

  // Suivi du scan : la lecture tourne sur le serveur, on lit son avancement toutes les 2 s. Si elle a été
  // coupée (plus de signe de vie), on la relance. Tant que la page est ouverte seulement : fermer le site
  // n'arrête rien, on retrouve le scan au retour.
  useEffect(() => {
    if (!scanId || etape !== 'lecture') return
    let annule = false
    const tick = async () => {
      const { data } = await suivreScan(scanId)
      if (annule) return
      if (!data) { setScanId(null); setEtape('photos'); return }
      setSuivi(data)
      setPagesScan(data.pages)
      setDebutLecture(prev => {
        const out: Record<number, number> = {}
        for (const p of data.pages) if (p.etat === 'lecture') out[p.numero] = prev[p.numero] ?? Date.now()
        return out
      })
      if (data.statut === 'en_cours') {
        const silence = Date.now() - new Date(data.battement).getTime()
        if (silence > SCAN_COUPE_APRES_MS && Date.now() - dernierLancement.current > 60_000) {
          dernierLancement.current = Date.now()
          relancerScan(scanId)
        }
      } else if (data.statut === 'pret') {
        await chargerResultats(scanId)
      }
    }
    tick()
    const t = setInterval(tick, 2000)
    return () => { annule = true; clearInterval(t) }
  }, [scanId, etape, chargerResultats])

  // Horloge pour animer la barre entre deux relevés du serveur.
  useEffect(() => {
    if (etape !== 'lecture') return
    const t = setInterval(() => setMaintenant(Date.now()), 400)
    return () => clearInterval(t)
  }, [etape])

  /** Envoie les photos au serveur et lance la lecture : on peut ensuite quitter la page. */
  const toutLire = async () => {
    setEnvoi(true)
    try {
      const images = await Promise.all(pages.map(p => compresserPage(p.file)))
      const debut = pagesScan.reduce((m, p) => Math.max(m, p.numero), 0)
      const { id, error } = await lancerScan({
        companyId, memberId, date, clientId: clientId || null, images, scanId,
      })
      if (error || !id) { toast(error?.message ?? 'Envoi impossible', 'error'); return }
      aRecharger.current = [...(aRecharger.current ?? []), ...images.map((_, i) => debut + i + 1)]
      pages.forEach(p => URL.revokeObjectURL(p.apercu))
      setPages([])
      setScanId(id)
      setEtape('lecture')
    } finally {
      setEnvoi(false)
    }
  }

  const relire = async (numero: number) => {
    if (!scanId) return
    aRecharger.current = [...(aRecharger.current ?? []), numero]
    setPagesScan(prev => prev.map(p => (p.numero === numero ? { ...p, etat: 'attente', erreur: null } : p)))
    setEtape('lecture')
    const { error } = await relancerScan(scanId, [numero])
    if (error) toast(error.message, 'error')
  }

  const reessayer = async () => {
    if (!scanId) return
    const { error } = await relancerScan(scanId)
    if (error) toast(error.message, 'error')
  }

  const annulerTout = async () => {
    if (scanId) await abandonnerScan(scanId)
    onAnnuler()
  }

  const modifier = (cle: string, patch: Partial<Omit<ArretLu, 'cle'>>) =>
    setArrets(prev => prev.map(a => (a.cle === cle ? modifierArretLu(a, patch) : a)))
  const supprimer = (cle: string) => setArrets(prev => prev.filter(a => a.cle !== cle))
  const lueParPage = useMemo(() => pagesScan.map(p => pageLues[p.numero] ?? null), [pagesScan, pageLues])
  const ajouter = () => setArrets(prev => {
    const dernier = ordonnerParPage(prev, lueParPage).at(-1)
    return [...prev, arretVide(dernier?.page ?? 1, dernier)]
  })

  // Ordre de la feuille (« x/y » lus), qui sera aussi le rang enregistré.
  const ordonnes = useMemo(() => ordonnerParPage(arrets, lueParPage), [arrets, lueParPage])
  const totaux = useMemo(() => totauxApercu(arrets), [arrets])
  const entete = useMemo(() => fusionnerEntetes(Object.values(entetes), pagesScan.length), [entetes, pagesScan.length])
  const manques = manquesApercu(arrets)
  const enLecture = pagesScan.find(p => p.etat === 'lecture')
  const enErreur = pagesScan.filter(p => p.etat === 'erreur')
  const lues = pagesScan.filter(p => p.etat === 'ok').map(p => pageLues[p.numero] ?? null)
  const manquantes = pagesManquantes(lues)
  const enDouble = pagesEnDouble(lues)
  const totalFeuille = Math.max(0, ...lues.map(p => p?.total ?? 0))
  const affiches = seulementAVerifier ? ordonnes.filter(a => a.a_verifier) : ordonnes
  const habituel = useMemo(() => ordreHabituel(ordonnes) != null, [ordonnes])

  const creer = async () => {
    if (manques.length) return
    setCreation(true)
    const { id, error } = await creerTourneeColis({
      companyId, memberId, date: suivi?.date ?? date, clientId: clientId || null, entete, arrets: ordonnes,
    })
    if (error || !id) { setCreation(false); toast(error?.message ?? 'Création impossible', 'error'); return }
    if (scanId) await terminerScan(scanId, id)
    // Ordre par les routes calculé tout de suite : la tournée s'ouvre déjà optimisée. Si le service
    // de routes refuse (limite du jour…), la tournée reste créée, dans l'ordre habituel.
    const calcul = await calculerItineraire({ tourneeId: id, mode: 'tout' })
    setCreation(false)
    toast(`Tournée créée : ${totaux.arrets + totaux.collectes} arrêts`, 'success')
    if (calcul.error) toast(`Ordre non calculé : ${calcul.error.message}`, 'error')
    onCree(id)
  }

  const aLire = pages.length

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
              </li>
            ))}
          </ol>
        )}

        {pagesScan.length > 0 && (
          <p className="text-sm text-[var(--text-muted)]">{pagesScan.length} page{pagesScan.length > 1 ? 's' : ''} déjà envoyée{pagesScan.length > 1 ? 's' : ''}.</p>
        )}
        <div className="flex gap-2">
          {scanId && pagesScan.some(p => p.etat === 'ok')
            ? <button type="button" onClick={() => setEtape('apercu')} className={`${btnSecondaire} flex-1`}>Retour</button>
            : <button type="button" onClick={annulerTout} className={`${btnSecondaire} flex-1`}>Annuler</button>}
          <button type="button" onClick={aLire === 0 ? () => setEtape('apercu') : toutLire}
            disabled={(pages.length === 0 && !pagesScan.some(p => p.etat === 'ok')) || envoi} className={`${btnPrimaire} flex-[2]`}>
            {envoi ? <Loader2 size={18} className="animate-spin" /> : <ScanText size={18} />}
            {envoi ? 'Envoi…' : aLire === 0 ? 'Voir les arrêts lus' : `Lire ${aLire > 1 ? `les ${aLire} pages` : 'la page'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Étape 2 : lecture (sur le serveur : on peut quitter cette page) ───────
  if (etape === 'lecture') {
    const total = pagesScan.length
    const faites = pagesScan.filter(p => p.etat === 'ok' || p.etat === 'erreur').length
    const debut = enLecture ? debutLecture[enLecture.numero] : undefined
    // La page en cours avance en douceur (~20 s) sans jamais dépasser 90 % avant la réponse du serveur.
    const fraction = debut ? Math.min(0.9, (maintenant - debut) / 22_000) : 0
    const pct = total ? Math.min(100, Math.round(((faites + fraction) / total) * 100)) : 0
    const trouves = pagesScan.reduce((n, p) => n + (p.nb ?? 0), 0)
    const reste = Math.max(0, Math.round((total - faites - fraction) * 20))
    const echec = suivi?.statut === 'erreur'
    return (
      <div className="flex flex-col gap-4 py-4" aria-live="polite">
        <div className="flex items-center gap-3">
          {echec
            ? <AlertTriangle size={26} className="text-[var(--danger)] shrink-0" />
            : <Loader2 size={26} className="animate-spin text-[var(--brand)] shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-[var(--text)]">
              {echec ? 'Lecture impossible'
                : enLecture ? `Lecture de la page ${enLecture.numero} sur ${total}…`
                : total ? 'Lecture en attente…' : 'Envoi des photos…'}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {echec ? suivi?.erreur
                : trouves > 0 ? `${trouves} arrêt${trouves > 1 ? 's' : ''} trouvé${trouves > 1 ? 's' : ''} jusqu'ici`
                : 'Le serveur lit ta feuille'}
            </p>
          </div>
          <span className="text-2xl font-bold tabular-nums text-[var(--text)]">{pct} %</span>
        </div>

        <div className="relative h-4 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden"
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${echec ? 'bg-[var(--danger)]' : 'bg-[var(--brand)]'}`}
            style={{ width: `${Math.max(pct, 4)}%` }} />
          {!echec && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden />
          )}
        </div>

        <ul className="flex flex-col gap-1.5">
          {pagesScan.map(p => {
            const actif = p.etat === 'lecture'
            return (
              <li key={p.numero}
                className={`flex items-center gap-3 min-h-12 px-3 rounded-[var(--r-md)] border text-base ${
                  actif ? 'border-[var(--brand)] bg-[var(--brand)]/5' : 'border-[var(--border)]'}`}>
                {p.etat === 'ok' ? <Check size={20} className="text-[var(--success)] shrink-0" />
                  : p.etat === 'erreur' ? <AlertTriangle size={20} className="text-[var(--danger)] shrink-0" />
                  : actif ? <Loader2 size={20} className="animate-spin text-[var(--brand)] shrink-0" />
                  : <span className="w-5 h-5 rounded-full border-2 border-[var(--border)] shrink-0" />}
                <span className="font-medium text-[var(--text)]">Page {p.numero}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-muted)] text-right">
                  {p.etat === 'ok' ? `${p.nb ?? 0} arrêt${(p.nb ?? 0) > 1 ? 's' : ''}`
                    : p.etat === 'erreur' ? p.erreur
                    : actif ? 'Lecture…' : 'En attente'}
                </span>
              </li>
            )
          })}
        </ul>

        {!echec && (
          <p className="flex items-start gap-2 p-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text-muted)]">
            <Check size={16} className="shrink-0 mt-0.5 text-[var(--success)]" />
            <span>
              Tu peux changer d'onglet ou quitter le site : la lecture continue sur le serveur.
              Tu retrouveras ta feuille dans <strong className="text-[var(--text)]">Ma tournée</strong>.
              {reste > 0 && total > 0 && <> Encore environ {reste < 60 ? `${reste} s` : `${Math.ceil(reste / 60)} min`}.</>}
            </span>
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={annulerTout} className={`${btnSecondaire} flex-1`}>Annuler la lecture</button>
          {echec && <button type="button" onClick={reessayer} className={`${btnPrimaire} flex-1`}><RotateCcw size={18} /> Réessayer</button>}
        </div>
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
          {pagesScan.length} page{pagesScan.length > 1 ? 's' : ''} lue{pagesScan.length > 1 ? 's' : ''}
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
        <div key={p.numero} className="flex items-center gap-2 p-2.5 rounded-[var(--r-md)] text-sm
          bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)]">
          <AlertTriangle size={16} className="shrink-0" />
          <span className="flex-1 min-w-0">Page {p.numero} non lue : {p.erreur}</span>
          <button type="button" onClick={() => relire(p.numero)} disabled={!!enLecture}
            className="min-h-9 px-2.5 inline-flex items-center gap-1 rounded-[var(--r-md)] border border-current text-xs font-medium">
            <RotateCcw size={14} /> Relire
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
