import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Fuel, Hourglass, Inbox, Send, ThumbsDown, Wallet } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { supabase, useProfile } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { EmptyState } from '../../shared/ui/EmptyState'
import { GroupeMois } from '../../shared/ui/GroupeMois'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney } from '../../shared/lib/money'
import { estCarburant, manquesValidation, totalARembourser } from '../../shared/lib/depenses'
import { grouperParMois, libelleMois } from '../../shared/lib/mois'
import { libelleCarte } from '../../shared/lib/cartesBancaires'
import { useCartes } from '../../shared/lib/useCartesBancaires'
import {
  classerTicket, corrigerTicket, envoyerVersPennylane, lireTicketIa, listerTickets, remettreATraiter, supprimerDepense,
  marquerRembourse, refuserDepense, urlTicket, urlsTickets, vehiculesPourPlein, type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'
import { FicheJustificatif, type MajJustificatif } from './FicheJustificatif'
import { nomsDeclarants } from './charges.queries'
import { SuiviCarburant } from './SuiviCarburant'
import { BarreFiltresJustificatifs } from './BarreFiltresJustificatifs'
import { ListeJustificatifs, type ModeListe } from './ListeJustificatifs'
import { TuileStatut } from './TuilesJustificatifs'
import { listerPleinsManuels, membresPourPlein, type PleinManuel } from './pleinsManuels.queries'
import {
  CRITERES_VIDES, compterParType, compteursJustificatifs, filtrerJustificatifs, jourJustif, moisPresents, montantsParStatut,
  nbCriteresActifs, sectionsATraiter, type CriteresJustif, type FiltreJustif, type GroupeJustif, type TypeJustif,
} from './justificatifs.logic'

/**
 * Onglet Justificatifs (Finance) : tickets et dépenses envoyés par les salariés et associés.
 * La liste se LIT (tableau, un état par ligne) ; on AGIT dans le tiroir d'un justificatif : voir la photo,
 * corriger (anciens tickets sans montant, un par un), valider (montant obligatoire), créer la charge, refuser
 * (motif lu par le déclarant), marquer remboursé (le salarié le voit). Même droit que Charges (`finance.charges`).
 */
export function Justificatifs() {
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutEcrire = can('finance.charges', 'update')
  const { companyId } = useProfile()
  const cartesBancaires = useCartes()

  const [tickets, setTickets] = useState<TicketInbox[]>([])
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [fournisseurs, setFournisseurs] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [manuels, setManuels] = useState<PleinManuel[]>([])
  const [membres, setMembres] = useState<Array<{ id: string; full_name: string }>>([])
  const [vue, setVue] = useState<'justificatifs' | 'carburant'>('justificatifs')
  const [vehicules, setVehicules] = useState<Array<{ id: string; label: string; plate: string | null }>>([])
  const [filtre, setFiltre] = useState<FiltreJustif>('a_traiter')
  const [criteres, setCriteres] = useState<CriteresJustif>(CRITERES_VIDES)
  const [q, setQ] = useState('')
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lectureEnCours, setLectureEnCours] = useState(false)
  const [miniatures, setMiniatures] = useState<Record<string, string>>({})
  const dejaLus = useRef(new Set<string>())

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true)
    const { data, error } = await listerTickets()
    if (error) { setErreur(error.message); setLoading(false); return }
    setErreur(null)
    const liste = data ?? []
    setTickets(liste)
    setLoading(false)
    setNoms(await nomsDeclarants(liste.map(t => t.uploaded_by ?? '')))
  }, [])

  useEffect(() => { void charger() }, [charger])
  // Nouveaux justificatifs : l'onglet se rafraîchit seul toutes les 60 s (onglet visible), sans clignoter ni fermer le tiroir.
  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void charger(true) }, 60_000)
    return () => window.clearInterval(id)
  }, [charger])
  useEffect(() => { void vehiculesPourPlein().then(setVehicules) }, [])
  const chargerManuels = useCallback(async () => {
    const { data } = await listerPleinsManuels()
    setManuels(data ?? [])
  }, [])
  useEffect(() => { void chargerManuels() }, [chargerManuels])
  useEffect(() => { void membresPourPlein().then(setMembres) }, [])
  useEffect(() => {
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setFournisseurs((data ?? []) as Array<{ id: string; name: string }>))
  }, [])

  const compteurs = useMemo(() => compteursJustificatifs(tickets), [tickets])
  const montants = useMemo(() => montantsParStatut(tickets), [tickets])
  const dus = useMemo(() => totalARembourser(tickets.map(t => ({
    moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut, rembourse_le: t.rembourse_le,
  }))), [tickets])
  // La recherche porte aussi sur la carte, le véhicule et le montant (« 62,40 »).
  const texteSup = useCallback((t: TicketInbox) => [
    libelleCarte(t.carte, cartesBancaires),
    vehicules.find(v => v.id === t.vehicle_id)?.label ?? '',
    t.montant_ttc_cts != null ? (t.montant_ttc_cts / 100).toFixed(2).replace('.', ',') : '',
  ].join(' '), [cartesBancaires, vehicules])
  const visibles = useMemo(() => filtrerJustificatifs(tickets, filtre, q, noms, criteres, texteSup), [tickets, filtre, q, noms, criteres, texteSup])
  // Pastilles de famille : comptées avec tous les AUTRES filtres appliqués (donc le chiffre annonce ce qu'on obtiendrait en cliquant).
  const parType = useMemo(
    () => compterParType(filtrerJustificatifs(tickets, filtre, q, noms, { ...criteres, type: 'tous' }, texteSup)),
    [tickets, filtre, q, noms, criteres, texteSup])
  const optionsDeclarants = useMemo(() => {
    const ids = [...new Set(tickets.map(t => t.uploaded_by).filter((x): x is string => !!x))]
    return ids.map(id => ({ valeur: id, libelle: noms[id] ?? 'Déclarant inconnu' })).sort((a, b) => a.libelle.localeCompare(b.libelle))
  }, [tickets, noms])
  const optionsCartes = useMemo(() => {
    const presentes = [...new Set(tickets.map(t => t.carte).filter((x): x is string => !!x))]
    return presentes.map(code => ({ valeur: code, libelle: libelleCarte(code, cartesBancaires) })).sort((a, b) => a.libelle.localeCompare(b.libelle))
  }, [tickets, cartesBancaires])
  const optionsMois = useMemo(() => moisPresents(tickets).map(m => ({ valeur: m, libelle: libelleMois(m) })), [tickets])
  const nbCriteres = nbCriteresActifs(criteres)
  const majCriteres = (c: Partial<CriteresJustif>) => setCriteres(prev => ({ ...prev, ...c }))
  // Miniatures : liens signés des photos affichées, demandés une seule fois par chemin (100 au plus par lot).
  useEffect(() => {
    const manquants = visibles.filter(t => t.mime_type?.startsWith('image/') && !miniatures[t.storage_path]).slice(0, 100).map(t => t.storage_path)
    if (manquants.length === 0) return
    let annule = false
    void urlsTickets(manquants).then(m => { if (!annule) setMiniatures(prev => ({ ...prev, ...m })) })
    return () => { annule = true }
  }, [visibles, miniatures])

  const parMois = useMemo(() => grouperParMois(visibles, t => jourJustif(t)), [visibles])
  const nomDe = useCallback((t: TicketInbox) => (t.uploaded_by ? (noms[t.uploaded_by] ?? 'Déclarant inconnu') : 'Déclarant inconnu'), [noms])
  const sections = useMemo(() => (filtre === 'a_traiter' ? sectionsATraiter(visibles, nomDe) : []), [filtre, visibles, nomDe])
  const ouvert = tickets.find(t => t.id === ouvertId) ?? null

  // La lecture du ticket par l'IA part dès le dépôt (une seule fois). Rattrapage silencieux, sans recharger l'écran, des
  // tickets déposés avant ou dont la lecture a échoué : une tentative par ticket et par session, huit au plus.
  useEffect(() => {
    if (!peutEcrire) return
    const aLire = tickets.filter(t => t.statut === 'a_traiter' && !t.ocr_lu_le && !dejaLus.current.has(t.id)).slice(0, 8)
    if (aLire.length === 0) return
    aLire.forEach(t => dejaLus.current.add(t.id))
    setLectureEnCours(true)
    void (async () => {
      for (const t of aLire) await lireTicketIa(t.id)
      await charger(true)
    })().finally(() => setLectureEnCours(false))
  }, [tickets, peutEcrire, charger])

  const ouvrirFichier = async (t: TicketInbox) => {
    const url = await urlTicket(t)
    if (!url) { toast('Fichier introuvable', 'error'); return }
    ouvrirDocument(url, { titre: t.note || t.file_name, type: t.mime_type?.startsWith('image/') ? 'image' : 'pdf' })
  }

  const agir = async (action: () => Promise<{ error: { message: string } | null }>, succes: string, fermer = false) => {
    setBusy(true)
    const { error } = await action()
    setBusy(false)
    if (error) { toast(error.message, 'error'); return false }
    toast(succes)
    if (fermer) setOuvertId(null)
    await charger(true)
    return true
  }

  /** Enregistre ce qui est à l'écran, vérifie que tout est rempli, puis valide et envoie. */
  const valider = async (t: TicketInbox, maj: MajJustificatif) => {
    const manques = manquesValidation({ ...t, ...maj })
    if (manques.length) { toast(`Validation impossible : ${manques.join(', ').toLowerCase()} manquant.`, 'error'); return }
    setBusy(true)
    const { error } = await corrigerTicket(t.id, maj)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    if (estCarburant(maj.moyen_paiement)) {
      // Carte carburant : validé pour le suivi, rien n'est envoyé à Pennylane (facture mensuelle de la carte).
      await agir(() => classerTicket(t.id, 'traite'), 'Plein validé (suivi carburant)', true)
      return
    }
    await validerEtEnvoyer(t)
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
    await charger(true)
  }

  /** Renvoie un justificatif déjà validé à Pennylane (envoi échoué, ou jamais parti). */
  const renvoyer = async (t: TicketInbox) => {
    setBusy(true)
    const envoi = await envoyerVersPennylane(t.id)
    setBusy(false)
    if (envoi.ok) toast('Envoyé à Pennylane (« À traiter »)')
    else toast(`Envoi à Pennylane échoué : ${envoi.message}`, 'error')
    await charger(true)
  }

  const modeSection = (cle: TypeJustif): ModeListe => (cle === 'note_de_frais' ? 'ndf' : cle === 'cb' ? 'cb' : cle === 'carburant' ? 'carburant' : 'mixte')
  const liste = (lignes: TicketInbox[], mode: ModeListe, aTraiter: boolean, groupes?: Array<GroupeJustif<TicketInbox>>) => (
    <ListeJustificatifs lignes={lignes} groupes={groupes} mode={mode} aTraiter={aTraiter} miniatures={miniatures} nomDe={nomDe}
      vehicules={vehicules} onOuvrir={setOuvertId} />
  )
  const cleFiltres = `${JSON.stringify(criteres)}-${q !== ''}`
  const euros = (cts: number) => formatMoney(cts)

  return (
    <Shell pageTitle="Justificatifs">
      <div className="flex flex-col gap-3 pb-16 md:pb-0">
        <div role="tablist" aria-label="Vue" className="inline-flex self-start rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-0.5">
          {([['justificatifs', 'Justificatifs', FileText], ['carburant', 'Carburant', Fuel]] as const).map(([cle, libelle, Icone]) => (
            <button key={cle} type="button" role="tab" aria-selected={vue === cle} onClick={() => setVue(cle)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[var(--r-md)] transition-colors ${
                vue === cle ? 'bg-[var(--brand)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              <Icone size={14} /> {libelle}
            </button>
          ))}
        </div>
        {loading ? (
          <Skeleton className="h-40" />
        ) : erreur ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <p className="text-[var(--danger)] text-sm">{erreur}</p>
            <Button variant="secondary" onClick={() => void charger()}>Réessayer</Button>
          </div>
        ) : vue === 'carburant' ? (
          <SuiviCarburant tickets={tickets} manuels={manuels} vehicules={vehicules} membres={membres} noms={noms} companyId={companyId ?? ''}
            peutEcrire={peutEcrire && !!companyId} peutSupprimer={can('finance.charges', 'delete')} onOuvrir={setOuvertId} onManuelsChange={chargerManuels} />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <TuileStatut libelle="À traiter" icone={<Hourglass size={12} />} valeur={String(compteurs.a_traiter)}
                ton={compteurs.a_traiter > 0 ? 'warning' : undefined} detail={compteurs.a_traiter > 0 ? `${euros(montants.a_traiter)} à valider` : 'rien en attente'}
                titre="Justificatifs à traiter" actif={filtre === 'a_traiter'} onClick={() => setFiltre('a_traiter')} />
              <TuileStatut libelle="À rembourser" icone={<Wallet size={12} />} valeur={euros(dus)}
                ton={dus > 0 ? 'warning' : undefined} detail={`${compteurs.a_rembourser} note${compteurs.a_rembourser > 1 ? 's' : ''} de frais`}
                titre="Notes de frais à rembourser" actif={filtre === 'a_rembourser'} onClick={() => setFiltre('a_rembourser')} />
              <TuileStatut libelle="Validés" icone={<Send size={12} />} valeur={String(compteurs.valides)}
                detail={`${euros(montants.valides)} TTC`} titre="Justificatifs validés" actif={filtre === 'valides'} onClick={() => setFiltre('valides')} />
              <TuileStatut libelle="Refusés" icone={<ThumbsDown size={12} />} valeur={String(compteurs.refuses)}
                ton={compteurs.refuses > 0 ? 'danger' : undefined} detail={`${euros(montants.refuses)} TTC`}
                titre="Justificatifs refusés" actif={filtre === 'refuses'} onClick={() => setFiltre('refuses')} />
            </div>

            <BarreFiltresJustificatifs q={q} onQ={setQ} nbResultats={visibles.length} criteres={criteres} onCriteres={majCriteres} parType={parType}
              optionsDeclarants={optionsDeclarants} optionsCartes={optionsCartes} optionsMois={optionsMois} />

            {tickets.length >= 500 && (
              <p className="text-xs text-[var(--warning)]">Seuls les 500 justificatifs les plus récents sont affichés : les plus anciens ne sont pas listés.</p>
            )}

            {visibles.length === 0 ? (
              <EmptyState icon={<Inbox size={40} />} title="Rien ici"
                description={tickets.length === 0 ? 'Aucun justificatif reçu pour le moment.' : nbCriteres > 0 ? 'Aucun justificatif avec ces filtres.' : 'Aucun justificatif dans ce filtre.'} />
            ) : filtre === 'a_traiter' ? (
              <div className="flex flex-col gap-3">
                {sections.map(s => (
                  <GroupeMois key={`${s.cle}-${cleFiltres}`} titre={s.libelle} ouvertDefaut
                    resume={<>
                      <span>{s.rows.length}<span className="hidden sm:inline"> justificatif{s.rows.length > 1 ? 's' : ''}</span></span>
                      {!(s.totalCts === 0 && s.sansMontant > 0) && <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(s.totalCts)}</span>}
                      {s.sansMontant > 0 && <span className="text-[var(--warning)] hidden sm:inline">{s.totalCts === 0 ? '' : '+ '}{s.sansMontant} sans montant</span>}
                    </>}>
                    {liste(s.rows, modeSection(s.cle), true, s.parSalarie)}
                  </GroupeMois>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {parMois.map((g, i) => (
                  <GroupeMois key={`${g.cle}-${filtre}-${q !== ''}`} titre={g.libelle} ouvertDefaut={q !== '' || i === 0}
                    resume={<>
                      <span>{g.rows.length}<span className="hidden sm:inline"> justificatif{g.rows.length > 1 ? 's' : ''}</span></span>
                      <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(g.rows.reduce((s, t) => s + (t.montant_ttc_cts ?? 0), 0))}</span>
                    </>}>
                    {liste(g.rows, 'mixte', false)}
                  </GroupeMois>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Drawer open={ouvert != null} onClose={() => setOuvertId(null)} width="max-w-[68rem]" title="Justificatif">
        {ouvert && (
          <FicheJustificatif key={`${ouvert.id}-${ouvert.ocr_lu_le ?? ''}`} t={ouvert} lectureEnCours={lectureEnCours && !ouvert.ocr_lu_le} nom={nomDe(ouvert)} peutEcrire={peutEcrire} busy={busy} fournisseurs={fournisseurs} vehicules={vehicules} onRenvoyer={() => void renvoyer(ouvert)}
            onFichier={() => void ouvrirFichier(ouvert)}
            onEnregistrer={maj => void agir(() => corrigerTicket(ouvert.id, maj), 'Justificatif corrigé')}
            onValider={maj => void valider(ouvert, maj)}
            onRefuser={motif => void agir(() => refuserDepense(ouvert.id, motif), 'Dépense refusée : le déclarant voit le motif', true)}
            onRembourser={date => void agir(() => marquerRembourse(ouvert.id, date), date ? 'Remboursée : le salarié le voit' : 'Remboursement annulé')}
            peutSupprimer={can('finance.charges', 'delete')}
            onRemettre={() => void agir(() => remettreATraiter(ouvert.id), 'Remis à traiter', true)}
            onSupprimer={() => void agir(() => supprimerDepense(ouvert), 'Justificatif supprimé', true)} />
        )}
      </Drawer>
    </Shell>
  )
}
