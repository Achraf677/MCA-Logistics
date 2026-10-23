import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, Sparkles, CreditCard, ExternalLink, FilePlus2, Inbox, Search, Wallet, X } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { supabase, useProfile } from '../../app/providers'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { GroupeMois } from '../../shared/ui/GroupeMois'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney } from '../../shared/lib/money'
import {
  CATEGORIES_DEPENSE, LIBELLE_CHAMP_LU, TAUX_TVA_JUSTIF, libelleCategorie, manquesValidation, montantSaisiEnCts, totalARembourser,
  type CategorieDepense,
} from '../../shared/lib/depenses'
import { getCategories } from '../../shared/lib/categories.queries'
import { indexerFichierExistant } from '../../shared/lib/documents.queries'
import { grouperParMois } from '../../shared/lib/mois'
import {
  classerTicket, corrigerTicket, envoyerVersPennylane, lireTicketIa, listerTickets, marquerRembourse, refuserDepense, urlTicket, type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'
import type { ChargeCategoryRow } from '../../shared/types/categories'
import { DrawerCharge } from './DrawerCharge'
import { nomsDeclarants } from './charges.queries'
import { jourFr } from './charges.logic'
import {
  compteursJustificatifs, etatJustificatif, filtrerJustificatifs, jourJustif, type FiltreJustif,
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

const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Onglet Justificatifs (Finance) : tickets et dépenses envoyés par les salariés et associés.
 * La liste se LIT (tableau, un état par ligne) ; on AGIT dans le tiroir d'un justificatif : voir la photo,
 * corriger (anciens tickets sans montant, un par un), valider (montant obligatoire), créer la charge, refuser
 * (motif lu par le déclarant), marquer remboursé (le salarié le voit). Même droit que Charges (`finance.charges`).
 */
export function Justificatifs() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const peutEcrire = can('finance.charges', 'update')

  const [tickets, setTickets] = useState<TicketInbox[]>([])
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<ChargeCategoryRow[]>([])
  const [fournisseurs, setFournisseurs] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [filtre, setFiltre] = useState<FiltreJustif>('a_traiter')
  const [q, setQ] = useState('')
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState<TicketInbox | null>(null)
  const [lectureEnCours, setLectureEnCours] = useState(false)
  const dejaLus = useRef(new Set<string>())

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
  useEffect(() => {
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setFournisseurs((data ?? []) as Array<{ id: string; name: string }>))
  }, [])

  const compteurs = useMemo(() => compteursJustificatifs(tickets), [tickets])
  const dus = useMemo(() => totalARembourser(tickets.map(t => ({
    moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut, rembourse_le: t.rembourse_le,
  }))), [tickets])
  const visibles = useMemo(() => filtrerJustificatifs(tickets, filtre, q, noms), [tickets, filtre, q, noms])
  const parMois = useMemo(() => grouperParMois(visibles, t => jourJustif(t)), [visibles])
  const nomDe = (t: TicketInbox) => (t.uploaded_by ? (noms[t.uploaded_by] ?? 'Déclarant inconnu') : 'Déclarant inconnu')
  const ouvert = tickets.find(t => t.id === ouvertId) ?? null

  // Ouverture d'un justificatif pas encore lu : l'IA lit le ticket et préremplit les cases vides, puis on recharge.
  useEffect(() => {
    if (!ouvert || !peutEcrire || ouvert.statut !== 'a_traiter' || ouvert.ocr_lu_le || dejaLus.current.has(ouvert.id)) return
    dejaLus.current.add(ouvert.id)
    setLectureEnCours(true)
    void lireTicketIa(ouvert.id).then(async ok => { if (ok) await charger() }).finally(() => setLectureEnCours(false))
  }, [ouvert, peutEcrire, charger])

  const ouvrirFichier = async (t: TicketInbox) => {
    const url = await urlTicket(t)
    if (!url) { toast('Fichier introuvable', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const agir = async (action: () => Promise<{ error: { message: string } | null }>, succes: string, fermer = false) => {
    setBusy(true)
    const { error } = await action()
    setBusy(false)
    if (error) { toast(error.message, 'error'); return false }
    toast(succes)
    if (fermer) setOuvertId(null)
    await charger()
    return true
  }

  const valider = (t: TicketInbox) => {
    const manques = manquesValidation(t)
    if (manques.length) { toast(`Validation impossible : ${manques.join(', ').toLowerCase()} manquant. Renseigne-le puis enregistre.`, 'error'); return }
    return validerEtEnvoyer(t)
  }

  /** Valide, puis envoie à Pennylane (« À traiter »). Si l'envoi échoue, le justificatif reste validé : « Renvoyer ». */
  const validerEtEnvoyer = async (t: TicketInbox) => {
    setBusy(true)
    const { error } = await classerTicket(t.id, 'traite')
    if (error) { setBusy(false); toast(error.message, 'error'); return }
    const envoi = await envoyerVersPennylane(t.id)
    setBusy(false)
    if (envoi.ok) toast('Justificatif validé et envoyé à Pennylane (« À traiter »)')
    else toast(`Validé, mais l'envoi à Pennylane a échoué : ${envoi.message}`, 'error')
    await charger()
  }

  const tableau = (liste: TicketInbox[]) => (
    <>
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
            <th className="px-4 py-2 font-medium w-16">Date</th>
            <th className="px-2 py-2 font-medium">Déclarant</th>
            <th className="px-2 py-2 font-medium">Détail</th>
            <th className="px-2 py-2 font-medium">Paiement</th>
            <th className="px-2 py-2 font-medium text-right">Montant TTC</th>
            <th className="px-2 py-2 font-medium w-36">Statut</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {liste.map(t => {
            const etat = etatJustificatif(t)
            return (
              <tr key={t.id} onClick={() => setOuvertId(t.id)} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') setOuvertId(t.id) }}
                className="border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{jourCourt(jourJustif(t))}</td>
                <td className="px-2 py-3 text-[var(--text)] whitespace-nowrap">{nomDe(t)}</td>
                <td className="px-2 py-3 max-w-[22rem]">
                  <span className="block truncate text-[var(--text)]">{t.note || t.file_name}</span>
                  {t.categorie && <span className="block text-xs text-[var(--text-muted)]">{libelleCategorie(t.categorie)}</span>}
                </td>
                <td className="px-2 py-3 whitespace-nowrap"><Paiement moyen={t.moyen_paiement} /></td>
                <td className="px-2 py-3 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                  {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : <span className="font-sans font-medium text-[var(--danger)]">Manquant</span>}
                </td>
                <td className="px-2 py-3"><Badge color={etat.ton}>{etat.libelle}</Badge></td>
                <td className="pr-3 text-[var(--text-disabled)]"><ChevronRight size={16} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <ul className="md:hidden divide-y divide-[var(--border)]">
        {liste.map(t => {
          const etat = etatJustificatif(t)
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setOuvertId(t.id)} className="w-full text-left px-4 py-3 flex flex-col gap-1.5 hover:bg-[var(--bg-card-hover)]">
                <span className="flex items-start gap-3">
                  <span className="flex-1 min-w-0 truncate text-[var(--text)]">{t.note || t.file_name}</span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--text)] shrink-0">
                    {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : <span className="font-sans text-[var(--danger)]">Manquant</span>}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="truncate">{nomDe(t)} · {jourCourt(jourJustif(t))}</span>
                  <span className="ml-auto shrink-0"><Badge color={etat.ton}>{etat.libelle}</Badge></span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
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
              <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">{tableau(visibles)}</div>
            ) : (
              <div className="flex flex-col gap-3">
                {parMois.map((g, i) => (
                  <GroupeMois key={`${g.cle}-${filtre}-${q !== ''}`} titre={g.libelle} ouvertDefaut={q !== '' || i === 0}
                    resume={<>
                      <span>{g.rows.length} justificatif{g.rows.length > 1 ? 's' : ''}</span>
                      <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(g.rows.reduce((s, t) => s + (t.montant_ttc_cts ?? 0), 0))}</span>
                    </>}>
                    {tableau(g.rows)}
                  </GroupeMois>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Drawer open={ouvert != null} onClose={() => setOuvertId(null)} width="max-w-[40rem]" title="Justificatif">
        {ouvert && (
          <FicheJustificatif key={`${ouvert.id}-${ouvert.ocr_lu_le ?? ''}`} t={ouvert} lectureEnCours={lectureEnCours} nom={nomDe(ouvert)} peutEcrire={peutEcrire} busy={busy} fournisseurs={fournisseurs}
            onFichier={() => void ouvrirFichier(ouvert)}
            onEnregistrer={maj => void agir(() => corrigerTicket(ouvert.id, maj), 'Justificatif corrigé')}
            onValider={() => void valider(ouvert)}
            onCreerCharge={() => setSource(ouvert)}
            onRefuser={motif => void agir(() => refuserDepense(ouvert.id, motif), 'Dépense refusée : le déclarant voit le motif', true)}
            onRembourser={date => void agir(() => marquerRembourse(ouvert.id, date), date ? 'Remboursée : le salarié le voit' : 'Remboursement annulé')} />
        )}
      </Drawer>

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
          setOuvertId(null)
          await charger()
        }}
      />
    </Shell>
  )
}

/** Ce que l'IA a lu sur le ticket : cases préremplies à vérifier, et alerte si le montant lu diffère du montant saisi. */
function BandeauLecture({ t, lectureEnCours, montantSaisi }: { t: TicketInbox; lectureEnCours: boolean; montantSaisi: number | null }) {
  const l = t.ocr_lecture
  const rempli = (l?.rempli ?? []).map(c => LIBELLE_CHAMP_LU[c] ?? c)
  const luCts = l?.lu?.total_ttc_cts ?? null
  const ecart = luCts != null && montantSaisi != null && luCts !== montantSaisi
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[var(--text)]">
        <Sparkles size={15} className="text-[var(--brand)] shrink-0" />
        {lectureEnCours ? 'Lecture du ticket en cours…'
          : rempli.length ? `Prérempli d’après le ticket : ${rempli.join(', ')}. Vérifie avant de valider.`
          : l?.raison ? `Ticket non lu : ${l.raison}.` : 'Ticket lu : rien à préremplir.'}
      </div>
      {ecart && <div className="text-[var(--warning)]">Le ticket indique {formatMoney(luCts!)}, pas {formatMoney(montantSaisi!)}.</div>}
      {l?.lu?.fournisseur && !lectureEnCours && <div className="text-xs text-[var(--text-muted)]">Fournisseur lu : {l.lu.fournisseur}</div>}
    </div>
  )
}

/** Moyen de paiement, sobre : pictogramme + libellé (pas de grosse pastille). */
function Paiement({ moyen }: { moyen: string | null | undefined }) {
  if (moyen === 'personnel') return <span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Wallet size={13} className="text-[var(--text-muted)]" /> Note de frais</span>
  if (moyen === 'carte_societe') return <span className="inline-flex items-center gap-1.5 text-[var(--text)]"><CreditCard size={13} className="text-[var(--text-muted)]" /> Carte société</span>
  return <span className="text-[var(--text-disabled)]">Non précisé</span>
}

/** Tiroir d'un justificatif : photo, détails modifiables, suivi, et la barre d'actions en bas. */
function FicheJustificatif({ t, lectureEnCours, nom, peutEcrire, busy, fournisseurs, onFichier, onEnregistrer, onValider, onCreerCharge, onRefuser, onRembourser }: {
  t: TicketInbox
  lectureEnCours: boolean
  nom: string
  peutEcrire: boolean
  busy: boolean
  fournisseurs: Array<{ id: string; name: string }>
  onFichier: () => void
  onEnregistrer: (maj: { montant_ttc_cts: number | null; date_depense: string | null; categorie: string | null; moyen_paiement: string | null; supplier_id: string | null; tva_rate: number | null }) => void
  onValider: () => void
  onCreerCharge: () => void
  onRefuser: (motif: string) => void
  onRembourser: (date: string | null) => void
}) {
  const [montant, setMontant] = useState(t.montant_ttc_cts != null ? (t.montant_ttc_cts / 100).toFixed(2).replace('.', ',') : '')
  const [date, setDate] = useState(t.date_depense ?? t.created_at.slice(0, 10))
  const [categorie, setCategorie] = useState<CategorieDepense | ''>((t.categorie as CategorieDepense | null) ?? '')
  const [moyen, setMoyen] = useState(t.moyen_paiement ?? '')
  const [fournisseur, setFournisseur] = useState(t.supplier_id ?? '')
  const [tva, setTva] = useState(t.tva_rate != null ? String(t.tva_rate) : '')
  const [refus, setRefus] = useState(false)
  const [motif, setMotif] = useState('')
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    if (t.mime_type?.startsWith('image/')) urlTicket(t).then(u => { if (!annule) setUrl(u) })
    return () => { annule = true }
  }, [t])

  const cts = montantSaisiEnCts(montant)
  const invalide = Number.isNaN(cts)
  const modifie = !invalide && (
    cts !== (t.montant_ttc_cts ?? null) || date !== (t.date_depense ?? t.created_at.slice(0, 10))
    || (categorie || null) !== (t.categorie ?? null) || (moyen || null) !== (t.moyen_paiement ?? null)
    || (fournisseur || null) !== (t.supplier_id ?? null) || (tva === '' ? null : Number(tva)) !== (t.tva_rate ?? null))
  const etat = etatJustificatif(t)
  const noteDeFrais = t.moyen_paiement === 'personnel'

  return (
    <div className="flex flex-col gap-4 min-h-full">
      <div className="flex items-center gap-2">
        <Badge color={etat.ton}>{etat.libelle}</Badge>
        <span className="text-sm text-[var(--text-muted)] truncate">{t.note || t.file_name}</span>
        <button type="button" onClick={onFichier} className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline shrink-0">
          <ExternalLink size={13} /> Ouvrir en grand
        </button>
      </div>

      {t.mime_type?.startsWith('image/') && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-deep)] flex items-center justify-center h-72 overflow-hidden">
          {url ? <img src={url} alt="Justificatif" className="max-h-full max-w-full object-contain" /> : <Skeleton className="w-full h-full" />}
        </div>
      )}

      {t.statut === 'a_traiter' && (lectureEnCours || t.ocr_lecture) && (
        <BandeauLecture t={t} lectureEnCours={lectureEnCours} montantSaisi={Number.isNaN(cts) ? null : cts} />
      )}

      <Bloc titre="Détails">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Montant TTC (€)" error={invalide ? 'Montant invalide (ex. 12,50)' : undefined}>
            <input className="field" inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="12,50" disabled={!peutEcrire} aria-invalid={invalide} />
          </Champ>
          <Champ label="Date de la dépense">
            <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!peutEcrire} />
          </Champ>
          <Champ label="Catégorie">
            <select className="field" value={categorie} onChange={e => setCategorie(e.target.value as CategorieDepense | '')} disabled={!peutEcrire}>
              <option value="">Non précisée</option>
              {CATEGORIES_DEPENSE.map(c => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
            </select>
          </Champ>
          <Champ label="Fournisseur (facultatif : « Note de frais » par défaut)">
            <select className="field" value={fournisseur} onChange={e => setFournisseur(e.target.value)} disabled={!peutEcrire}>
              <option value="">Note de frais (par défaut)</option>
              {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Champ>
          <Champ label="TVA (facultative : 0 % par défaut)">
            <select className="field" value={tva} onChange={e => setTva(e.target.value)} disabled={!peutEcrire}>
              <option value="">0 % (par défaut)</option>
              {TAUX_TVA_JUSTIF.map(r => <option key={r} value={String(r)}>{String(r).replace('.', ',')} %</option>)}
            </select>
          </Champ>
          <Champ label="Payé avec">
            <select className="field" value={moyen} onChange={e => setMoyen(e.target.value)} disabled={!peutEcrire}>
              <option value="">Non précisé</option>
              <option value="carte_societe">Carte de la société</option>
              <option value="personnel">De sa poche (note de frais)</option>
            </select>
          </Champ>
        </div>
        {peutEcrire && modifie && (
          <div className="flex gap-2">
            <Button variant="primary" size="compact" disabled={busy}
              onClick={() => onEnregistrer({ montant_ttc_cts: cts, date_depense: date || null, categorie: categorie || null, moyen_paiement: moyen || null, supplier_id: fournisseur || null, tva_rate: tva === '' ? null : Number(tva) })}>
              Enregistrer les modifications
            </Button>
          </div>
        )}
      </Bloc>

      <Bloc titre="Suivi">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-[var(--text-muted)]">Déclarant</dt><dd className="text-[var(--text)]">{nom}</dd>
          <dt className="text-[var(--text-muted)]">Envoyé le</dt><dd className="text-[var(--text)]">{new Date(t.created_at).toLocaleString('fr-FR')}</dd>
          {t.note && <><dt className="text-[var(--text-muted)]">Note</dt><dd className="text-[var(--text)]">{t.note}</dd></>}
          {t.statut === 'ignore' && t.motif_refus && <><dt className="text-[var(--text-muted)]">Motif du refus</dt><dd className="text-[var(--danger)]">{t.motif_refus}</dd></>}
          {t.rembourse_le && <><dt className="text-[var(--text-muted)]">Remboursé le</dt><dd className="text-[var(--text)]">{jourFr(t.rembourse_le)}</dd></>}
        </dl>
      </Bloc>

      {t.statut === 'traite' && t.pennylane_envoye_le && (
        <Bloc titre="Pennylane">
          <p className="text-sm text-[var(--text)]">Envoyé à Pennylane le {new Date(t.pennylane_envoye_le).toLocaleString('fr-FR')}.</p>
        </Bloc>
      )}

      {peutEcrire && (
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 flex flex-col gap-3">
          {refus && (
            <div className="flex flex-wrap items-center gap-2">
              <input className="field flex-1 min-w-[14rem]" autoFocus value={motif} placeholder="Motif lu par le déclarant (ex. ticket illisible)"
                onChange={e => setMotif(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && motif.trim().length >= 5) onRefuser(motif.trim()) }} />
              <Button variant="primary" size="compact" disabled={busy || motif.trim().length < 5} onClick={() => onRefuser(motif.trim())}>Confirmer le refus</Button>
              <Button variant="secondary" size="compact" onClick={() => setRefus(false)}>Annuler</Button>
            </div>
          )}
          {!refus && (
            <div className="flex flex-wrap items-center gap-2">
              {t.statut === 'a_traiter' && (
                <>
                  <Button variant="primary" onClick={onCreerCharge} disabled={busy}><FilePlus2 size={15} /> Créer la charge</Button>
                  <Button variant="secondary" onClick={onValider} disabled={busy || modifie}><Check size={15} /> Valider et envoyer à Pennylane</Button>
                  <Button variant="ghost" className="ml-auto text-[var(--danger)]" onClick={() => setRefus(true)} disabled={busy}><X size={15} /> Refuser</Button>
                </>
              )}
              {t.statut === 'traite' && noteDeFrais && (
                t.rembourse_le
                  ? <Button variant="secondary" onClick={() => onRembourser(null)} disabled={busy}>Annuler le remboursement</Button>
                  : <Button variant="primary" onClick={() => onRembourser(aujourdhuiLocal())} disabled={busy}><Check size={15} /> Marquer remboursé</Button>
              )}
              {t.statut === 'traite' && !noteDeFrais && <span className="text-sm text-[var(--text-muted)]">Justificatif validé.</span>}
              {t.statut === 'ignore' && <span className="text-sm text-[var(--text-muted)]">Dépense refusée.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
