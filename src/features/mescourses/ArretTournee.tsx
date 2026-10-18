import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Check, MoreHorizontal, Store, PackagePlus, RotateCcw, MessageSquare, Navigation, Camera, GripVertical, Clock,
} from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { LIBELLE_STATUT_ARRET, LIBELLE_TYPE_ARRET, type ArretColis, type StatutArretColis, type TourneeColis } from '../../shared/lib/tourneesColis'
import { heurePassage, numeroAffiche, modeOrdre } from '../../shared/lib/tourneesColisRoute'
import { majArret, ajouterPhotoArret, urlPhotoArret } from '../../shared/lib/tourneesColis.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { lienNavigation } from '../../shared/lib/navigation'
import { lireAppNavigation } from '../../shared/lib/prefChauffeur'
import { statutsProposes, libelleAdresse, lireColisRemis, patchStatut, familleStatut } from './tourneeColis.logic'
import { champCls, boutonSecondaireCls } from './EspaceCommun'

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

/**
 * Un arrêt : « Livré » en un geste, le reste dans le panneau (autres issues, colis remis,
 * note, photo de preuve, Y aller). Même composant dans la liste, la carte et « Prochain arrêt ».
 */
export function ArretTournee({ arret, tournee, verrouillee, onGeste, photos = [], onPhoto, enAvant, poignee, glisse }: {
  arret: ArretColis
  tournee: TourneeColis
  verrouillee: boolean
  onGeste: (a: ArretColis) => void
  photos?: DocumentRow[]
  onPhoto?: (arretId: string, doc: DocumentRow) => void
  /** Carte « Prochain arrêt » : plus grand, Y aller en clair. */
  enAvant?: boolean
  /** Glisser-déposer (ordre manuel). */
  poignee?: PoigneeProps
  glisse?: boolean
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const [ouvert, setOuvert] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [remis, setRemis] = useState(String(arret.colis_remis ?? arret.quantite))
  const [note, setNote] = useState(arret.note ?? '')
  const photoRef = useRef<HTMLInputElement>(null)
  const { fait, autres } = statutsProposes(arret.type)
  const famille = familleStatut(arret.statut)
  const mode = modeOrdre(tournee)
  const numero = numeroAffiche(arret, mode)
  // Heures du dernier calcul : fausses dès que l'ordre est changé à la main.
  const heure = !arret.statut && mode === 'route' ? heurePassage(tournee, arret.eta_min) : null
  const yAller = lienYAller(arret)

  const ecrire = async (patch: Parameters<typeof majArret>[1], fermer = true) => {
    setOccupe(true)
    const { data, error } = await majArret(arret, patch, tournee)
    setOccupe(false)
    if (error || !data) { toast(error?.message ?? 'Enregistrement impossible', 'error'); return }
    onGeste(data)
    setRemis(String(data.colis_remis ?? data.quantite)); setNote(data.note ?? '')
    if (fermer) setOuvert(false)
  }

  const geste = (s: StatutArretColis | null, colis?: number | null) => ecrire(patchStatut(arret, s, colis))

  const livrerPartiel = () => {
    const n = lireColisRemis(remis, arret.quantite)
    if (n == null) { toast('Nombre de colis remis invalide', 'error'); return }
    geste(fait, n)
  }

  const prendrePhoto = async (f: File | undefined) => {
    if (!f || !companyId) return
    setOccupe(true)
    const { data, error } = await ajouterPhotoArret(f, companyId, arret.id)
    setOccupe(false)
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
    <li id={`arret-${arret.id}`} className={`flex flex-col gap-2 p-3 rounded-[var(--r-lg)] border bg-[var(--bg-card)] ${
      glisse ? 'border-[var(--brand)] shadow-lg' : enAvant ? 'border-[var(--brand)]' : arret.statut ? 'border-[var(--border)] opacity-80' : 'border-[var(--border-strong)]'}`}>
      <div className="flex items-center gap-3">
        {poignee && !verrouillee ? (
          <button type="button" {...poignee} aria-label="Glisser pour changer l'ordre"
            className="w-8 -ml-1 shrink-0 self-stretch inline-flex flex-col items-center justify-center text-[var(--text-muted)] touch-none cursor-grab">
            <GripVertical size={18} />
            <span className="text-xs font-semibold tabular-nums">{numero ?? '–'}</span>
          </button>
        ) : (
          <span className="w-7 shrink-0 text-xs font-semibold tabular-nums text-[var(--text-muted)]">{numero ?? '–'}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`${enAvant ? 'text-lg' : 'text-base'} font-semibold text-[var(--text)] break-words`}>{libelleAdresse(arret)}</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
            {enAvant && <span>{arret.commune}</span>}
            <span>{arret.quantite} colis</span>
            {arret.type !== 'c' && (
              <span className="inline-flex items-center gap-1">
                {arret.type === 'rc' ? <Store size={13} /> : <PackagePlus size={13} />} {LIBELLE_TYPE_ARRET[arret.type]}
              </span>
            )}
            {heure && <span className="inline-flex items-center gap-1"><Clock size={12} /> ~{heure}</span>}
            {arret.statut && famille && (
              <Badge color={COULEUR_FAMILLE[famille]}>
                {LIBELLE_STATUT_ARRET[arret.statut]}
                {famille === 'livre' && arret.colis_remis != null && arret.colis_remis < arret.quantite
                  ? ` ${arret.colis_remis}/${arret.quantite}` : ''}
              </Badge>
            )}
            {photos.length > 0 && <span className="inline-flex items-center gap-1"><Camera size={12} /> {photos.length}</span>}
            {arret.note && <span className="inline-flex items-center gap-1"><MessageSquare size={12} /> {arret.note}</span>}
          </p>
        </div>
        {!verrouillee && !arret.statut && (
          <button type="button" onClick={() => geste(fait)} disabled={occupe}
            className="min-h-12 px-4 shrink-0 inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-[var(--success)] text-black text-sm font-semibold disabled:opacity-40">
            <Check size={18} /> {arret.type === 'col' ? 'Collecté' : arret.type === 'rc' ? 'Remis' : 'Livré'}
          </button>
        )}
        {!verrouillee && (
          <BoutonIcone icone={MoreHorizontal} libelle={ouvert ? 'Fermer' : 'Autres issues'} actif={ouvert}
            onClick={() => setOuvert(o => !o)} />
        )}
      </div>

      {enAvant && yAller && !verrouillee && (
        <a href={yAller} target="_blank" rel="noopener noreferrer" className={`${boutonSecondaireCls} w-full`}>
          <Navigation size={16} /> Y aller
        </a>
      )}

      {verrouillee && photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <button key={p.id} type="button" onClick={() => voirPhoto(p)}
              className="min-h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] text-sm text-[var(--text)] underline">
              Voir la photo {i + 1}
            </button>
          ))}
        </div>
      )}

      {ouvert && !verrouillee && (
        <div className="flex flex-col gap-3 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-wrap gap-2">
            {autres.map(s => (
              <button key={s} type="button" onClick={() => geste(s)} disabled={occupe}
                aria-pressed={arret.statut === s}
                className={`min-h-11 px-3 rounded-[var(--r-md)] border text-sm font-medium disabled:opacity-40 ${
                  arret.statut === s ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                {LIBELLE_STATUT_ARRET[s]}
              </button>
            ))}
          </div>

          {arret.quantite > 1 && (
            <div className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-[var(--text)]">
                Colis remis
                <input type="text" inputMode="numeric" value={remis} aria-label="Colis remis"
                  onChange={e => setRemis(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  className={`${champCls} w-24 text-center`} />
              </label>
              <span className="pb-3 text-sm text-[var(--text-muted)]">/ {arret.quantite}</span>
              <button type="button" onClick={livrerPartiel} disabled={occupe} className={`${boutonSecondaireCls} flex-1`}>
                <Check size={16} /> {LIBELLE_STATUT_ARRET[fait]} (partiel)
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <label className="flex-1 flex flex-col gap-1 text-sm font-medium text-[var(--text)]">
              Note
              <input value={note} onChange={e => setNote(e.target.value.slice(0, 300))}
                placeholder="Code, étage, voisin…" className={champCls} />
            </label>
            <button type="button" disabled={occupe || note.trim() === (arret.note ?? '')}
              onClick={() => ecrire({ note: note.trim() || null }, false)} className={boutonSecondaireCls}>
              Enregistrer
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => photoRef.current?.click()} disabled={occupe} className={`${boutonSecondaireCls} flex-1`}>
              <Camera size={16} /> Photo de preuve
            </button>
            {yAller && !enAvant && (
              <a href={yAller} target="_blank" rel="noopener noreferrer" className={`${boutonSecondaireCls} flex-1`}>
                <Navigation size={16} /> Y aller
              </a>
            )}
            <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => prendrePhoto(e.target.files?.[0])} />
          </div>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <button key={p.id} type="button" onClick={() => voirPhoto(p)}
                  className="min-h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] text-sm text-[var(--text)] underline">
                  Voir la photo {i + 1}
                </button>
              ))}
            </div>
          )}

          {arret.statut && (
            <button type="button" onClick={() => geste(null)} disabled={occupe}
              className="self-start min-h-10 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] underline">
              <RotateCcw size={14} /> Effacer le statut
            </button>
          )}
        </div>
      )}
    </li>
  )
}
