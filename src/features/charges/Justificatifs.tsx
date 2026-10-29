import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, FileText, Fuel, Hourglass, Inbox, Send, ThumbsDown, Wallet } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { supabase, useProfile } from '../../app/providers'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { PastilleFiltre } from '../../shared/ui/PastilleFiltre'
import { Drawer } from '../../shared/ui/Drawer'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { EmptyState } from '../../shared/ui/EmptyState'
import { GroupeMois } from '../../shared/ui/GroupeMois'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney } from '../../shared/lib/money'
import { estCarburant, libelleCategorie, manquesValidation, totalARembourser } from '../../shared/lib/depenses'
import { grouperParMois, libelleMois } from '../../shared/lib/mois'
import { libelleCarte } from '../../shared/lib/cartes'
import { useCartes } from '../../shared/lib/useCartes'
import {
  classerTicket, corrigerTicket, envoyerVersPennylane, lireTicketIa, listerTickets, remettreATraiter, supprimerDepense,
  marquerRembourse, refuserDepense, urlTicket, urlsTickets, vehiculesPourPlein, type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'
import { FicheJustificatif, Paiement, type MajJustificatif } from './FicheJustificatif'
import { nomsDeclarants } from './charges.queries'
import { SuiviCarburant } from './SuiviCarburant'
import { listerPleinsManuels, membresPourPlein, type PleinManuel } from './pleinsManuels.queries'
import {
  CRITERES_VIDES, LIBELLE_TYPE, ORDRE_TYPES, compterParType, compteursJustificatifs, etatJustificatif, filtrerJustificatifs, jourJustif,
  moisPresents, nbCriteresActifs, sectionsATraiter, type CriteresJustif, type FiltreJustif,
} from './justificatifs.logic'

const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Miniature du ticket (photo) ; pictogramme pour un PDF ou tant que le lien n'est pas arrivé. */
function Miniature({ t, url }: { t: TicketInbox; url: string | undefined }) {
  return (
    <span className="h-11 w-11 shrink-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] overflow-hidden flex items-center justify-center text-[var(--text-disabled)]">
      {url && t.mime_type?.startsWith('image/')
        ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <FileText size={18} />}
    </span>
  )
}

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
  const dus = useMemo(() => totalARembourser(tickets.map(t => ({
    moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut, rembourse_le: t.rembourse_le,
  }))), [tickets])
  const visibles = useMemo(() => filtrerJustificatifs(tickets, filtre, q, noms, criteres), [tickets, filtre, q, noms, criteres])
  // Pastilles de famille : comptées avec tous les AUTRES filtres appliqués (donc le chiffre annonce ce qu'on obtiendrait en cliquant).
  const parType = useMemo(
    () => compterParType(filtrerJustificatifs(tickets, filtre, q, noms, { ...criteres, type: 'tous' })),
    [tickets, filtre, q, noms, criteres])
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
    await charger()
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
    await charger()
  }

  const tableau = (liste: TicketInbox[]) => (
    <>
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
            <th className="pl-4 pr-2 py-2.5 font-medium">Justificatif</th>
            <th className="px-2 py-2.5 font-medium">Déclarant</th>
            <th className="px-2 py-2.5 font-medium">Paiement</th>
            <th className="px-2 py-2.5 font-medium w-16">Date</th>
            <th className="px-2 py-2.5 font-medium text-right">Montant TTC</th>
            <th className="px-2 py-2.5 font-medium w-32">Statut</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {liste.map(t => {
            const etat = etatJustificatif(t)
            const nom = nomDe(t)
            return (
              <tr key={t.id} onClick={() => setOuvertId(t.id)} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') setOuvertId(t.id) }}
                className="group border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors">
                <td className="pl-4 pr-2 py-2.5 max-w-[24rem]">
                  <span className="flex items-center gap-3 min-w-0">
                    <Miniature t={t} url={miniatures[t.storage_path]} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--text)]">{t.note || t.file_name}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">{t.categorie ? libelleCategorie(t.categorie) : 'Catégorie non précisée'}</span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center gap-2 text-[var(--text)]">
                    <AvatarInitiales nom={nom} taille="sm" />
                    {nom}
                  </span>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap"><Paiement moyen={t.moyen_paiement} carte={t.carte} /></td>
                <td className="px-2 py-2.5 font-mono text-xs text-[var(--text-muted)]">{jourCourt(jourJustif(t))}</td>
                <td className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                  {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : <span className="font-sans font-medium text-[var(--danger)]">À saisir</span>}
                </td>
                <td className="px-2 py-2.5"><Badge color={etat.ton}>{etat.libelle}</Badge></td>
                <td className="pr-3 text-[var(--text-disabled)] group-hover:text-[var(--text-muted)]"><ChevronRight size={16} /></td>
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
              <button type="button" onClick={() => setOuvertId(t.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-card-hover)]">
                <Miniature t={t} url={miniatures[t.storage_path]} />
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="flex items-start gap-2">
                    <span className="flex-1 min-w-0 truncate font-medium text-[var(--text)]">{t.note || t.file_name}</span>
                    <span className="font-mono font-semibold tabular-nums text-[var(--text)] shrink-0">
                      {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : <span className="font-sans text-[var(--danger)]">À saisir</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="truncate">{nomDe(t)} · {jourCourt(jourJustif(t))}</span>
                    <span className="ml-auto shrink-0"><Badge color={etat.ton}>{etat.libelle}</Badge></span>
                  </span>
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ChiffreCarte libelle="À traiter" icone={<Hourglass size={13} />} valeur={String(compteurs.a_traiter)}
                ton={compteurs.a_traiter > 0 ? 'warning' : undefined} detail={compteurs.a_traiter > 0 ? 'à valider par le bureau' : 'rien en attente'}
                titre="Justificatifs à traiter" actif={filtre === 'a_traiter'} onClick={() => setFiltre('a_traiter')} />
              <ChiffreCarte libelle="À rembourser" icone={<Wallet size={13} />} valeur={formatMoney(dus)}
                ton={dus > 0 ? 'warning' : undefined} detail={`${compteurs.a_rembourser} note${compteurs.a_rembourser > 1 ? 's' : ''} de frais`}
                titre="Notes de frais à rembourser" actif={filtre === 'a_rembourser'} onClick={() => setFiltre('a_rembourser')} />
              <ChiffreCarte libelle="Validés" icone={<Send size={13} />} valeur={String(compteurs.valides)}
                detail="validés par le bureau" titre="Justificatifs validés" actif={filtre === 'valides'} onClick={() => setFiltre('valides')} />
              <ChiffreCarte libelle="Refusés" icone={<ThumbsDown size={13} />} valeur={String(compteurs.refuses)}
                ton={compteurs.refuses > 0 ? 'danger' : undefined} detail="motif lu par le déclarant"
                titre="Justificatifs refusés" actif={filtre === 'refuses'} onClick={() => setFiltre('refuses')} />
            </div>

            <BarreRecherche value={q} onChange={setQ} placeholder="Chercher un justificatif : note, catégorie, déclarant…" ariaLabel="Rechercher un justificatif"
              raccourci className="max-w-xl" compteur={`${visibles.length} résultat${visibles.length > 1 ? 's' : ''}`} />

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtres">
              <PastilleFiltre actif={criteres.type === 'tous'} onClick={() => majCriteres({ type: 'tous' })}>
                Tous <span className="font-mono text-xs opacity-70">{parType.note_de_frais + parType.cb + parType.carburant + parType.autre}</span>
              </PastilleFiltre>
              {ORDRE_TYPES.filter(t => t !== 'autre' || parType.autre > 0).map(t => (
                <PastilleFiltre key={t} actif={criteres.type === t} onClick={() => majCriteres({ type: criteres.type === t ? 'tous' : t })}>
                  {LIBELLE_TYPE[t]} <span className="font-mono text-xs opacity-70">{parType[t]}</span>
                </PastilleFiltre>
              ))}
              <PastilleFiltre actif={criteres.incomplets} onClick={() => majCriteres({ incomplets: !criteres.incomplets })}>À compléter</PastilleFiltre>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56"><ListeDeroulante valeur={criteres.declarant} onChange={v => majCriteres({ declarant: v })} recherche ariaLabel="Déclarant"
                placeholder="Tous les déclarants" options={[{ valeur: '', libelle: 'Tous les déclarants' }, ...optionsDeclarants]} /></div>
              {optionsCartes.length > 0 && (
                <div className="w-56"><ListeDeroulante valeur={criteres.carte} onChange={v => majCriteres({ carte: v })} recherche ariaLabel="Carte"
                  placeholder="Toutes les cartes" options={[{ valeur: '', libelle: 'Toutes les cartes' }, ...optionsCartes]} /></div>
              )}
              <div className="w-48"><ListeDeroulante valeur={criteres.mois} onChange={v => majCriteres({ mois: v })} ariaLabel="Mois"
                placeholder="Tous les mois" options={[{ valeur: '', libelle: 'Tous les mois' }, ...optionsMois]} /></div>
              {nbCriteres > 0 && (
                <Button variant="secondary" size="compact" onClick={() => setCriteres(CRITERES_VIDES)}>Réinitialiser ({nbCriteres})</Button>
              )}
            </div>

            {visibles.length === 0 ? (
              <EmptyState icon={<Inbox size={40} />} title="Rien ici"
                description={tickets.length === 0 ? 'Aucun justificatif reçu pour le moment.' : nbCriteres > 0 ? 'Aucun justificatif avec ces filtres.' : 'Aucun justificatif dans ce filtre.'} />
            ) : filtre === 'a_traiter' ? (
              <div className="flex flex-col gap-3">
                {sections.map(s => (
                  <GroupeMois key={`${s.cle}-${JSON.stringify(criteres)}-${q !== ''}`} titre={s.libelle} ouvertDefaut
                    resume={<>
                      <span>{s.rows.length} justificatif{s.rows.length > 1 ? 's' : ''}</span>
                      <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(s.totalCts)}</span>
                    </>}>
                    {s.parSalarie ? (
                      <div className="flex flex-col gap-2 p-2">
                        {s.parSalarie.map(g => (
                          <GroupeMois key={`${g.cle}-${JSON.stringify(criteres)}`} titre={g.libelle} ouvertDefaut
                            resume={<>
                              <span>{g.rows.length} note{g.rows.length > 1 ? 's' : ''}</span>
                              <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(g.totalCts)}</span>
                            </>}>
                            {tableau(g.rows)}
                          </GroupeMois>
                        ))}
                      </div>
                    ) : tableau(s.rows)}
                  </GroupeMois>
                ))}
              </div>
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

      <Drawer open={ouvert != null} onClose={() => setOuvertId(null)} width="max-w-[68rem]" title="Justificatif">
        {ouvert && (
          <FicheJustificatif key={`${ouvert.id}-${ouvert.ocr_lu_le ?? ''}`} t={ouvert} lectureEnCours={lectureEnCours && !ouvert.ocr_lu_le} nom={nomDe(ouvert)} peutEcrire={peutEcrire} busy={busy} fournisseurs={fournisseurs} vehicules={vehicules}
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
