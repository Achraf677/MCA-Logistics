import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  Check, Pencil, Store, Package, PackagePlus, House, Clock, Undo2, Minus, Pause, Play, MessageSquare, Navigation, Camera, GripVertical, X, RotateCcw,
} from 'lucide-react'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { LIBELLE_STATUT_ARRET, LIBELLE_TYPE_ARRET, type ArretColis, type StatutArretColis, type TourneeColis } from '../../shared/lib/tourneesColis'
import { numeroAffiche, modeOrdre, COULEUR_CATEGORIE } from '../../shared/lib/tourneesColisRoute'
import { majArret, ajouterPhotoArret, urlPhotoArret } from '../../shared/lib/tourneesColis.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { lienNavigation } from '../../shared/lib/navigation'
import { lireAppNavigation } from '../../shared/lib/prefChauffeur'
import { statutsProposes, libelleAdresse, patchStatut, familleStatut, issueRapide } from './tourneeColis.logic'
import { champCls } from './EspaceCommun'
import { HorairesRelais } from './HorairesRelais'
import { SelecteurColis } from './SelecteurColis'
import { useModifierAdresse } from './AdresseContexte'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'

type FamilleArret = 'livre' | 'attente' | 'retour' | 'neutre'

/** Teinte de fond d'une ligne selon son résultat : on voit d'un coup d'œil ce qui est fait, en attente, en retour. */
const TEINTE_FAMILLE = {
  livre: 'color-mix(in srgb, var(--success) 14%, var(--bg-card))',
  attente: 'color-mix(in srgb, var(--warning) 14%, var(--bg-card))',
  retour: 'color-mix(in srgb, var(--danger) 14%, var(--bg-card))',
  neutre: 'var(--bg-card)',
} as const

const ICONE_FAMILLE = { livre: Check, attente: Clock, retour: Undo2, neutre: Minus } as const

/** Type d'arrêt en pastille pleine : domicile bleu, point relais violet, collecte jaune. */
export function PastilleType({ type, petit = false }: { type: ArretColis['type']; petit?: boolean }) {
  const Icone = type === 'rc' ? Store : type === 'col' ? PackagePlus : House
  return (
    <span style={{ background: COULEUR_CATEGORIE[type] }}
      className={`shrink-0 inline-flex items-center gap-1 rounded-full font-bold leading-none ${
        type === 'col' ? 'text-black' : 'text-white'} ${petit ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}`}>
      <Icone size={petit ? 12 : 14} aria-hidden /> {LIBELLE_TYPE_ARRET[type]}
    </span>
  )
}

/** Résultat de l'arrêt en pastille pleine : vert livré, orange en attente, rouge en retour. */
function PastilleStatut({ famille, children }: { famille: FamilleArret; children: ReactNode }) {
  const Icone = ICONE_FAMILLE[famille]
  const fond = { livre: 'var(--success)', attente: 'var(--warning)', retour: 'var(--danger)', neutre: 'var(--text-muted)' }[famille]
  return (
    <span style={{ background: fond }} className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold leading-none ${
      famille === 'attente' || famille === 'livre' ? 'text-black' : 'text-white'}`}>
      <Icone size={14} aria-hidden /> {children}
    </span>
  )
}

/** Lien « Y aller » vers l'application de navigation choisie (Moi › préférences). */
function lienYAller(a: Pick<ArretColis, 'lat' | 'lng' | 'numero' | 'rue' | 'cp' | 'commune'>): string | null {
  const adresse = `${libelleAdresse(a)}, ${a.cp ?? ''} ${a.commune}`.replace(/\s+/g, ' ').trim()
  return lienNavigation(lireAppNavigation(), a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng, adresse } : { adresse })
}

export interface PoigneeProps {
  onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void
}

/** Gros boutons, pensés pour le pouce : 4 rem de haut pour l'action principale. */
const GROS = 'min-h-16 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] text-lg font-bold disabled:opacity-40 active:scale-[0.98]'
const MOYEN = 'min-h-14 px-3 inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] text-base font-semibold border disabled:opacity-40 active:scale-[0.98]'

const LIBELLE_FAIT: Record<ArretColis['type'], string> = { c: 'Livré', rc: 'Remis au relais', col: 'Collecté' }

/** Écritures sur un arrêt (statut, note) : partagées par la ligne, la fiche et la barre du bas. */
function useGestes(arret: ArretColis, tournee: TourneeColis, onGeste: (a: ArretColis) => void) {
  const { toast } = useToast()
  const [occupe, setOccupe] = useState(false)
  const { fait } = statutsProposes(arret.type)

  const ecrire = async (patch: Parameters<typeof majArret>[1]) => {
    setOccupe(true)
    const { data, error } = await majArret(arret, patch, tournee)
    setOccupe(false)
    if (error || !data) { toast(error?.message ?? 'Enregistrement impossible', 'error'); return false }
    onGeste(data)
    return true
  }
  // Un geste de résultat (livré, avisé…) sort l'arrêt de la pause.
  const geste = (s: StatutArretColis | null, colis?: number | null) => ecrire({ ...patchStatut(arret, s, colis), en_pause_le: null })
  /** Met l'arrêt en pause (affiché en haut) ou le reprend. */
  const pause = (v: boolean) => ecrire({ en_pause_le: v ? new Date().toISOString() : null })
  return { occupe, fait, ecrire, geste, pause }
}

/**
 * Double confirmation sur le MÊME bouton : un 1er appui « arme » le geste (le bouton devient
 * « Confirmer », un bouton « Annuler » apparaît), un 2e appui l'enregistre tout de suite. Pas de
 * compte à rebours : on confirme quand on veut, ou on annule.
 */
function useValidation(geste: (s: StatutArretColis | null) => Promise<boolean>) {
  const [armee, setArmee] = useState(false)
  const cible = useRef<StatutArretColis | null>(null)
  const demander = (s: StatutArretColis | null) => { cible.current = s; setArmee(true) }
  const confirmer = async () => { setArmee(false); await geste(cible.current) }
  const annuler = () => setArmee(false)
  return { armee, demander, confirmer, annuler }
}

/** Nombre de colis de l'arrêt, bien visible : un arrêt à plusieurs colis saute aux yeux. */
export function PastilleColis({ n, grand = false }: { n: number; grand?: boolean }) {
  const plusieurs = n > 1
  return (
    <span className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full font-bold tabular-nums leading-none ${
      grand ? 'px-3.5 py-1.5 text-2xl' : 'px-3 py-1 text-xl'} ${
      plusieurs ? 'bg-[var(--brand)] text-white shadow-sm' : 'bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text)]'}`}
      aria-label={`${n} colis`}>
      <Package size={grand ? 20 : 16} aria-hidden /> {n}
      <span className={`font-semibold opacity-80 ${grand ? 'text-base' : 'text-sm'}`}>colis</span>
    </span>
  )
}

/**
 * Confirmation d'un arrêt à plusieurs colis : une case par colis, toutes cochées ; on décoche ceux
 * qui ne sont pas remis. Cette feuille EST la double validation (pas de compte à rebours en plus).
 * Les colis non cochés comptent « en attente » (même règle qu'un livré partiel).
 */
function ConfirmationColis({ arret, libelle, occupe, onValider, onFermer }: {
  arret: ArretColis
  libelle: string
  occupe: boolean
  onValider: (n: number) => Promise<boolean>
  onFermer: () => void
}) {
  const [n, setN] = useState(arret.quantite)
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`${libelle} : combien de colis`}>
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/60" />
      <div className="relative flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]
        rounded-t-[var(--r-xl,1.25rem)] bg-[var(--bg-elevated)] border-t border-[var(--border-strong)]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-[var(--text)] break-words">{libelleAdresse(arret)}</p>
            <p className="text-base text-[var(--text-muted)]">{arret.commune}</p>
          </div>
          <PastilleColis n={arret.quantite} grand />
        </div>
        <p className="text-base font-semibold text-[var(--text)]">Combien de colis remis ?</p>
        <SelecteurColis total={arret.quantite} valeur={n} onChange={setN} />
        <button type="button" disabled={occupe || n < 1}
          onClick={async () => { if (await onValider(n)) onFermer() }}
          className={`${GROS} bg-[var(--success)] text-black`}>
          <Check size={24} /> {libelle} · {n} sur {arret.quantite}
        </button>
        {n < arret.quantite && n > 0 && (
          <p className="text-sm text-[var(--warning)] text-center">{arret.quantite - n} colis restent en attente</p>
        )}
        <button type="button" onClick={onFermer} className="min-h-12 inline-flex items-center justify-center text-base text-[var(--text-muted)] underline">
          Annuler
        </button>
      </div>
    </div>
  )
}

/**
 * Fiche d'un arrêt (feuille qui monte du bas, à portée du pouce) : l'action principale en très
 * gros, les autres issues en gros boutons, puis colis partiels, note, photo, Y aller.
 */
export function FicheArret({ arret, tournee, onGeste, photos = [], onPhoto, onFermer }: {
  arret: ArretColis
  tournee: TourneeColis
  onGeste: (a: ArretColis) => void
  photos?: DocumentRow[]
  onPhoto?: (arretId: string, doc: DocumentRow) => void
  onFermer: () => void
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const { occupe, fait, ecrire, geste, pause } = useGestes(arret, tournee, onGeste)
  const modifierAdresse = useModifierAdresse()
  const { autres } = statutsProposes(arret.type)
  const [remis, setRemis] = useState(arret.colis_remis ?? arret.quantite)
  const [note, setNote] = useState(arret.note ?? '')
  const photoRef = useRef<HTMLInputElement>(null)
  const yAller = lienYAller(arret)

  const faire = async (s: StatutArretColis | null, colis?: number | null) => { if (await geste(s, colis)) onFermer() }

  const prendrePhoto = async (f: File | undefined) => {
    if (!f || !companyId) return
    const { data, error } = await ajouterPhotoArret(f, companyId, arret.id)
    if (photoRef.current) photoRef.current.value = ''
    if (error || !data) { toast(error?.message ?? 'Photo non enregistrée', 'error'); return }
    onPhoto?.(arret.id, data)
    toast('Photo enregistrée', 'success')
  }

  const voirPhoto = async (doc: DocumentRow) => {
    const url = await urlPhotoArret(doc)
    if (url) ouvrirDocument(url, { titre: 'Photo', type: 'image' })
    else toast('Photo introuvable', 'error')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={libelleAdresse(arret)}>
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[88vh] overflow-y-auto flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]
        rounded-t-[var(--r-xl,1.25rem)] bg-[var(--bg-elevated)] border-t border-[var(--border-strong)]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-[var(--text)] break-words">{libelleAdresse(arret)}</p>
            <p className="flex flex-wrap items-center gap-2 text-base text-[var(--text-muted)]">{arret.commune} <PastilleType type={arret.type} /></p>
            <HorairesRelais arret={arret} />
          </div>
          <PastilleColis n={arret.quantite} grand />
          {modifierAdresse && !arret.statut && (
            <button type="button" onClick={() => { onFermer(); modifierAdresse(arret) }} aria-label="Modifier l'adresse" title="Modifier l'adresse"
              className="size-12 shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]">
              <Pencil size={20} />
            </button>
          )}
          <button type="button" onClick={onFermer} aria-label="Fermer"
            className="size-12 shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]">
            <X size={22} />
          </button>
        </div>

        <button type="button" disabled={occupe} onClick={() => faire(fait)}
          className={`${GROS} bg-[var(--success)] text-black`}>
          <Check size={24} /> {LIBELLE_FAIT[arret.type]}{arret.quantite > 1 ? ` (${arret.quantite} colis)` : ''}
        </button>

        {arret.quantite > 1 && (
          <div className="flex flex-col gap-2 p-2 rounded-[var(--r-lg)] border border-[var(--border)]">
            <SelecteurColis total={arret.quantite} valeur={remis} onChange={setRemis} />
            <button type="button" disabled={occupe || remis < 1} onClick={() => faire(fait, remis)}
              className={`${MOYEN} border-[var(--success)] text-[var(--success)]`}>
              Remis {remis} sur {arret.quantite}
            </button>
          </div>
        )}

        {!arret.statut && (
          <button type="button" disabled={occupe} onClick={async () => { if (await pause(!arret.en_pause_le)) onFermer() }}
            className={`${MOYEN} ${arret.en_pause_le ? 'border-[var(--success)] text-[var(--success)]' : 'border-[var(--warning)] text-[var(--warning)]'}`}>
            {arret.en_pause_le ? <><Play size={20} /> Reprendre cet arrêt</> : <><Pause size={20} /> Mettre en pause</>}
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          {autres.map(s => (
            <button key={s} type="button" disabled={occupe} onClick={() => faire(s)} aria-pressed={arret.statut === s}
              className={`${MOYEN} ${arret.statut === s ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
              {LIBELLE_STATUT_ARRET[s]}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value.slice(0, 300))}
            placeholder="Note (code, étage, voisin…)" aria-label="Note" className={`${champCls} flex-1`} />
          <button type="button" disabled={occupe || note.trim() === (arret.note ?? '')}
            onClick={async () => { if (await ecrire({ note: note.trim() || null })) onFermer() }}
            className={`${MOYEN} border-[var(--border)] text-[var(--text)]`}>
            OK
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => photoRef.current?.click()} className={`${MOYEN} border-[var(--border)] text-[var(--text)]`}>
            <Camera size={20} /> Photo{photos.length ? ` (${photos.length})` : ''}
          </button>
          {yAller ? (
            <a href={yAller} target="_blank" rel="noopener noreferrer" className={`${MOYEN} border-[var(--border)] text-[var(--text)]`}>
              <Navigation size={20} /> Y aller
            </a>
          ) : <span />}
          <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={e => prendrePhoto(e.target.files?.[0])} />
        </div>

        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <button key={p.id} type="button" onClick={() => voirPhoto(p)}
                className="min-h-11 px-3 rounded-[var(--r-md)] border border-[var(--border)] text-sm text-[var(--text)] underline">
                Voir la photo {i + 1}
              </button>
            ))}
          </div>
        )}

        {arret.statut && (
          <button type="button" disabled={occupe} onClick={() => faire(null)}
            className="min-h-12 inline-flex items-center justify-center gap-2 text-base text-[var(--text-muted)] underline">
            <RotateCcw size={16} /> Annuler le statut
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Barre du bas : le PROCHAIN arrêt, toujours sous le pouce. Un appui pour « Livré »,
 * un appui pour l'issue la plus courante (avisé / relais fermé / rien à collecter),
 * « Autre » ouvre la fiche, « Y aller » lance la navigation.
 */
export function BarreProchain({ arret, tournee, onGeste, photos, onPhoto }: {
  arret: ArretColis
  tournee: TourneeColis
  onGeste: (a: ArretColis) => void
  photos?: DocumentRow[]
  onPhoto?: (arretId: string, doc: DocumentRow) => void
}) {
  const { occupe, fait, geste, pause } = useGestes(arret, tournee, onGeste)
  const validation = useValidation(geste)
  const [fiche, setFiche] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const rapide = issueRapide(arret.type)
  const yAller = lienYAller(arret)

  return (
    <>
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t-4 bg-[var(--bg-elevated)]"
        style={{ borderTopColor: COULEUR_CATEGORIE[arret.type] }}>
        <div className="mx-auto max-w-xl flex flex-col gap-2 p-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold leading-tight text-[var(--text)] truncate">{libelleAdresse(arret)}</p>
              <p className="text-sm text-[var(--text-muted)] truncate">
                {arret.commune}{arret.note ? ` · ${arret.note}` : ''}
              </p>
              <span className="mt-0.5 inline-flex"><PastilleType type={arret.type} petit /></span>
              <HorairesRelais arret={arret} />
            </div>
            <PastilleColis n={arret.quantite} grand />
            {yAller && (
              <a href={yAller} target="_blank" rel="noopener noreferrer"
                className="min-h-12 px-4 shrink-0 inline-flex items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border)] text-base font-semibold text-[var(--text)]">
                <Navigation size={20} /> Y aller
              </a>
            )}
          </div>
          {validation.armee ? (
            <div className="flex gap-2">
              <button type="button" disabled={occupe} onClick={validation.confirmer}
                className={`${GROS} flex-[3] bg-[var(--success)] text-black ring-4 ring-[var(--success)]/40`}>
                <Check size={24} /> Confirmer : {LIBELLE_FAIT[arret.type]}
              </button>
              <button type="button" onClick={validation.annuler}
                className={`${GROS} flex-[2] border-2 border-[var(--danger)] text-[var(--danger)]`}>
                <X size={22} /> Annuler
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={occupe} onClick={() => (arret.quantite > 1 ? setConfirmer(true) : validation.demander(fait))} className={`${GROS} flex-[3] bg-[var(--success)] text-black`}>
                <Check size={24} /> {LIBELLE_FAIT[arret.type]}{arret.quantite > 1 ? ` · ${arret.quantite} colis` : ''}
              </button>
              <button type="button" disabled={occupe} onClick={() => geste(rapide)}
                className={`${GROS} flex-[2] border border-[var(--warning)] text-[var(--warning)] text-base`}>
                {LIBELLE_STATUT_ARRET[rapide]}
              </button>
              <button type="button" disabled={occupe} onClick={() => pause(true)} aria-label="Mettre en pause"
                className={`${MOYEN} min-h-16 w-16 px-0 flex-col gap-0 text-xs border-[var(--warning)] text-[var(--warning)]`}>
                <Pause size={22} /> Pause
              </button>
              <button type="button" onClick={() => setFiche(true)} aria-label="Autres choix"
                className={`${MOYEN} min-h-16 border-[var(--border)] text-[var(--text)]`}>
                Autre
              </button>
            </div>
          )}
        </div>
      </div>
      {fiche && <FicheArret arret={arret} tournee={tournee} onGeste={onGeste} photos={photos} onPhoto={onPhoto} onFermer={() => setFiche(false)} />}
      {confirmer && <ConfirmationColis arret={arret} libelle={LIBELLE_FAIT[arret.type]} occupe={occupe} onValider={n => geste(fait, n)} onFermer={() => setConfirmer(false)} />}
    </>
  )
}

/**
 * Une ligne de la liste (ou de la carte). Appuyer sur la ligne ouvre la fiche ; « Livré » reste
 * à un appui. Les arrêts déjà traités montrent leur résultat.
 */
export function ArretTournee({ arret, tournee, verrouillee, onGeste, photos = [], onPhoto, poignee, glisse }: {
  arret: ArretColis
  tournee: TourneeColis
  verrouillee: boolean
  onGeste: (a: ArretColis) => void
  photos?: DocumentRow[]
  onPhoto?: (arretId: string, doc: DocumentRow) => void
  /** Glisser-déposer (ordre manuel). */
  poignee?: PoigneeProps
  glisse?: boolean
}) {
  const [fiche, setFiche] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const modifierAdresse = useModifierAdresse()
  const { occupe, fait, geste, pause } = useGestes(arret, tournee, onGeste)
  const validation = useValidation(geste)
  const enPause = !arret.statut && !!arret.en_pause_le
  const famille = familleStatut(arret.statut)
  const numero = numeroAffiche(arret, modeOrdre(tournee))

  return (
    <li id={`arret-${arret.id}`} style={{ borderLeftColor: COULEUR_CATEGORIE[arret.type], background: famille ? TEINTE_FAMILLE[famille] : enPause ? 'color-mix(in srgb, var(--warning) 10%, var(--bg-card))' : undefined }}
      className={`flex items-stretch gap-2 rounded-[var(--r-lg)] border border-l-[6px] ${famille ? '' : 'bg-[var(--bg-card)]'} ${
      glisse ? 'border-[var(--brand)] shadow-lg' : enPause ? 'border-[var(--warning)]' : arret.statut ? 'border-[var(--border)]' : 'border-[var(--border-strong)]'}`}>
      {poignee && !verrouillee ? (
        // Seule la petite poignée (les 6 points) déplace l'arrêt : le reste de la colonne laisse défiler.
        <span className="w-10 shrink-0 flex flex-col items-center justify-center gap-0.5 text-[var(--text-muted)]">
          <button type="button" {...poignee} aria-label="Glisser pour changer l'ordre"
            className="h-9 w-9 inline-flex items-center justify-center rounded-[var(--r-md)] border border-[var(--border)] touch-none cursor-grab">
            <GripVertical size={18} />
          </button>
          <span className="text-xs font-semibold tabular-nums">{numero ?? '–'}</span>
        </span>
      ) : (
        <span className="w-9 shrink-0 inline-flex items-center justify-center text-xs font-semibold tabular-nums text-[var(--text-muted)]">{numero ?? '–'}</span>
      )}
      <button type="button" onClick={() => setFiche(true)} disabled={verrouillee && photos.length === 0 && !arret.note}
        className="flex-1 min-w-0 min-h-16 py-2 text-left">
        <span className="block text-base font-semibold text-[var(--text)] break-words">{libelleAdresse(arret)}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-muted)]">
          <PastilleColis n={arret.quantite} />
          <PastilleType type={arret.type} />
          {enPause && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold leading-none border border-[var(--warning)]/40 bg-[var(--warning)]/20 text-[var(--warning)]">
              <Pause size={14} aria-hidden /> En pause
            </span>
          )}
          {arret.statut && famille && (
            <PastilleStatut famille={famille}>
              {LIBELLE_STATUT_ARRET[arret.statut]}
              {famille === 'livre' && arret.colis_remis != null && arret.colis_remis < arret.quantite
                ? ` ${arret.colis_remis}/${arret.quantite}` : ''}
            </PastilleStatut>
          )}
          {photos.length > 0 && <span className="inline-flex items-center gap-1"><Camera size={13} /> {photos.length}</span>}
          {arret.note && <span className="inline-flex items-center gap-1"><MessageSquare size={13} /> {arret.note}</span>}
        </span>
      </button>
      {!verrouillee && !arret.statut && modifierAdresse && (
        <button type="button" onClick={() => modifierAdresse(arret)} aria-label="Modifier l'adresse" title="Modifier l'adresse"
          className="w-9 shrink-0 self-center h-11 inline-flex items-center justify-center rounded-[var(--r-md)] text-[var(--text-muted)] active:scale-[0.95]">
          <Pencil size={16} />
        </button>
      )}
      {!verrouillee && enPause && (
        <button type="button" onClick={() => pause(false)} disabled={occupe}
          className="w-28 shrink-0 m-1.5 inline-flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] border-2 border-[var(--warning)] text-[var(--warning)] text-sm font-bold disabled:opacity-40 active:scale-[0.97]">
          <Play size={20} /> Reprendre
        </button>
      )}
      {!verrouillee && !arret.statut && !enPause && !validation.armee && (
        <button type="button" onClick={() => pause(true)} disabled={occupe} aria-label="Mettre en pause"
          className="w-14 shrink-0 my-1.5 inline-flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-semibold disabled:opacity-40 active:scale-[0.97]">
          <Pause size={18} /> Pause
        </button>
      )}
      {!verrouillee && !arret.statut && !enPause && (validation.armee ? (
        <div className="shrink-0 m-1.5 flex gap-1.5">
          <button type="button" onClick={validation.annuler} aria-label="Annuler"
            className="w-12 inline-flex items-center justify-center rounded-[var(--r-md)] border-2 border-[var(--danger)] text-[var(--danger)] active:scale-[0.97]">
            <X size={22} />
          </button>
          <button type="button" onClick={validation.confirmer} disabled={occupe}
            className="w-24 inline-flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] bg-[var(--success)] text-black text-sm font-bold ring-4 ring-[var(--success)]/40 disabled:opacity-40 active:scale-[0.97]">
            <Check size={20} /> Confirmer
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => (arret.quantite > 1 ? setConfirmer(true) : validation.demander(fait))} disabled={occupe}
          className="w-24 shrink-0 m-1.5 inline-flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] bg-[var(--success)] text-black text-sm font-bold disabled:opacity-40 active:scale-[0.97]">
          <Check size={20} /> {arret.type === 'col' ? 'Collecté' : arret.type === 'rc' ? 'Remis' : 'Livré'}
        </button>
      ))}
      {fiche && !verrouillee && (
        <FicheArret arret={arret} tournee={tournee} onGeste={onGeste} photos={photos} onPhoto={onPhoto} onFermer={() => setFiche(false)} />
      )}
      {confirmer && !verrouillee && (
        <ConfirmationColis arret={arret} libelle={LIBELLE_FAIT[arret.type]} occupe={occupe} onValider={n => geste(fait, n)} onFermer={() => setConfirmer(false)} />
      )}
      {fiche && verrouillee && (
        <FichePhotos photos={photos} note={arret.note} onFermer={() => setFiche(false)} />
      )}
    </li>
  )
}

/**
 * Arrêt en pause, version compacte pour le bandeau du haut (toujours visible, même en bas de liste) :
 * une ligne avec l'adresse et « Reprendre » ; un appui sur l'adresse ouvre la fiche (Livré, autres issues).
 */
export function ArretEnPauseCompact({ arret, tournee, onGeste, photos = [], onPhoto }: {
  arret: ArretColis
  tournee: TourneeColis
  onGeste: (a: ArretColis) => void
  photos?: DocumentRow[]
  onPhoto?: (arretId: string, doc: DocumentRow) => void
}) {
  const [fiche, setFiche] = useState(false)
  const { occupe, pause } = useGestes(arret, tournee, onGeste)
  return (
    <li className="flex items-stretch gap-2 rounded-[var(--r-md)] border border-[var(--warning)]"
      style={{ borderLeftWidth: 6, borderLeftColor: COULEUR_CATEGORIE[arret.type], background: 'color-mix(in srgb, var(--warning) 10%, var(--bg-card))' }}>
      <button type="button" onClick={() => setFiche(true)} className="flex-1 min-w-0 min-h-12 py-1.5 pl-2 text-left">
        <span className="block text-base font-semibold text-[var(--text)] truncate">{libelleAdresse(arret)}</span>
        <span className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <span className="truncate">{arret.commune}</span>
          <PastilleColis n={arret.quantite} />
        </span>
      </button>
      <button type="button" onClick={() => pause(false)} disabled={occupe}
        className="w-28 shrink-0 m-1 inline-flex items-center justify-center gap-1.5 rounded-[var(--r-md)] border-2 border-[var(--warning)] text-[var(--warning)] text-sm font-bold disabled:opacity-40 active:scale-[0.97]">
        <Play size={18} /> Reprendre
      </button>
      {fiche && <FicheArret arret={arret} tournee={tournee} onGeste={onGeste} photos={photos} onPhoto={onPhoto} onFermer={() => setFiche(false)} />}
    </li>
  )
}

/** Tournée terminée : seulement les photos et la note, rien à modifier. */
function FichePhotos({ photos, note, onFermer }: { photos: DocumentRow[]; note: string | null; onFermer: () => void }) {
  const { toast } = useToast()
  const voir = async (doc: DocumentRow) => {
    const url = await urlPhotoArret(doc)
    if (url) ouvrirDocument(url, { titre: 'Photo', type: 'image' })
    else toast('Photo introuvable', 'error')
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/60" />
      <div className="relative flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] rounded-t-[1.25rem] bg-[var(--bg-elevated)] border-t border-[var(--border-strong)]">
        {note && <p className="text-base text-[var(--text)]">{note}</p>}
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => voir(p)} className={`${MOYEN} border-[var(--border)] text-[var(--text)]`}>
            Voir la photo {i + 1}
          </button>
        ))}
        <button type="button" onClick={onFermer} className={`${MOYEN} border-[var(--border)] text-[var(--text)]`}>Fermer</button>
      </div>
    </div>
  )
}
