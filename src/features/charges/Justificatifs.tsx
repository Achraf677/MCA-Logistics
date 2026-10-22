import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, CreditCard, ExternalLink, FilePlus2, Inbox, Pencil, Search, User, Wallet, X } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Field } from '../../shared/ui/Field'
import { GroupeMois } from '../../shared/ui/GroupeMois'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney } from '../../shared/lib/money'
import {
  CATEGORIES_DEPENSE, libelleCategorie, manquesValidation, montantSaisiEnCts, totalARembourser,
  type CategorieDepense,
} from '../../shared/lib/depenses'
import { dateCourte } from '../../shared/lib/dates'
import { getCategories } from '../../shared/lib/categories.queries'
import { indexerFichierExistant } from '../../shared/lib/documents.queries'
import { grouperParMois } from '../../shared/lib/mois'
import {
  classerTicket, corrigerTicket, listerTickets, marquerRembourse, refuserDepense, urlTicket, type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'
import type { ChargeCategoryRow } from '../../shared/types/categories'
import { DrawerCharge } from './DrawerCharge'
import { nomsDeclarants } from './charges.queries'
import {
  compteursJustificatifs, filtrerJustificatifs, jourJustif, type FiltreJustif,
} from './justificatifs.logic'

const FILTRES: Array<{ cle: FiltreJustif; libelle: string }> = [
  { cle: 'a_traiter', libelle: 'À traiter' },
  { cle: 'valides', libelle: 'Validés' },
  { cle: 'a_rembourser', libelle: 'À rembourser' },
  { cle: 'refuses', libelle: 'Refusés' },
]

const aujourdhuiLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Onglet Justificatifs (Finance) : tickets et dépenses envoyés par les salariés et associés.
 * À traiter → Valider (montant obligatoire), Créer la charge, Corriger (anciens tickets sans montant, un par un)
 * ou Refuser (motif lu par le déclarant). Notes de frais : « À rembourser » puis « Remboursé le … »,
 * que le salarié voit dans son espace. Même droit que Charges (`finance.charges`).
 */
export function Justificatifs() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const peutEcrire = can('finance.charges', 'update')

  const [tickets, setTickets] = useState<TicketInbox[]>([])
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<ChargeCategoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<FiltreJustif>('a_traiter')
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refusId, setRefusId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
  const [correctionId, setCorrectionId] = useState<string | null>(null)
  const [source, setSource] = useState<TicketInbox | null>(null)

  const charger = useCallback(async () => {
    setLoading(true)
    const { data, error } = await listerTickets()
    if (error) { setErreur(error.message); setLoading(false); return }
    setErreur(null)
    const liste = data ?? []
    setTickets(liste)
    setLoading(false)
    setNoms(await nomsDeclarants(liste.map(t => t.uploaded_by ?? '')))
  }, [])

  useEffect(() => { void charger() }, [charger])
  useEffect(() => { if (companyId) getCategories(companyId).then(setCategories) }, [companyId])

  const compteurs = useMemo(() => compteursJustificatifs(tickets), [tickets])
  const dus = useMemo(() => totalARembourser(tickets.map(t => ({
    moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut, rembourse_le: t.rembourse_le,
  }))), [tickets])
  const visibles = useMemo(() => filtrerJustificatifs(tickets, filtre, q, noms), [tickets, filtre, q, noms])
  const parMois = useMemo(() => grouperParMois(visibles, t => jourJustif(t)), [visibles])

  const ouvrir = async (t: TicketInbox) => {
    const url = await urlTicket(t)
    if (!url) { toast('Fichier introuvable', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const valider = async (t: TicketInbox) => {
    const manques = manquesValidation(t)
    if (manques.length) {
      toast(`Validation impossible : ${manques.join(', ').toLowerCase()} manquant. Corrige d'abord le justificatif.`, 'error')
      setCorrectionId(t.id)
      return
    }
    setBusyId(t.id)
    const { error } = await classerTicket(t.id, 'traite')
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Justificatif validé')
    await charger()
  }

  const refuser = async (t: TicketInbox) => {
    if (motif.trim().length < 5) { toast('Motif du refus : 5 caractères minimum', 'error'); return }
    setBusyId(t.id)
    const { error } = await refuserDepense(t.id, motif.trim())
    setBusyId(null)
    if (error) { toast(`Refus non enregistré : ${error.message}`, 'error'); return }
    toast('Dépense refusée : le déclarant voit le motif')
    setRefusId(null); setMotif('')
    await charger()
  }

  const rembourser = async (t: TicketInbox, date: string | null) => {
    setBusyId(t.id)
    const { error } = await marquerRembourse(t.id, date)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast(date ? 'Note de frais marquée remboursée : le salarié le voit' : 'Remboursement annulé')
    await charger()
  }

  const corriger = async (t: TicketInbox, maj: { montant_ttc_cts: number | null; date_depense: string | null; categorie: string | null; moyen_paiement: string | null }) => {
    setBusyId(t.id)
    const { error } = await corrigerTicket(t.id, maj)
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Justificatif corrigé')
    setCorrectionId(null)
    await charger()
  }

  const lignes = (liste: TicketInbox[]) => (
    <ul className="divide-y divide-[var(--border)]">
      {liste.map(t => (
        <Ligne key={t.id} t={t} nom={t.uploaded_by ? (noms[t.uploaded_by] ?? 'Déclarant inconnu') : 'Déclarant inconnu'}
          peutEcrire={peutEcrire} busy={busyId === t.id}
          correction={correctionId === t.id} refus={refusId === t.id} motif={motif}
          onMotif={setMotif} onVoir={() => void ouvrir(t)}
          onCreerCharge={() => setSource(t)} onValider={() => void valider(t)}
          onCorriger={() => setCorrectionId(correctionId === t.id ? null : t.id)}
          onEnregistrerCorrection={maj => void corriger(t, maj)}
          onRefuserOuvrir={() => { setRefusId(refusId === t.id ? null : t.id); setMotif('') }}
          onRefuser={() => void refuser(t)} onAnnulerRefus={() => setRefusId(null)}
          onRembourser={() => void rembourser(t, aujourdhuiLocal())} onAnnulerRemboursement={() => void rembourser(t, null)} />
      ))}
    </ul>
  )

  return (
    <Shell pageTitle="Justificatifs">
      <div className="flex flex-col gap-4">
        {loading ? (
          <Skeleton className="h-40" />
        ) : erreur ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-sm">{erreur}</p>
            <Button variant="secondary" onClick={() => void charger()}>Réessayer</Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div role="group" aria-label="Statut" className="inline-flex flex-wrap rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
                {FILTRES.map(f => (
                  <button key={f.cle} type="button" aria-pressed={filtre === f.cle} onClick={() => setFiltre(f.cle)}
                    className={`px-3 py-1.5 rounded-[var(--r-sm)] text-xs font-semibold inline-flex items-center gap-1.5 ${filtre === f.cle ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                    {f.libelle}
                    <span className={`tabular-nums ${filtre === f.cle ? 'text-white/80' : 'text-[var(--text-disabled)]'}`}>{compteurs[f.cle]}</span>
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[12rem] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] pointer-events-none" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Note, catégorie, déclarant…"
                  aria-label="Rechercher un justificatif" className="field !pl-9" />
              </div>
              {dus > 0 && <span className="text-sm font-semibold text-[var(--warning)] ml-auto">{formatMoney(dus)} à rembourser</span>}
            </div>

            {visibles.length === 0 ? (
              <EmptyState icon={<Inbox size={40} />} title="Rien ici"
                description={tickets.length === 0 ? 'Aucun justificatif reçu pour le moment.' : 'Aucun justificatif dans ce filtre.'} />
            ) : filtre === 'a_traiter' ? (
              <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)]">{lignes(visibles)}</div>
            ) : (
              <div className="flex flex-col gap-3">
                {parMois.map((g, i) => (
                  <GroupeMois key={`${g.cle}-${filtre}-${q !== ''}`} titre={g.libelle} ouvertDefaut={q !== '' || i === 0}
                    resume={<>
                      <span>{g.rows.length} justificatif{g.rows.length > 1 ? 's' : ''}</span>
                      <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(g.rows.reduce((s, t) => s + (t.montant_ttc_cts ?? 0), 0))}</span>
                    </>}>
                    {lignes(g.rows)}
                  </GroupeMois>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <DrawerCharge
        open={source != null}
        onClose={() => setSource(null)}
        charge={null}
        onSaved={() => void charger()}
        categories={categories}
        prefill={source ? {
          // Ce qu'on sait VRAIMENT du ticket : ce que le déclarant a tapé, son jour, comment il a payé.
          // Le montant n'est pas deviné — mieux vaut un champ vide qu'un chiffre faux dans une comptabilité.
          date: source.date_depense ?? source.created_at.slice(0, 10),
          label: source.note ?? '',
          notes: `Ticket : ${source.file_name}`,
          mode_paiement: source.moyen_paiement === 'personnel' ? 'note_de_frais' : source.moyen_paiement === 'carte_societe' ? 'qonto' : undefined,
        } : null}
        onCreated={async chargeId => {
          if (!source || !companyId) return
          // La photo est déjà dans le bucket : on l'inscrit au registre des documents de la charge.
          await indexerFichierExistant({
            companyId, storagePath: source.storage_path, fileName: source.file_name, mimeType: source.mime_type,
            sizeBytes: source.size_bytes, entityType: 'charge', entityId: chargeId, category: 'Justificatif', notes: source.note,
          })
          await classerTicket(source.id, 'traite', chargeId)
          setSource(null)
          await charger()
        }}
      />
    </Shell>
  )
}

function Ligne({
  t, nom, peutEcrire, busy, correction, refus, motif, onMotif, onVoir, onCreerCharge, onValider, onCorriger,
  onEnregistrerCorrection, onRefuserOuvrir, onRefuser, onAnnulerRefus, onRembourser, onAnnulerRemboursement,
}: {
  t: TicketInbox
  nom: string
  peutEcrire: boolean
  busy: boolean
  correction: boolean
  refus: boolean
  motif: string
  onMotif: (v: string) => void
  onVoir: () => void
  onCreerCharge: () => void
  onValider: () => void
  onCorriger: () => void
  onEnregistrerCorrection: (maj: { montant_ttc_cts: number | null; date_depense: string | null; categorie: string | null; moyen_paiement: string | null }) => void
  onRefuserOuvrir: () => void
  onRefuser: () => void
  onAnnulerRefus: () => void
  onRembourser: () => void
  onAnnulerRemboursement: () => void
}) {
  const noteDeFrais = t.moyen_paiement === 'personnel'
  const carte = t.moyen_paiement === 'carte_societe'
  const jour = jourJustif(t)
  const annee = new Date().getFullYear()
  return (
    <li className="px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        {noteDeFrais ? (
          <Badge color="warning"><span className="inline-flex items-center gap-1"><Wallet size={12} /> Note de frais</span></Badge>
        ) : carte ? (
          <Badge color="info"><span className="inline-flex items-center gap-1"><CreditCard size={12} /> Carte société</span></Badge>
        ) : (
          <span className="text-xs text-[var(--text-disabled)] shrink-0">Paiement non précisé</span>
        )}

        <div className="flex-1 min-w-[12rem]">
          <p className="text-sm text-[var(--text)] truncate">
            <span className={`font-semibold ${t.montant_ttc_cts == null ? 'text-[var(--danger)]' : ''}`}>
              {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : 'Montant manquant'}
            </span>
            {t.categorie ? <> · {libelleCategorie(t.categorie)}</> : null} · {dateCourte(jour, annee)}
            {t.note && <span className="text-[var(--text-muted)]"> · {t.note}</span>}
          </p>
          <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <User size={11} /> {nom} · envoyé le {new Date(t.created_at).toLocaleString('fr-FR')}
          </p>
          {t.statut === 'ignore' && t.motif_refus && <p className="text-xs text-[var(--danger)]">Refusé : {t.motif_refus}</p>}
        </div>

        {/* Colonne « état » : toujours la même largeur, les pastilles s'empilent à droite */}
        <div className="flex items-center justify-end gap-1.5 sm:w-64 sm:flex-nowrap flex-wrap whitespace-nowrap">
          {t.statut === 'traite' && <Badge color="success">Validé</Badge>}
          {t.statut === 'traite' && noteDeFrais && (
            t.rembourse_le
              ? <Badge color="info">Remboursé le {dateCourte(t.rembourse_le, annee)}</Badge>
              : <Badge color="warning">À rembourser</Badge>
          )}
          {t.statut === 'ignore' && <Badge color="danger">Refusé</Badge>}
        </div>

        {/* Colonne « geste principal » : un seul bouton à la fois */}
        <div className="flex items-center justify-end gap-2 sm:w-72">
          {peutEcrire && t.statut === 'a_traiter' && (
            <>
              <Button variant="primary" size="compact" className="whitespace-nowrap" onClick={onCreerCharge} disabled={busy}><FilePlus2 size={13} /> Créer la charge</Button>
              <Button variant="secondary" size="compact" className="whitespace-nowrap" onClick={onValider} disabled={busy}><Check size={13} /> Valider</Button>
            </>
          )}
          {peutEcrire && t.statut === 'traite' && noteDeFrais && (
            t.rembourse_le
              ? <Button variant="ghost" size="compact" className="whitespace-nowrap" onClick={onAnnulerRemboursement} disabled={busy}>Annuler</Button>
              : <Button variant="secondary" size="compact" className="whitespace-nowrap" onClick={onRembourser} disabled={busy}><Check size={13} /> Marquer remboursé</Button>
          )}
        </div>

        {/* Colonne « outils » : pictogrammes */}
        <div className="flex items-center justify-end gap-1 sm:w-24">
          <BoutonIcone icone={ExternalLink} taille="sm" libelle="Voir le justificatif" onClick={onVoir} />
          {peutEcrire && <BoutonIcone icone={Pencil} taille="sm" libelle="Corriger" actif={correction} disabled={busy} onClick={onCorriger} />}
          {peutEcrire && t.statut === 'a_traiter' && (
            <BoutonIcone icone={X} taille="sm" libelle="Refuser" actif={refus} disabled={busy} onClick={onRefuserOuvrir} />
          )}
        </div>
      </div>

      {correction && peutEcrire && <FormCorrection t={t} busy={busy} onEnregistrer={onEnregistrerCorrection} onAnnuler={onCorriger} />}

      {refus && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-2">
          <input className="field flex-1 min-w-[14rem]" autoFocus value={motif}
            placeholder="Motif lu par le déclarant (ex. ticket illisible, dépense personnelle)"
            onChange={e => onMotif(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onRefuser() }} />
          <Button variant="primary" size="compact" disabled={busy || motif.trim().length < 5} onClick={onRefuser}>Refuser la dépense</Button>
          <Button variant="secondary" size="compact" onClick={onAnnulerRefus}>Annuler</Button>
        </div>
      )}
    </li>
  )
}

/** Correction d'un justificatif par le bureau : montant, date, catégorie, moyen de paiement. */
function FormCorrection({ t, busy, onEnregistrer, onAnnuler }: {
  t: TicketInbox
  busy: boolean
  onEnregistrer: (maj: { montant_ttc_cts: number | null; date_depense: string | null; categorie: string | null; moyen_paiement: string | null }) => void
  onAnnuler: () => void
}) {
  const [montant, setMontant] = useState(t.montant_ttc_cts != null ? (t.montant_ttc_cts / 100).toFixed(2).replace('.', ',') : '')
  const [date, setDate] = useState(t.date_depense ?? t.created_at.slice(0, 10))
  const [categorie, setCategorie] = useState<CategorieDepense | ''>((t.categorie as CategorieDepense | null) ?? '')
  const [moyen, setMoyen] = useState(t.moyen_paiement ?? '')
  const cts = montantSaisiEnCts(montant)
  const invalide = Number.isNaN(cts)
  return (
    <div className="grid gap-3 sm:grid-cols-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <Field label="Montant TTC (€)">
        <input className="field" inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="12,50" aria-invalid={invalide} />
      </Field>
      <Field label="Date">
        <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>
      <Field label="Catégorie">
        <select className="field" value={categorie} onChange={e => setCategorie(e.target.value as CategorieDepense | '')}>
          <option value="">Non précisée</option>
          {CATEGORIES_DEPENSE.map(c => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
        </select>
      </Field>
      <Field label="Payé avec">
        <select className="field" value={moyen} onChange={e => setMoyen(e.target.value)}>
          <option value="">Non précisé</option>
          <option value="carte_societe">Carte de la société</option>
          <option value="personnel">De sa poche (note de frais)</option>
        </select>
      </Field>
      <div className="sm:col-span-4 flex gap-2">
        <Button variant="primary" size="compact" disabled={busy || invalide}
          onClick={() => onEnregistrer({ montant_ttc_cts: invalide ? null : cts, date_depense: date || null, categorie: categorie || null, moyen_paiement: moyen || null })}>
          Enregistrer
        </Button>
        <Button variant="secondary" size="compact" onClick={onAnnuler}>Annuler</Button>
        {invalide && <span className="text-xs text-[var(--danger)] self-center">Montant invalide (ex. 12,50)</span>}
      </div>
    </div>
  )
}
