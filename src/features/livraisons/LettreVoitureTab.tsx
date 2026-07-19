// Onglet "Lettre de voiture" du DrawerLivraison.
//
// Colle les mentions obligatoires (décret 99-752 / art. L132-9 Code de commerce)
// à la livraison courante : expéditeur, destinataire, marchandise, colis, poids,
// puis 3 signatures (expéditeur au chargement, transporteur/chauffeur, destinataire
// à la remise). Chaque signature stocke png + timestamp + geoloc si autorisée.
// Le bouton « Générer la lettre de voiture » est BLOQUÉ tant que
// buildLettreVoiture renvoie des mentions manquantes — on affiche la liste au
// dessus du bouton pour guider l'utilisateur.
//
// Persistance en 2 temps :
//   1) `saveLvFields()` push les champs (nom expéditeur, colis, poids…) + signatures
//      au fil de l'eau (chaque validation de signature déclenche un save).
//   2) `handleGenerate()` construit le PDF, attribue le n° LV (LV-AAAA-N) si
//      absent, uploade sur Drive via uploadDocument, et écrit lv_pdf_url +
//      lv_numero sur la livraison.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, FileText, MapPin } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { SignaturePad, tryGeoloc } from '../../shared/ui/SignaturePad'
import { useProfile } from '../../app/providers'
import { uploadDocument } from '../../shared/lib/documents.queries'
import { getCompany } from '../parametres/parametres.queries'
import type { CompanyData } from '../parametres/parametres.queries'
import { buildLettreVoiture, lvNumero } from './lettreVoiture.logic'
import { buildLettreVoiturePdf } from './lettreVoiture.pdf'
import { updateDelivery, getLvNumerosForYear } from './livraisons.queries'
import type { DeliveryRow, LvSignatures, LvSignatureData } from './livraisons.types'

interface Props {
  delivery: DeliveryRow | null
  companyId: string | null
  onSaved: () => void
}

// Toutes les mentions LV vivent dans un state local dédié : on garde le drawer
// existant simple (les champs core = date/client/adresses/montant) et on isole
// ici les champs "papier LV".
interface LvFormState {
  expediteur_nom: string
  expediteur_siren: string
  destinataire_nom: string
  marchandise_desc: string
  nb_colis: string        // string pendant l'édition, cast à l'enregistrement
  poids_kg_reel: string   // idem
}

const EMPTY_LV: LvFormState = {
  expediteur_nom: '', expediteur_siren: '', destinataire_nom: '',
  marchandise_desc: '', nb_colis: '', poids_kg_reel: '',
}

export function LettreVoitureTab({ delivery, companyId, onSaved }: Props) {
  const { toast } = useToast()
  const { profile } = useProfile()

  const [company, setCompany]           = useState<CompanyData | null>(null)
  const [form, setForm]                 = useState<LvFormState>(EMPTY_LV)
  const [signatures, setSignatures]     = useState<LvSignatures>({})
  const [dirty, setDirty]               = useState(false)
  const [saving, setSaving]             = useState(false)
  const [generating, setGenerating]     = useState(false)

  // Charge la société pour licence transport / SIREN / adresse.
  useEffect(() => {
    if (!companyId) return
    getCompany(companyId).then(({ data }) => { if (data) setCompany(data) })
  }, [companyId])

  // Hydrate depuis la livraison à l'ouverture.
  useEffect(() => {
    if (!delivery) { setForm(EMPTY_LV); setSignatures({}); setDirty(false); return }
    setForm({
      expediteur_nom:    delivery.expediteur_nom ?? '',
      expediteur_siren:  delivery.expediteur_siren ?? '',
      destinataire_nom:  delivery.destinataire_nom ?? (delivery.clients?.name ?? ''),
      marchandise_desc:  delivery.marchandise_desc ?? (delivery.description ?? ''),
      nb_colis:          delivery.nb_colis != null ? String(delivery.nb_colis) : '',
      poids_kg_reel:     delivery.poids_kg_reel != null ? String(delivery.poids_kg_reel) : '',
    })
    setSignatures((delivery.lv_signatures ?? {}) as LvSignatures)
    setDirty(false)
  }, [delivery])

  const set = (k: keyof LvFormState, v: string) => {
    setForm(p => ({ ...p, [k]: v }))
    setDirty(true)
  }

  // Rôle chauffeur : chauffeur assigné, sinon utilisateur courant si role chauffeur.
  // La chaîne getActiveDrivers → assign fournit driver_id ; le drawer parent le remplit.
  const chauffeurLabel = delivery?.team_members?.full_name
    ?? (profile?.role === 'chauffeur' ? (profile.full_name ?? null) : null)

  const preview = useMemo(() => {
    if (!delivery || !company) return null
    return buildLettreVoiture({
      delivery: {
        date:              delivery.date,
        pickup_address:    delivery.pickup_address,
        delivery_address:  delivery.delivery_address,
        description:       delivery.description,
        expediteur_nom:    form.expediteur_nom,
        expediteur_siren:  form.expediteur_siren,
        destinataire_nom:  form.destinataire_nom,
        marchandise_desc:  form.marchandise_desc,
        nb_colis:          form.nb_colis ? parseInt(form.nb_colis, 10) : null,
        poids_kg_reel:     form.poids_kg_reel ? parseFloat(form.poids_kg_reel) : null,
        amount_ttc_cts:    delivery.amount_ttc_cts,
        amount_ht_cts:     delivery.amount_ht_cts,
        montant_ttc_cts:   delivery.montant_ttc_cts,
        lv_numero:         delivery.lv_numero,
      },
      company: {
        name:              company.name,
        siren:             company.siren,
        address:           company.address,
        licence_transport: company.licence_transport,
      },
      vehicle: delivery.vehicles ? { label: delivery.vehicles.label } : null,
      driver:  chauffeurLabel ? { full_name: chauffeurLabel } : null,
      client:  delivery.clients ? { name: delivery.clients.name } : null,
    })
  }, [delivery, company, form, chauffeurLabel])

  // ── Persistance ─────────────────────────────────────────────────────────────
  // Enregistre le lot { champs + signatures } sans toucher au n° LV ni au PDF.
  const persist = async (nextSignatures?: LvSignatures) => {
    if (!delivery) return
    setSaving(true)
    const sig = nextSignatures ?? signatures
    const { error } = await updateDelivery(delivery.id, {
      expediteur_nom:   form.expediteur_nom.trim() || null,
      expediteur_siren: form.expediteur_siren.trim() || null,
      destinataire_nom: form.destinataire_nom.trim() || null,
      marchandise_desc: form.marchandise_desc.trim() || null,
      nb_colis:         form.nb_colis ? parseInt(form.nb_colis, 10) : null,
      poids_kg_reel:    form.poids_kg_reel ? parseFloat(form.poids_kg_reel) : null,
      lv_signatures:    sig,
    })
    setSaving(false)
    if (error) { toast((error as Error).message ?? 'Enregistrement échoué', 'error'); return }
    setDirty(false)
    onSaved()
  }

  // Signature d'un rôle : capture PNG + horodatage + géoloc (best-effort).
  const handleSign = async (role: keyof LvSignatures, png: string) => {
    const geo = await tryGeoloc()
    const entry: LvSignatureData = {
      png, ts: new Date().toISOString(),
      ...(geo ? { geo } : {}),
    }
    const next = { ...signatures, [role]: entry }
    setSignatures(next)
    // Persist immédiat pour ne pas perdre la signature en cas de fermeture.
    await persist(next)
    toast(`Signature ${roleLabel(role)} enregistrée`)
  }

  const handleClearSignature = async (role: keyof LvSignatures) => {
    const next = { ...signatures }
    delete next[role]
    setSignatures(next)
    await persist(next)
  }

  // ── Génération PDF + upload Drive ──────────────────────────────────────────
  const handleGenerate = async () => {
    if (!delivery || !companyId || !preview) return
    if (preview.missing.length > 0) {
      toast(`Complète : ${preview.missing.join(', ')}`, 'error')
      return
    }
    setGenerating(true)
    try {
      // Persist d'abord si des champs sont dirty (le PDF utilise les valeurs live).
      if (dirty) {
        await persist()
      }
      // Numéro : réutilise l'existant, sinon en attribue un.
      const year = new Date(delivery.date + 'T00:00:00').getFullYear() ||
        new Date().getFullYear()
      let numero = delivery.lv_numero
      if (!numero) {
        const { data: existants } = await getLvNumerosForYear(year)
        numero = lvNumero(existants ?? [], year)
      }
      const dataForPdf = { ...preview.data, numero }
      const fileName = `${numero}.pdf`
      const { file } = buildLettreVoiturePdf({
        data: dataForPdf,
        signatures,
        fileName,
      })
      // Upload Drive (crée aussi une ligne documents catégorie LV).
      const { data: doc, error } = await uploadDocument(file, companyId, {
        entity_type: 'delivery',
        entity_id:   delivery.id,
        category:    'LV',
      })
      if (error || !doc) throw error ?? new Error('Upload échoué')
      // Écrit lv_numero + lv_pdf_url sur la livraison.
      await updateDelivery(delivery.id, {
        lv_numero:  numero,
        lv_pdf_url: doc.drive_link,
      })
      toast(`Lettre de voiture ${numero} générée`)
      onSaved()
    } catch (e) {
      toast((e as Error).message ?? 'Génération échouée', 'error')
    } finally {
      setGenerating(false)
    }
  }

  if (!delivery) {
    return (
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)] italic py-4 text-center">
        Enregistre d'abord la livraison pour y rattacher une lettre de voiture.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* En-tête statut LV */}
      <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-2.5
        flex items-center gap-3 text-[var(--fs-sm)]">
        <FileText size={14} className="text-[var(--brand)]" />
        {delivery.lv_numero ? (
          <>
            <span className="font-medium text-[var(--text)]">{delivery.lv_numero}</span>
            {delivery.lv_pdf_url && (
              <a href={delivery.lv_pdf_url} target="_blank" rel="noopener noreferrer"
                className="text-[var(--brand)] hover:underline text-[var(--fs-xs)]">
                Ouvrir le PDF
              </a>
            )}
            <Badge color="success">Générée</Badge>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">
            À générer — remplis les mentions ci-dessous puis fais signer.
          </span>
        )}
      </div>

      {/* Mentions obligatoires */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Expéditeur — nom / raison sociale *">
          <input value={form.expediteur_nom} onChange={e => set('expediteur_nom', e.target.value)}
            className={inputCls} placeholder="Ex. Boulangerie Dupont" />
        </Field>
        <Field label="Expéditeur — SIREN">
          <input value={form.expediteur_siren} onChange={e => set('expediteur_siren', e.target.value)}
            className={inputCls} placeholder="123456789" />
        </Field>
        <Field label="Destinataire — nom / raison sociale *">
          <input value={form.destinataire_nom} onChange={e => set('destinataire_nom', e.target.value)}
            className={inputCls} placeholder="Nom sur la remise" />
        </Field>
        <Field label="Marchandise — description *">
          <input value={form.marchandise_desc} onChange={e => set('marchandise_desc', e.target.value)}
            className={inputCls} placeholder="Nature courante des marchandises" />
        </Field>
        <Field label="Nombre de colis *">
          <input type="number" min="1" value={form.nb_colis}
            onChange={e => set('nb_colis', e.target.value)}
            className={inputCls} placeholder="0" />
        </Field>
        <Field label="Poids réel remis (kg) *">
          <input type="number" min="0" step="0.1" value={form.poids_kg_reel}
            onChange={e => set('poids_kg_reel', e.target.value)}
            className={inputCls} placeholder="0" />
        </Field>
      </div>

      {dirty && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="compact" onClick={() => persist()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer les mentions'}
          </Button>
          <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">Modifications non sauvegardées</span>
        </div>
      )}

      {/* Rappel licence / société côté transporteur */}
      {company && !company.licence_transport && (
        <div className="rounded-[var(--r-md)] bg-[var(--warning)]/10 border border-[var(--warning)]/30 px-3 py-2
          text-[var(--fs-xs)] text-[var(--text)]">
          Licence DREAL non renseignée sur la société — à compléter dans <b>Paramètres</b> avant la 1ʳᵉ génération.
        </div>
      )}

      {/* Signatures */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[var(--border)]">
        <SignatureBlock
          role="expediteur" label="Expéditeur (chargement)"
          sig={signatures.expediteur}
          onSign={png => handleSign('expediteur', png)}
          onClear={() => handleClearSignature('expediteur')}
        />
        <SignatureBlock
          role="transporteur" label="Transporteur (chauffeur)"
          sig={signatures.transporteur}
          onSign={png => handleSign('transporteur', png)}
          onClear={() => handleClearSignature('transporteur')}
        />
        <SignatureBlock
          role="destinataire" label="Destinataire (livraison)"
          sig={signatures.destinataire}
          onSign={png => handleSign('destinataire', png)}
          onClear={() => handleClearSignature('destinataire')}
        />
      </div>

      {/* Mentions manquantes */}
      {preview && preview.missing.length > 0 && (
        <div className="rounded-[var(--r-md)] bg-[var(--danger)]/10 border border-[var(--danger)]/30 px-3 py-2
          text-[var(--fs-xs) text-[var(--text)] flex flex-col gap-1">
          <span className="font-medium">Mentions manquantes avant génération :</span>
          <ul className="list-disc pl-5 text-[var(--text-muted)]">
            {preview.missing.map(m => <li key={m}>{m}</li>)}
          </ul>
        </div>
      )}

      {/* Action générer */}
      <div className="flex items-center gap-3 pt-3 border-t border-[var(--border)]">
        <Button
          variant="primary"
          onClick={handleGenerate}
          disabled={generating || saving || !preview || preview.missing.length > 0}
        >
          {generating
            ? <><Loader2 size={14} className="animate-spin" /> Génération…</>
            : delivery.lv_numero ? 'Regénérer le PDF' : 'Générer la lettre de voiture'}
        </Button>
        {delivery.lv_pdf_url && (
          <a href={delivery.lv_pdf_url} target="_blank" rel="noopener noreferrer"
            className="text-[var(--fs-xs)] text-[var(--brand)] hover:underline">
            Re-télécharger le PDF
          </a>
        )}
      </div>
    </div>
  )
}

// ── Sous-composants ─────────────────────────────────────────────────────────

function SignatureBlock({
  role, label, sig, onSign, onClear,
}: {
  role: keyof LvSignatures
  label: string
  sig: LvSignatureData | undefined
  onSign: (png: string) => void
  onClear: () => void
}) {
  const roleKey = `sig-${role}`  // pour éviter le "role" utilisé mais unused-var
  return (
    <div className="flex flex-col gap-2" data-role={roleKey}>
      <SignaturePad
        label={label}
        value={sig?.png ?? null}
        onCommit={onSign}
        onClear={onClear}
      />
      {sig && (
        <div className="text-[var(--fs-xs)] text-[var(--text-muted)] flex flex-col gap-0.5">
          <span>Le {new Date(sig.ts).toLocaleString('fr-FR')}</span>
          {sig.geo && (
            <span className="flex items-center gap-1">
              <MapPin size={11} />
              {sig.geo.lat.toFixed(5)}, {sig.geo.lng.toFixed(5)}
              {sig.geo.acc ? ` (±${Math.round(sig.geo.acc)} m)` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[var(--fs-xs)] font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls = `w-full h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
  text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

function roleLabel(r: keyof LvSignatures): string {
  switch (r) {
    case 'expediteur': return 'expéditeur'
    case 'transporteur': return 'transporteur'
    case 'destinataire': return 'destinataire'
  }
}
