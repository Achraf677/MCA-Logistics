import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Navigation2, Check, Phone, Package, Camera, ShieldCheck, Paperclip, FileText, Image as ImageIcon } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { deposerTicket } from '../../shared/lib/receiptsInbox.queries'
import { uploadDocument, getDownloadUrl } from '../../shared/lib/documents.queries'
import { enregistrerPod } from '../../shared/lib/pod.queries'
import { canTransition } from '../../shared/lib/livraisonStatuts'
import { getMesCourses, avancerCourse, getDocumentsDesCourses } from './mescourses.queries'
import {
  bornesPeriode, decalerPeriode, libellePeriode,
  grouperParJour, estAFaire, resteAFaire,
  type ModePeriode,
} from './mescourses.logic'
import type { CourseChauffeur, DocumentCourse } from './mescourses.types'

const MODES: Array<{ key: ModePeriode; label: string }> = [
  { key: 'jour',    label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois',    label: 'Mois' },
]

const aujourdhui = () => new Date().toISOString().slice(0, 10)

/**
 * Écran chauffeur — « Mes courses ».
 *
 * Volontairement pauvre : une période, une liste d'arrêts, deux gestes par
 * arrêt (naviguer, marquer livré). Aucun montant n'est chargé (voir
 * mescourses.types.ts). Le filtrage par chauffeur est assuré par la policy RLS
 * `deliveries_select_own`, pas par cet écran.
 *
 * Pensé pour un téléphone tenu d'une main : cibles tactiles hautes, une colonne.
 */
export function MesCourses() {
  const { toast } = useToast()
  const [mode, setMode]     = useState<ModePeriode>('jour')
  const [ancre, setAncre]   = useState(aujourdhui)
  const [courses, setCourses] = useState<CourseChauffeur[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur]   = useState<string | null>(null)
  const [busyId, setBusyId]   = useState<string | null>(null)
  // Documents regroupés par course. Chargés à part des courses : ils ne
  // conditionnent pas l'affichage de la liste, qui doit s'afficher tout de
  // suite même si le réseau traîne sur les pièces jointes.
  const [documents, setDocuments] = useState<Map<string, DocumentCourse[]>>(new Map())

  const { debut, fin } = bornesPeriode(ancre, mode)

  const charger = useCallback(async () => {
    setLoading(true); setErreur(null)
    const { data, error } = await getMesCourses(debut, fin)
    if (error) { setErreur(error.message); setCourses([]) }
    else setCourses(data ?? [])
    setLoading(false)
  }, [debut, fin])

  useEffect(() => { charger() }, [charger])

  useEffect(() => {
    if (courses.length === 0) { setDocuments(new Map()); return }
    let annule = false
    getDocumentsDesCourses(courses.map(c => c.id)).then(({ data }) => {
      if (annule) return
      const par = new Map<string, DocumentCourse[]>()
      for (const d of (data ?? []) as DocumentCourse[]) {
        const liste = par.get(d.entity_id) ?? []
        liste.push(d)
        par.set(d.entity_id, liste)
      }
      setDocuments(par)
    })
    return () => { annule = true }
  }, [courses])

  const groupes = grouperParJour(courses)
  const { reste, total } = resteAFaire(courses)

  /**
   * Un chauffeur ne peut qu'AVANCER une course : démarrer, puis livrer. La
   * machine à états reste la référence unique (`canTransition`) — on ne
   * réimplémente pas les règles ici.
   */
  const demarrer = async (c: CourseChauffeur) => {
    if (!canTransition(c.statut, 'en_cours')) {
      toast(`Passage ${c.statut} → en_cours impossible`, 'error'); return
    }
    setBusyId(c.id)
    const { error } = await avancerCourse(c.id, 'en_cours')
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Course démarrée')
    await charger()
  }

  /**
   * Clôture d'une course, avec ou sans preuve.
   *
   * L'ORDRE COMPTE : on écrit la preuve AVANT de passer en `livree`. Si
   * l'enregistrement de la preuve échoue, la course reste `en_cours` et le
   * chauffeur peut réessayer. L'inverse — livrer d'abord, enregistrer
   * ensuite — laisserait des courses livrées sans preuve alors que le
   * chauffeur croit avoir tout fait.
   *
   * `recipient` à `null` = livraison sans preuve, volontairement autorisée :
   * un chauffeur n'a pas toujours quelqu'un pour signer ni du réseau. Ces
   * courses ressortent ensuite dans l'alerte « livraison sans justificatif »,
   * qui existe exactement pour ça.
   */
  const livrer = async (c: CourseChauffeur, recipient: string | null) => {
    if (!canTransition(c.statut, 'livree')) {
      toast(`Passage ${c.statut} → livree impossible`, 'error'); return
    }
    setBusyId(c.id)
    if (recipient) {
      const { error } = await enregistrerPod(c.id, recipient)
      if (error) { setBusyId(null); toast(error.message, 'error'); return }
    }
    const { error } = await avancerCourse(c.id, 'livree')
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(recipient ? 'Livrée, preuve enregistrée' : 'Course livrée')
    await charger()
  }

  return (
    <Shell pageTitle="Mes courses">
      {/* Sélecteur de période — collé en haut, toujours atteignable au pouce */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-1 p-1 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
          {MODES.map(m => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 min-h-[40px] rounded-[var(--r-md)] text-[var(--fs-sm)] font-medium transition-colors ${
                mode === m.key
                  ? 'bg-[var(--brand)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setAncre(a => decalerPeriode(a, mode, -1))}
            aria-label="Période précédente"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex-1 text-center">
            <span className="block text-[var(--fs-sm)] font-medium text-[var(--text)] first-letter:uppercase">
              {libellePeriode(ancre, mode)}
            </span>
            {!loading && (
              <span className="block text-[var(--fs-xs)] text-[var(--text-muted)]">
                {total === 0
                  ? 'aucune course'
                  : `${reste} restante${reste > 1 ? 's' : ''} sur ${total}`}
              </span>
            )}
          </div>

          <button
            onClick={() => setAncre(a => decalerPeriode(a, mode, 1))}
            aria-label="Période suivante"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {ancre !== aujourdhui() && (
          <button
            onClick={() => setAncre(aujourdhui())}
            className="self-center text-[var(--fs-xs)] text-[var(--brand)] underline min-h-[32px]"
          >
            Revenir à aujourd'hui
          </button>
        )}
      </div>

      <ScannerTicket />

      {erreur && (
        <p className="mb-4 text-[var(--fs-sm)] text-[var(--danger)]">{erreur}</p>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title="Aucune course sur cette période"
          description="Change de période avec les flèches, ou reviens à aujourd'hui."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groupes.map(([jour, duJour]) => (
            <section key={jour} className="flex flex-col gap-2">
              {/* En-tête de jour : inutile en mode « jour », le titre le dit déjà */}
              {mode !== 'jour' && (
                <h2 className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide first-letter:uppercase">
                  {libellePeriode(jour, 'jour')}
                </h2>
              )}

              {duJour.map(c => (
                <CarteCourse
                  key={c.id}
                  course={c}
                  busy={busyId === c.id}
                  documents={documents.get(c.id) ?? []}
                  onDemarrer={() => demarrer(c)}
                  onLivrer={recipient => livrer(c, recipient)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </Shell>
  )
}

function CarteCourse({
  course: c, busy, documents, onDemarrer, onLivrer,
}: {
  course: CourseChauffeur
  busy: boolean
  documents: DocumentCourse[]
  onDemarrer: () => void
  onLivrer: (recipient: string | null) => void
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const aFaire = estAFaire(c.statut)
  const geo = c.delivery_lat != null && c.delivery_lng != null

  // Panneau de preuve, replie par defaut : il ne s'ouvre qu'au moment ou le
  // chauffeur annonce la livraison, pour ne pas alourdir la liste.
  const [preuveOuverte, setPreuveOuverte] = useState(false)
  const [recipient, setRecipient]         = useState('')
  const [photoEnvoi, setPhotoEnvoi]       = useState(false)
  const [photoOk, setPhotoOk]             = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  /**
   * La photo part DES QU'ELLE EST PRISE, sans attendre la validation.
   * Raison de terrain : le reseau est mauvais au bord de la route. En
   * televersant tout de suite, l'attente se place pendant que le chauffeur
   * tape le nom du receptionnaire, et pas apres, quand il a deja range son
   * telephone. La photo est un document ordinaire de categorie « POD » —
   * exactement ce que depose le tiroir Livraisons cote bureau.
   */
  const prendrePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !companyId) return
    if (!file.type.startsWith('image/')) {
      toast('Seules les photos sont acceptées comme preuve', 'error'); return
    }
    setPhotoEnvoi(true)
    const { error } = await uploadDocument(file, companyId, {
      entity_type: 'delivery', entity_id: c.id, category: 'POD',
    })
    setPhotoEnvoi(false)
    if (error) {
      // Le refus le plus probable n'est pas technique : un compte chauffeur
      // n'a pas, par defaut, le droit « Documents / creer ». Le message brut
      // de Postgres ne dit rien d'utile a quelqu'un au bord de la route, donc
      // on le traduit — et on rappelle que la livraison reste possible sans
      // photo.
      const refus = /row-level security|permission|policy/i.test(error.message)
      toast(refus
        ? "Ton compte n'a pas le droit d'ajouter des photos. Préviens la gestion — tu peux livrer sans preuve en attendant."
        : error.message, 'error')
      return
    }
    setPhotoOk(true)
    toast('Photo enregistrée')
  }

  return (
    <article className={`rounded-[var(--r-lg)] border border-[var(--border)] p-4 flex flex-col gap-3 ${
      aFaire ? '' : 'opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-[var(--text)] truncate">{c.clients?.name ?? '—'}</p>
          {c.delivery_address && (
            <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">{c.delivery_address}</p>
          )}
        </div>
        <Badge color={aFaire ? 'warning' : 'success'}>
          {c.statut === 'planifiee' ? 'À faire'
            : c.statut === 'en_cours' ? 'En cours'
            : 'Livrée'}
        </Badge>
      </div>

      {(c.description || c.weight_kg != null || c.vehicles) && (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
          {[
            c.description,
            c.weight_kg != null ? `${c.weight_kg} kg` : null,
            c.vehicles ? `${c.vehicles.label} (${c.vehicles.plate})` : null,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* Pièces jointes de la course. Placées AVANT les boutons d'action : on
          les consulte en préparant la course, pas après l'avoir close. */}
      {documents.length > 0 && <PiecesJointes documents={documents} />}

      <div className="flex items-center gap-2 flex-wrap">
        {geo && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${c.delivery_lat},${c.delivery_lng}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors"
          >
            <Navigation2 size={15} /> Naviguer
          </a>
        )}

        {c.clients?.phone && (
          <a
            href={`tel:${c.clients.phone}`}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[var(--r-md)]
              border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]
              hover:border-[var(--brand)] transition-colors"
          >
            <Phone size={15} /> Appeler
          </a>
        )}

        {c.statut === 'planifiee' && (
          <Button variant="primary" className="min-h-[44px] ml-auto"
                  onClick={onDemarrer} disabled={busy}>
            {busy ? '…' : 'Démarrer'}
          </Button>
        )}

        {c.statut === 'en_cours' && !preuveOuverte && (
          <Button variant="primary" className="min-h-[44px] ml-auto"
                  onClick={() => setPreuveOuverte(true)} disabled={busy}>
            <span className="inline-flex items-center gap-1.5"><Check size={15} /> Livré</span>
          </Button>
        )}

        {/* Preuve deja enregistree : on le dit, sinon le chauffeur refait
            la photo « au cas ou » a chaque ouverture de l'ecran. */}
        {!aFaire && c.pod_captured_at && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--success)]">
            <ShieldCheck size={14} /> Preuve enregistrée
          </span>
        )}
      </div>

      {/* La condition sur le statut n'est pas redondante : apres validation, le
          parent recharge mais ne remonte PAS cette carte (meme `key`), donc
          `preuveOuverte` reste a true. Sans ce garde, le panneau resterait
          ouvert sous une course deja livree. */}
      {preuveOuverte && c.statut === 'en_cours' && (
        <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] p-3 anim-sheet">
          <input ref={photoRef} type="file" accept="image/*" capture="environment"
                 className="hidden" onChange={prendrePhoto} />

          <Button variant={photoOk ? 'secondary' : 'primary'} className="min-h-[44px]"
                  onClick={() => photoRef.current?.click()} disabled={photoEnvoi || busy}>
            <span className="inline-flex items-center gap-1.5">
              {photoOk ? <Check size={15} /> : <Camera size={15} />}
              {photoEnvoi ? 'Envoi…' : photoOk ? 'Photo enregistrée — en reprendre une' : 'Photo de la livraison'}
            </span>
          </Button>

          <input
            type="text" value={recipient} onChange={e => setRecipient(e.target.value)}
            placeholder="Qui a réceptionné ? (nom)"
            className="field min-h-[44px] h-auto"
          />

          <Button variant="primary" className="min-h-[44px]"
                  onClick={() => onLivrer(recipient.trim() || null)}
                  disabled={busy || photoEnvoi || !recipient.trim()}>
            {busy ? '…' : 'Valider la livraison'}
          </Button>

          {/* Sortie de secours assumee : pas de receptionnaire, pas de reseau,
              pas de temps. La course ressort ensuite dans l'alerte
              « livraison sans justificatif » cote gestion. */}
          <button
            onClick={() => onLivrer(null)}
            disabled={busy || photoEnvoi}
            className="min-h-[44px] text-[var(--fs-xs)] text-[var(--text-muted)]
              hover:text-[var(--text)] transition-colors disabled:opacity-40"
          >
            Livrer sans preuve
          </button>
        </div>
      )}
    </article>
  )
}

/**
 * Dépôt d'un ticket photographié (péage, plein, pièce détachée…).
 *
 * `capture="environment"` ouvre directement l'appareil photo arrière sur
 * téléphone, au lieu du sélecteur de fichiers : c'est le geste attendu au bord
 * de la route. Sur ordinateur, l'attribut est ignoré et on retombe sur le
 * sélecteur habituel.
 */
function ScannerTicket() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [ouvert, setOuvert] = useState(false)

  const choisir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de reprendre le même fichier après une erreur
    if (!file || !companyId) return

    setEnvoi(true)
    const { error } = await deposerTicket(file, companyId, note)
    setEnvoi(false)
    if (error) { toast(error.message, 'error'); return }

    setNote('')
    setOuvert(false)
    toast('Ticket envoyé — il apparaît côté gestion')
  }

  return (
    <div className="mb-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border)] p-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={choisir}
      />

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 text-[var(--fs-sm)]
            text-[var(--text-muted)] hover:text-[var(--brand)] transition-colors"
        >
          <Camera size={16} /> Scanner un ticket
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="De quoi s'agit-il ? (péage A35, plein Movano…)"
            className="w-full min-h-[44px] px-3 rounded-[var(--r-md)] bg-[var(--bg)]
              border border-[var(--border)] text-[var(--text)] text-[var(--fs-sm)]
              focus:outline-none focus:border-[var(--brand)]"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1 min-h-[44px]"
              onClick={() => inputRef.current?.click()}
              disabled={envoi}
            >
              {envoi ? 'Envoi…' : 'Prendre la photo'}
            </Button>
            <Button
              variant="secondary"
              className="min-h-[44px]"
              onClick={() => { setOuvert(false); setNote('') }}
              disabled={envoi}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Pièces jointes d'une course, ouvrables depuis le téléphone.
 *
 * Ce que le chauffeur avait demandé : retrouver sur le terrain les documents
 * déposés depuis le bureau — bon de commande, étiquette, consignes du client —
 * plus les photos de preuve déjà prises. Ils existaient en base et n'étaient
 * visibles que dans le grand tiroir de gestion.
 *
 * L'URL est signée AU MOMENT DU CLIC, pas au chargement de la liste : une URL
 * signée expire au bout d'une heure, et en signer vingt d'avance pour n'en
 * ouvrir aucune serait à la fois lent et inutile.
 */
function PiecesJointes({ documents }: { documents: DocumentCourse[] }) {
  const { toast } = useToast()
  const [ouverture, setOuverture] = useState<string | null>(null)

  const ouvrir = async (d: DocumentCourse) => {
    setOuverture(d.id)
    const url = await getDownloadUrl(d as never)
    setOuverture(null)
    if (!url) {
      toast("Ce fichier est introuvable — il n'a peut-être pas encore été rapatrié.", 'error')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)]">
        <Paperclip size={13} />
        {documents.length > 1 ? `${documents.length} documents` : '1 document'}
      </span>

      <div className="flex flex-col gap-1">
        {documents.map(d => {
          const estImage = (d.mime_type ?? '').startsWith('image/')
          return (
            <button
              key={d.id}
              onClick={() => ouvrir(d)}
              disabled={ouverture === d.id}
              className="flex items-center gap-2 min-h-[44px] px-3 rounded-[var(--r-md)] text-left
                border border-[var(--border)] bg-[var(--bg-deep)]
                hover:border-[var(--brand)] transition-colors disabled:opacity-50"
            >
              <span className="text-[var(--text-disabled)] shrink-0">
                {estImage ? <ImageIcon size={15} /> : <FileText size={15} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[var(--fs-sm)] text-[var(--text)] truncate">{d.file_name}</span>
                {d.category && (
                  <span className="block text-[var(--fs-xs)] text-[var(--text-disabled)]">{d.category}</span>
                )}
              </span>
              {ouverture === d.id && (
                <span className="text-[var(--fs-xs)] text-[var(--text-muted)] shrink-0">Ouverture…</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
