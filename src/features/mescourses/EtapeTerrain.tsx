import { useState, useRef } from 'react'
import { Camera, Check, PenLine } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { SignaturePad, tryGeoloc } from '../../shared/ui/SignaturePad'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { uploadDocument } from '../../shared/lib/documents.queries'
import type { DocumentCategory } from '../../shared/lib/documents.types'
import { ajouterSignature } from './mescourses.queries'

type Role = 'expediteur' | 'destinataire'

interface Props {
  courseId: string
  role: Role
  /** Nom déjà connu (saisi au bureau) : sert de valeur de départ. */
  nomConnu: string | null
  /** Signature déjà prise, pour ne pas la redemander. */
  dejaSignee: boolean
  busy: boolean
  /** Valide l'étape. `null` = l'utilisateur passe sans preuve. */
  onValider: (nom: string | null) => void
  onAnnuler: () => void
}

/**
 * Le panneau d'une etape de terrain : photo, nom, signature.
 *
 * UN SEUL composant pour le chargement ET la livraison, parce que les deux
 * gestes sont structurellement identiques — on photographie, on note qui est
 * en face, on fait signer. Les ecrire deux fois aurait garanti qu'ils
 * divergent : une correction appliquee d'un cote et pas de l'autre.
 *
 * Ce qui change entre les deux roles tient en trois mots : le titre, la
 * categorie du document, et la cle de signature dans la lettre de voiture.
 */
const CONFIG: Record<Role, { titre: string; question: string; categorie: DocumentCategory; labelSignature: string }> = {
  expediteur: {
    titre: 'Chargement',
    question: 'Qui remet la marchandise ?',
    categorie: 'Chargement',
    labelSignature: "Signature de l'expéditeur",
  },
  destinataire: {
    titre: 'Livraison',
    question: 'Qui réceptionne ?',
    categorie: 'POD',
    labelSignature: 'Signature du destinataire',
  },
}

export function EtapeTerrain({
  courseId, role, nomConnu, dejaSignee, busy, onValider, onAnnuler,
}: Props) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const cfg = CONFIG[role]

  const [nom, setNom]             = useState(nomConnu ?? '')
  const [photoEnvoi, setPhotoEnvoi] = useState(false)
  const [photoOk, setPhotoOk]     = useState(false)
  const [signee, setSignee]       = useState(dejaSignee)
  const [padOuvert, setPadOuvert] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  /**
   * La photo part DES QU'ELLE EST PRISE, sans attendre la validation.
   * Au bord de la route le reseau est mauvais : l'attente se place pendant que
   * le chauffeur tape le nom, pas apres, quand il a deja range son telephone.
   */
  const prendrePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !companyId) return
    if (!file.type.startsWith('image/')) { toast('Seules les photos sont acceptées', 'error'); return }

    setPhotoEnvoi(true)
    const { error } = await uploadDocument(file, companyId, {
      entity_type: 'delivery', entity_id: courseId, category: cfg.categorie,
    })
    setPhotoEnvoi(false)
    if (error) {
      const refus = /row-level security|permission|policy/i.test(error.message)
      toast(refus
        ? "Ton compte n'a pas le droit d'ajouter des photos. Préviens la gestion — tu peux valider sans."
        : error.message, 'error')
      return
    }
    setPhotoOk(true)
    toast('Photo enregistrée')
  }

  /**
   * La signature est enregistree IMMEDIATEMENT, pas a la validation : si le
   * telephone se verrouille ou que l'ecran se ferme juste apres, le trace est
   * deja en base. Meme format que la lettre de voiture du bureau — PNG,
   * horodatage, geoloc quand le navigateur l'autorise.
   */
  const signer = async (png: string) => {
    const geo = await tryGeoloc()
    const { error } = await ajouterSignature(courseId, role, {
      png, ts: new Date().toISOString(), ...(geo ? { geo } : {}),
    })
    if (error) { toast(error.message, 'error'); return }
    setSignee(true)
    setPadOuvert(false)
    toast('Signature enregistrée')
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] p-3 anim-sheet">
      <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
        {cfg.titre}
      </span>

      <input ref={photoRef} type="file" accept="image/*" capture="environment"
             className="hidden" onChange={prendrePhoto} />

      <Button variant={photoOk ? 'secondary' : 'primary'} className="min-h-[44px]"
              onClick={() => photoRef.current?.click()} disabled={photoEnvoi || busy}>
        <span className="inline-flex items-center gap-1.5">
          {photoOk ? <Check size={15} /> : <Camera size={15} />}
          {photoEnvoi ? 'Envoi…' : photoOk ? 'Photo enregistrée — en reprendre une' : 'Photo'}
        </span>
      </Button>

      <input type="text" value={nom} onChange={e => setNom(e.target.value)}
             placeholder={cfg.question} className="field min-h-[44px] h-auto" />

      {/* Signature « en mode raccourci » : le pad ne s'ouvre que si on le
          demande. L'afficher d'office mangerait tout l'ecran d'un telephone
          pour un geste qui n'est pas toujours possible sur le terrain. */}
      {signee ? (
        <span className="inline-flex items-center gap-1.5 text-[var(--fs-sm)] text-[var(--success)]">
          <Check size={15} /> {cfg.labelSignature} enregistrée
        </span>
      ) : padOuvert ? (
        <SignaturePad label={cfg.labelSignature} height={120}
                      onCommit={signer} onClear={() => setSignee(false)} />
      ) : (
        <Button variant="secondary" className="min-h-[44px]"
                onClick={() => setPadOuvert(true)} disabled={busy}>
          <span className="inline-flex items-center gap-1.5">
            <PenLine size={15} /> Faire signer
          </span>
        </Button>
      )}

      <Button variant="primary" className="min-h-[44px]"
              onClick={() => onValider(nom.trim() || null)}
              disabled={busy || photoEnvoi || !nom.trim()}>
        {busy ? '…' : role === 'expediteur' ? 'Valider le chargement' : 'Valider la livraison'}
      </Button>

      {/* Sortie de secours assumee : pas d'interlocuteur, pas de reseau, pas de
          temps. Ces courses ressortent ensuite dans l'alerte « sans
          justificatif » cote gestion, qui existe exactement pour ca. */}
      <div className="flex items-center gap-2">
        <button onClick={() => onValider(null)} disabled={busy || photoEnvoi}
          className="flex-1 min-h-[44px] text-[var(--fs-xs)] text-[var(--text-muted)]
            hover:text-[var(--text)] transition-colors disabled:opacity-40">
          Continuer sans preuve
        </button>
        <button onClick={onAnnuler} disabled={busy}
          className="min-h-[44px] px-3 text-[var(--fs-xs)] text-[var(--text-muted)]
            hover:text-[var(--text)] transition-colors disabled:opacity-40">
          Annuler
        </button>
      </div>
    </div>
  )
}
