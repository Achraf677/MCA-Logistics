import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Check, Store, PackagePlus, MessageSquare, Navigation, Camera, GripVertical, Minus, Plus, X, RotateCcw,
} from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
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

const COULEUR_FAMILLE = { livre: 'success', attente: 'warning', retour: 'danger', neutre: 'muted' } as const

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
  const geste = (s: StatutArretColis | null, colis?: number | null) => ecrire(patchStatut(arret, s, colis))
  return { occupe, fait, ecrire, geste }
}

/** Délai de la double validation : « Livré » / « Remis » ne s'enregistre qu'après 3 s, annulable. */
const DELAI_VALIDATION_MS = 3000

/**
 * Double validation d'un « Livré » / « Remis » : on appuie, un compte à rebours de 3 s démarre avec un
 * gros bouton « Annuler » ; passé ce délai, le geste est enregistré. Un appui par erreur ne coûte rien
 * et rien ne bouge dans la liste avant la fin du délai.
 */
function useValidation(geste: (s: StatutArretColis | null) => Promise<boolean>) {
  const [fin, setFin] = useState<number | null>(null)
  const [reste, setReste] = useState(DELAI_VALIDATION_MS)
  const cible = useRef<StatutArretColis | null>(null)
  const dernier = useRef(geste)
  useEffect(() => { dernier.current = geste })
  useEffect(() => {
    if (fin == null) return
    const t = setInterval(() => {
      const r = fin - Date.now()
      if (r <= 0) { clearInterval(t); setFin(null); dernier.current(cible.current) } else setReste(r)
    }, 100)
    return () => clearInterval(t)
  }, [fin])
  const demander = (s: StatutArretColis | null) => { cible.current = s; setReste(DELAI_VALIDATION_MS); setFin(Date.now() + DELAI_VALIDATION_MS) }
  const annuler = () => setFin(null)
  return { enAttente: fin != null, reste, demander, annuler }
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
  const { occupe, fait, ecrire, geste } = useGestes(arret, tournee, onGeste)
  const { autres } = statutsProposes(arret.type)
  const [remis, setRemis] = useState(arret.colis_remis ?? Math.max(0, arret.quantite - 1))
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
    if (url) window.open(url, '_blank', 'noopener')
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
            <p className="text-base text-[var(--text-muted)]">{arret.commune} · {arret.quantite} colis{arret.type !== 'c' ? ` · ${LIBELLE_TYPE_ARRET[arret.type]}` : ''}</p>
            <HorairesRelais arret={arret} />
          </div>
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
          <div className="flex items-center gap-2 p-2 rounded-[var(--r-lg)] border border-[var(--border)]">
            <button type="button" aria-label="Un colis de moins" disabled={remis <= 0}
              onClick={() => setRemis(r => Math.max(0, r - 1))}
              className="size-14 shrink-0 inline-flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] text-[var(--text)]">
              <Minus size={22} />
            </button>
            <button type="button" disabled={occupe} onClick={() => faire(fait, remis)}
              className={`${MOYEN} flex-1 border-[var(--success)] text-[var(--success)]`}>
              Remis {remis} sur {arret.quantite}
            </button>
            <button type="button" aria-label="Un colis de plus" disabled={remis >= arret.quantite}
              onClick={() => setRemis(r => Math.min(arret.quantite, r + 1))}
              className="size-14 shrink-0 inline-flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border)] text-[var(--text)]">
              <Plus size={22} />
            </button>
          </div>
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
  const { occupe, fait, geste } = useGestes(arret, tournee, onGeste)
  const validation = useValidation(geste)
  const [fiche, setFiche] = useState(false)
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
                {arret.commune} · {arret.quantite} colis
                {arret.type !== 'c' && <strong style={{ color: COULEUR_CATEGORIE[arret.type] }}> · {LIBELLE_TYPE_ARRET[arret.type]}</strong>}
                {arret.note ? ` · ${arret.note}` : ''}
              </p>
              <HorairesRelais arret={arret} />
            </div>
            {yAller && (
              <a href={yAller} target="_blank" rel="noopener noreferrer"
                className="min-h-12 px-4 shrink-0 inline-flex items-center gap-2 rounded-[var(--r-lg)] border border-[var(--border)] text-base font-semibold text-[var(--text)]">
                <Navigation size={20} /> Y aller
              </a>
            )}
          </div>
          {validation.enAttente ? (
            <div className="flex gap-2">
              <div className={`${GROS} flex-[3] relative overflow-hidden bg-[var(--success)] text-black`} role="status" aria-live="polite">
                <span className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${Math.round((1 - validation.reste / DELAI_VALIDATION_MS) * 100)}%` }} aria-hidden />
                <span className="relative inline-flex items-center gap-2">
                  <Check size={24} /> {LIBELLE_FAIT[arret.type]} dans {Math.ceil(validation.reste / 1000)} s
                </span>
              </div>
              <button type="button" onClick={validation.annuler}
                className={`${GROS} flex-[2] border-2 border-[var(--danger)] text-[var(--danger)]`}>
                <X size={22} /> Annuler
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" disabled={occupe} onClick={() => validation.demander(fait)} className={`${GROS} flex-[3] bg-[var(--success)] text-black`}>
                <Check size={24} /> {LIBELLE_FAIT[arret.type]}
              </button>
              <button type="button" disabled={occupe} onClick={() => geste(rapide)}
                className={`${GROS} flex-[2] border border-[var(--warning)] text-[var(--warning)] text-base`}>
                {LIBELLE_STATUT_ARRET[rapide]}
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
  const { occupe, fait, geste } = useGestes(arret, tournee, onGeste)
  const validation = useValidation(geste)
  const famille = familleStatut(arret.statut)
  const numero = numeroAffiche(arret, modeOrdre(tournee))

  return (
    <li id={`arret-${arret.id}`} style={{ borderLeftColor: COULEUR_CATEGORIE[arret.type] }}
      className={`flex items-stretch gap-2 rounded-[var(--r-lg)] border border-l-[6px] bg-[var(--bg-card)] ${
      glisse ? 'border-[var(--brand)] shadow-lg' : arret.statut ? 'border-[var(--border)] opacity-80' : 'border-[var(--border-strong)]'}`}>
      {poignee && !verrouillee ? (
        <button type="button" {...poignee} aria-label="Glisser pour changer l'ordre"
          className="w-10 shrink-0 inline-flex flex-col items-center justify-center text-[var(--text-muted)] touch-none cursor-grab">
          <GripVertical size={18} />
          <span className="text-xs font-semibold tabular-nums">{numero ?? '–'}</span>
        </button>
      ) : (
        <span className="w-9 shrink-0 inline-flex items-center justify-center text-xs font-semibold tabular-nums text-[var(--text-muted)]">{numero ?? '–'}</span>
      )}
      <button type="button" onClick={() => setFiche(true)} disabled={verrouillee && photos.length === 0 && !arret.note}
        className="flex-1 min-w-0 min-h-16 py-2 text-left">
        <span className="block text-base font-semibold text-[var(--text)] break-words">{libelleAdresse(arret)}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-muted)]">
          <span>{arret.quantite} colis</span>
          {arret.type !== 'c' && (
            <span className="inline-flex items-center gap-1 font-semibold" style={{ color: COULEUR_CATEGORIE[arret.type] }}>
              {arret.type === 'rc' ? <Store size={14} /> : <PackagePlus size={14} />} {LIBELLE_TYPE_ARRET[arret.type]}
            </span>
          )}
          {arret.statut && famille && (
            <Badge color={COULEUR_FAMILLE[famille]}>
              {LIBELLE_STATUT_ARRET[arret.statut]}
              {famille === 'livre' && arret.colis_remis != null && arret.colis_remis < arret.quantite
                ? ` ${arret.colis_remis}/${arret.quantite}` : ''}
            </Badge>
          )}
          {photos.length > 0 && <span className="inline-flex items-center gap-1"><Camera size={13} /> {photos.length}</span>}
          {arret.note && <span className="inline-flex items-center gap-1"><MessageSquare size={13} /> {arret.note}</span>}
        </span>
      </button>
      {!verrouillee && !arret.statut && (validation.enAttente ? (
        <button type="button" onClick={validation.annuler}
          className="w-24 shrink-0 m-1.5 inline-flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] border-2 border-[var(--danger)] text-[var(--danger)] text-sm font-bold active:scale-[0.97]">
          <X size={20} /> Annuler {Math.ceil(validation.reste / 1000)}
        </button>
      ) : (
        <button type="button" onClick={() => validation.demander(fait)} disabled={occupe}
          className="w-24 shrink-0 m-1.5 inline-flex flex-col items-center justify-center gap-0.5 rounded-[var(--r-md)] bg-[var(--success)] text-black text-sm font-bold disabled:opacity-40 active:scale-[0.97]">
          <Check size={20} /> {arret.type === 'col' ? 'Collecté' : arret.type === 'rc' ? 'Remis' : 'Livré'}
        </button>
      ))}
      {fiche && !verrouillee && (
        <FicheArret arret={arret} tournee={tournee} onGeste={onGeste} photos={photos} onPhoto={onPhoto} onFermer={() => setFiche(false)} />
      )}
      {fiche && verrouillee && (
        <FichePhotos photos={photos} note={arret.note} onFermer={() => setFiche(false)} />
      )}
    </li>
  )
}

/** Tournée terminée : seulement les photos et la note, rien à modifier. */
function FichePhotos({ photos, note, onFermer }: { photos: DocumentRow[]; note: string | null; onFermer: () => void }) {
  const { toast } = useToast()
  const voir = async (doc: DocumentRow) => {
    const url = await urlPhotoArret(doc)
    if (url) window.open(url, '_blank', 'noopener')
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
