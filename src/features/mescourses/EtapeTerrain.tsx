import { useState, useRef, useEffect } from 'react'
import { Camera, Check, PenLine, ChevronLeft, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { uploadDocument, deleteDocument } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import type { DocumentCategory } from '../../shared/lib/documents.types'
import { messageEnvoiPhoto } from './mescourses.logic'
import { aUnePreuve } from './etapes.logic'

type Role = 'expediteur' | 'destinataire'

interface Props {
  courseId: string
  role: Role
  /** Nom déjà connu (saisi au bureau) : sert de valeur de départ. */
  nomConnu: string | null
  busy: boolean
  /** Valide l'étape. `null` = l'utilisateur passe sans preuve. */
  onValider: (nom: string | null, preuve: boolean) => void
  onAnnuler: () => void
}

/**
 * Le parcours de terrain, UNE ETAPE A LA FOIS.
 *
 * Tout etait auparavant empile sur un seul panneau : photo, nom et
 * validation ensemble. Sur un telephone tenu d'une main, au bord de la route,
 * cela fait un mur de boutons ou l'on ne sait pas par quoi commencer ni ce qui
 * reste a faire. Chaque geste a maintenant son ecran, et un compteur dit ou
 * l'on en est.
 *
 * Le chargement et la livraison ne partagent que cette mecanique : ce sont
 * deux moments distincts, a deux endroits, devant deux personnes. Le titre, la
 * question posee et la categorie de la photo different —
 * et les deux ne se melangent jamais dans un meme passage.
 */
const CONFIG: Record<Role, {
  titre: string
  question: string
  categorie: DocumentCategory
  actionFinale: string
}> = {
  expediteur: {
    titre: 'Chargement',
    question: 'Qui remet la marchandise ?',
    categorie: 'Chargement',
    actionFinale: 'Charger',
  },
  destinataire: {
    titre: 'Livraison',
    question: 'Qui réceptionne ?',
    categorie: 'POD',
    actionFinale: 'Livrer',
  },
}

type CleEtape = 'photo' | 'nom' | 'recap'

export function EtapeTerrain({
  courseId, role, nomConnu,
  busy, onValider, onAnnuler,
}: Props) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const cfg = CONFIG[role]

  const [nom, setNom]               = useState(nomConnu ?? '')
  const [photoEnvoi, setPhotoEnvoi] = useState(false)
  /**
   * Les photos prises A CETTE ETAPE, avec leur apercu local.
   *
   * Une liste et non un booleen : un hayon abime, une palette filmee et le bon
   * de livraison, c'est trois photos, pas une. Et l'apercu vient de
   * `URL.createObjectURL`, pas d'une URL signee : le fichier est deja dans le
   * telephone, aller le redemander au serveur ferait attendre pour rien au
   * bord de la route.
   */
  const [photos, setPhotos] = useState<Array<{ doc: DocumentRow; apercu: string }>>([])
  const [suppressionId, setSuppressionId] = useState<string | null>(null)
  const [index, setIndex]           = useState(0)
  const photoRef = useRef<HTMLInputElement>(null)

  /**
   * Libere les apercus quand le panneau se ferme.
   *
   * Chaque `createObjectURL` retient la photo entiere en memoire jusqu'au
   * rechargement de la page. Sur une journee de vingt arrets, cela finit par
   * peser sur un telephone — et c'est exactement l'appareil qui a le moins de
   * marge. La ref suit la liste courante : la fermeture ne voit sinon que le
   * tableau vide du premier rendu.
   */
  const apercusRef = useRef<string[]>([])
  useEffect(() => { apercusRef.current = photos.map(p => p.apercu) }, [photos])
  useEffect(() => () => { apercusRef.current.forEach(URL.revokeObjectURL) }, [])

  const etapes: CleEtape[] = ['photo', 'nom', 'recap']
  const etape = etapes[Math.min(index, etapes.length - 1)]
  const dernier = index >= etapes.length - 1

  const suivant = () => setIndex(i => Math.min(i + 1, etapes.length - 1))
  const precedent = () => setIndex(i => Math.max(i - 1, 0))

  /**
   * La photo part DES QU'ELLE EST PRISE, sans attendre la fin du parcours.
   * Au bord de la route le reseau est mauvais : l'attente se place pendant que
   * le chauffeur passe a l'etape suivante, pas a la fin, quand il a deja range
   * son telephone.
   */
  const prendrePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !companyId) return
    if (!file.type.startsWith('image/')) { toast('Seules les photos sont acceptées', 'error'); return }

    setPhotoEnvoi(true)
    const { data, error } = await uploadDocument(file, companyId, {
      entity_type: 'delivery', entity_id: courseId, category: cfg.categorie,
    })
    setPhotoEnvoi(false)
    if (error || !data) { toast(messageEnvoiPhoto(error?.message), 'error'); return }
    setPhotos(p => [...p, { doc: data, apercu: URL.createObjectURL(file) }])
    // On NE PASSE PAS a l'etape suivante : le chauffeur en prend souvent
    // plusieurs, et avancer tout seul l'obligerait a revenir en arriere a
    // chaque cliche.
  }

  /**
   * Retire une photo, du stockage ET de la base.
   *
   * Pas seulement de l'ecran : une photo ratee laissee en base ressortirait
   * dans les pieces jointes de la course, et compterait comme justificatif
   * alors qu'elle ne montre rien.
   */
  const retirerPhoto = async (doc: DocumentRow, apercu: string) => {
    setSuppressionId(doc.id)
    const { error } = await deleteDocument(doc)
    setSuppressionId(null)
    if (error) { toast(error.message, 'error'); return }
    URL.revokeObjectURL(apercu)
    setPhotos(p => p.filter(x => x.doc.id !== doc.id))
  }

  /**
   * Valide l'étape en disant au parent s'il existe une preuve : un nom ou une
   * photo. Sans nom, une livraison photographiée doit quand même être
   * horodatée (`pod_captured_at`).
   */
  const valider = () => {
    const n = nom.trim() || null
    onValider(n, aUnePreuve({ nom: n, photos: photos.length }))
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] p-3 anim-sheet">
      {/* En-tete : ou l'on est, et combien il reste. */}
      <div className="flex items-center gap-2">
        {index > 0 && (
          <button onClick={precedent} aria-label="Étape précédente" disabled={busy}
            className="p-1.5 -ml-1 rounded-[var(--r-md)] text-[var(--text-muted)] hover:text-[var(--text)]">
            <ChevronLeft size={16} />
          </button>
        )}
        <span className="text-xs font-semibold text-[var(--text)] uppercase tracking-wide">
          {cfg.titre}
        </span>
        <span className="ml-auto text-xs text-[var(--text-muted)] font-mono">
          {index + 1}/{etapes.length}
        </span>
      </div>

      <input ref={photoRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={prendrePhoto} />

      {etape === 'photo' && (
        <>
          {/* Les photos deja prises, avec de quoi en retirer une. Un cliche
              flou ou pris par erreur doit pouvoir partir TOUT DE SUITE :
              constate au bureau trois jours plus tard, il ne prouve plus rien
              et personne ne retournera le refaire. */}
          {photos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {photos.map(({ doc, apercu }) => (
                <li key={doc.id} className="relative">
                  <img src={apercu} alt={doc.file_name}
                       className="w-20 h-20 object-cover rounded-[var(--r-md)] border border-[var(--border)]" />
                  <button
                    type="button"
                    onClick={() => retirerPhoto(doc, apercu)}
                    disabled={suppressionId === doc.id || busy}
                    aria-label={`Retirer la photo ${doc.file_name}`}
                    className="absolute -top-1.5 -right-1.5 w-7 h-7 flex items-center justify-center
                      rounded-full bg-[var(--danger)] text-white shadow
                      disabled:opacity-50"
                  >
                    {suppressionId === doc.id ? '…' : <X size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button variant={photos.length > 0 ? 'secondary' : 'primary'} className="min-h-12"
                  onClick={() => photoRef.current?.click()} disabled={photoEnvoi || busy}>
            <span className="inline-flex items-center gap-1.5">
              <Camera size={16} />
              {photoEnvoi ? 'Envoi…' : photos.length > 0 ? 'Ajouter une photo' : 'Photo'}
            </span>
          </Button>

          {photos.length > 0 ? (
            <Button variant="primary" className="min-h-12" onClick={suivant} disabled={photoEnvoi || busy}>
              Suivant
            </Button>
          ) : (
            <BoutonPasser onClick={suivant} disabled={photoEnvoi || busy} />
          )}
        </>
      )}

      {etape === 'nom' && (
        <>
          <input type="text" value={nom} onChange={e => setNom(e.target.value)} autoFocus
                 placeholder={cfg.question} className="field min-h-12 h-auto" />
          <Button variant="primary" className="min-h-12" onClick={suivant} disabled={busy}>
            Suivant
          </Button>
        </>
      )}

      {etape === 'recap' && (
        <>
          <ul className="flex flex-col gap-1">
            <LigneRecap fait={photos.length > 0}
              texte={photos.length > 1 ? `${photos.length} photos` : 'Photo'} />
            <LigneRecap fait={!!nom.trim()} texte={nom.trim() || 'Nom non renseigné'} />
          </ul>
          <Button variant="primary" className="min-h-12"
                  onClick={valider} disabled={busy || photoEnvoi}>
            {busy ? '…' : cfg.actionFinale}
          </Button>
        </>
      )}

      {/* Sortie de secours assumee, atteignable a tout moment : pas
          d'interlocuteur, pas de reseau, pas de temps. Ces courses ressortent
          ensuite dans l'alerte « sans justificatif » cote gestion, et au moment
          de facturer — qui existent exactement pour ca. */}
      <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
        {!dernier && (
          <button onClick={valider} disabled={busy || photoEnvoi}
            className="flex-1 min-h-11 text-xs text-[var(--text-muted)]
              hover:text-[var(--text)] transition-colors disabled:opacity-40">
            {cfg.actionFinale} sans preuve
          </button>
        )}
        <button onClick={onAnnuler} disabled={busy}
          className="min-h-11 px-3 text-xs text-[var(--text-muted)]
            hover:text-[var(--text)] transition-colors disabled:opacity-40">
          Annuler
        </button>
      </div>
    </div>
  )
}

/** « Passer » : chaque preuve est souhaitable, aucune n'est obligatoire. */
function BoutonPasser({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="min-h-11 text-sm text-[var(--text-muted)]
        hover:text-[var(--text)] transition-colors disabled:opacity-40">
      Passer
    </button>
  )
}

function LigneRecap({ fait, texte }: { fait: boolean; texte: string }) {
  return (
    <li className={`flex items-center gap-2 text-sm ${
      fait ? 'text-[var(--text)]' : 'text-[var(--text-disabled)]'
    }`}>
      {fait
        ? <Check size={15} className="text-[var(--success)] shrink-0" />
        : <PenLine size={15} className="shrink-0 opacity-40" />}
      <span className="truncate">{texte}</span>
    </li>
  )
}
