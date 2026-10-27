import { useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, ChevronDown, FolderPlus, FolderTree, ShieldCheck, Sparkles, Undo2, Wand2, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { getDownloadUrl } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { TYPES_DOCUMENT, cheminDefaut, choisirChemin, nomPropose, origineDuDocument, typeDe, type Annuaire, type ClasseHistorique } from '../../shared/lib/documentsTri'
import { montantSaisiEnCts } from '../../shared/lib/depenses'
import { aligner, cheminAvecAnnee, cheminEnTexte, correspondRecherche, estSur, optionsChemin, texteEnChemin } from './documents.logic'
import { analyserDescription, aujourdhuiLocal, suggererTypes, type Referents } from './decrire.logic'
import { noterCheminDrive, rangerDansDrive, remettreDansInbox } from './documents.queries'
import { MiniatureDoc } from './MiniatureDoc'

interface Edition {
  type: string
  date: string
  tiers: string
  montant: string
  reference: string
  nom: string
  /** Le nom a été tapé à la main : on ne le recalcule plus. */
  nomManuel: boolean
  /** Dossier du Drive, écrit « Achats / Carburant / 2026 ». */
  chemin: string
  /** Le chemin a été modifié à la main : il ne suit plus le type / la date. */
  cheminManuel: boolean
  /** Plaque reconnue (lue sur le document ou décrite par l'utilisateur) : sert au dossier du véhicule. */
  vehicule: string | null
  /** Partie du document (VERSO, RECTO, P2…) : dernier bloc du nom. */
  partie: string
  /** Pourquoi ce dossier : habitude, origine du document, convention, IA. `null` = choisi à la main. */
  via: ViaChemin | null
}

type ViaChemin = NonNullable<NonNullable<DocumentRow['proposition']>['chemin_via']>

const libelleVia = (via: ViaChemin | null, tiers: string): string | null =>
  via === 'habitude' ? `Comme d'habitude${tiers.trim() ? ` pour ${tiers.trim()}` : ''}` : via === 'origine' ? 'Selon l\'origine du document'
    : via === 'convention' ? 'Selon la convention' : via === 'ia' ? 'Choisi d\'après le document' : null

const SEUIL_DOUTE = 0.7
/** Documents envoyés au Drive par requête. */
const PAQUET = 8

const montantTexte = (cts: number | null | undefined) => (cts != null ? (cts / 100).toFixed(2).replace('.', ',') : '')
const depotDe = (d: DocumentRow) => d.created_at.slice(0, 10)

/** Dossier d'après l'habitude de l'utilisateur, puis la convention (type, tiers, véhicule, date du document ou du dépôt), aligné sur les dossiers du Drive. */
function cheminRegle(d: DocumentRow, e: { type: string; date: string; tiers: string; vehicule: string | null }, dossiers: string[][], histo: ClasseHistorique[]) {
  const t = e.type || null
  const r = choisirChemin({ type: t, date: e.date || (typeDe(t)?.intemporel ? null : depotDe(d)), tiers: e.tiers || null, vehicule: e.vehicule, parOrigine: d.proposition?.chemin_via === 'origine' }, { classes: histo, existants: dossiers })
  return r ? { chemin: aligner(r.chemin, dossiers), via: r.via } : null
}

function editionInitiale(d: DocumentRow, dossiers: string[][]): Edition {
  const p = d.proposition
  return {
    type: p?.type ?? '', date: p?.date ?? '', tiers: p?.tiers ?? '', montant: montantTexte(p?.montant_ttc_cts), reference: p?.reference ?? '',
    nom: p?.nom ?? d.file_name, nomManuel: false,
    chemin: cheminEnTexte(p?.chemin?.length ? p.chemin : cheminDefaut({ type: p?.type, date: p?.date, tiers: p?.tiers, vehicule: p?.vehicule }, dossiers)), cheminManuel: false,
    vehicule: p?.vehicule ?? null, partie: p?.partie ?? '', via: p?.chemin_via ?? null,
  }
}

/**
 * À confirmer : une carte compacte par document (nom proposé, dossier d'arrivée, Confirmer). Tout le reste est replié dans « Modifier les détails ».
 * La case « Dis-moi ce que c'est » renomme et reclasse tout de suite d'après une phrase (« permis Jean Dupont »), sans IA.
 */
export function ConfirmationTri({ docs, classes, miniatures, peutEcrire, driveOk, dossiers, referents, annuaire, onRanges, patch, toast }: {
  docs: DocumentRow[]
  classes: DocumentRow[]
  miniatures: Record<string, string>
  peutEcrire: boolean
  /** Compte Google connecté avec le scope Drive : sans lui, rien ne peut être rangé. */
  driveOk: boolean
  /** Dossiers existants du Drive (chemins relatifs au dossier de rangement). */
  dossiers: string[][]
  /** Clients, fournisseurs, salariés, plaques : « Dis-moi ce que c'est » reconnaît le tiers avec. */
  referents: Referents
  /** Fiches par identifiant : d'où vient un document (fiche salarié, véhicule, client, déposé par). */
  annuaire: Annuaire
  /** Appelé après un rangement réussi (le Drive a peut-être de nouveaux dossiers). */
  onRanges: () => void
  /** Met à jour des documents dans la liste de l'onglet, sans recharger. */
  patch: (ids: string[], maj: Partial<DocumentRow>) => void
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [editions, setEditions] = useState<Record<string, Edition>>({})
  const [envoi, setEnvoi] = useState(0)
  /** Carte dont on est en train de nommer un nouveau sous-dossier, et le nom en cours de saisie. */
  const [nouveau, setNouveau] = useState<{ id: string; nom: string } | null>(null)
  const [q, setQ] = useState('')
  /** Ce que l'utilisateur tape dans « Dis-moi ce que c'est », et la réponse quand la phrase n'est pas comprise. */
  const [decrits, setDecrits] = useState<Record<string, string>>({})
  const [messages, setMessages] = useState<Record<string, { texte: string; suggestions: string[] }>>({})

  const edition = (d: DocumentRow): Edition => editions[d.id] ?? editionInitiale(d, dossiers)
  const nomsPris = useMemo(() => new Set(classes.map(c => c.file_name.toLowerCase())), [classes])
  /** Ce que l'utilisateur a déjà rangé (du plus récent au plus ancien) : dossier et type habituels d'un tiers. */
  const histo = useMemo<ClasseHistorique[]>(() => classes.map(c => ({ type_document: c.type_document, tiers: c.tiers, drive_chemin: c.drive_chemin })), [classes])

  const modifier = (d: DocumentRow, maj: Partial<Edition>) => {
    const e = { ...edition(d), ...maj }
    // Tant que le nom n'a pas été tapé à la main, il suit le type / la date / le tiers / la référence (jamais le montant : convention).
    if (!e.nomManuel && !('nom' in maj)) {
      e.nom = nomPropose({ date: e.date || null, dateDepot: depotDe(d), type: e.type || null, tiers: e.tiers || null, reference: e.reference || null, partie: e.partie || null }, d.file_name, nomsPris)
    }
    // Tant que le chemin n'a pas été tapé à la main, il suit la règle de la convention (type, tiers, date) ; sans règle, il ne bouge qu'avec l'année.
    if (!e.cheminManuel && !('chemin' in maj) && ('type' in maj || 'tiers' in maj || 'date' in maj)) {
      const regle = cheminRegle(d, e, dossiers, histo)
      if (regle) { e.chemin = cheminEnTexte(regle.chemin); e.via = regle.via }
      else if ('type' in maj) { e.chemin = cheminEnTexte(cheminDefaut({ type: e.type || null }, dossiers)); e.via = null }
      else if ('date' in maj) e.chemin = cheminEnTexte(cheminAvecAnnee(texteEnChemin(e.chemin), e.date || null))
    }
    if ('chemin' in maj && maj.cheminManuel) e.via = null
    setEditions(p => ({ ...p, [d.id]: e }))
  }

  /**
   * « Permis de conduire Jean Dupont », « le verso du permis », « facture Leclerc 12345 » : type, tiers, date, référence, partie d'après la phrase ;
   * ce que la phrase ne dit pas vient de l'origine du document et de tes habitudes. Le nom et le dossier suivent aussitôt.
   */
  const decrire = (d: DocumentRow, typeImpose?: string) => {
    const texte = (decrits[d.id] ?? '').trim()
    if (!texte) return
    const r = analyserDescription(texte, referents, aujourdhuiLocal(), { origine: origineDuDocument(d, annuaire), classes: histo, type: typeImpose })
    if (!r) {
      setMessages(m => ({ ...m, [d.id]: { texte: 'Je ne sais pas encore ce que c\'est. Choisis un type :', suggestions: suggererTypes(texte, histo) } }))
      return
    }
    const e = edition(d)
    modifier(d, {
      type: r.type, tiers: r.tiers ?? e.tiers, date: r.date ?? e.date, reference: r.reference ?? e.reference, vehicule: r.vehicule ?? e.vehicule,
      partie: r.partie ?? '', montant: r.montant_ttc_cts != null ? montantTexte(r.montant_ttc_cts) : e.montant, nomManuel: false, cheminManuel: false,
    })
    // L'origine a complété le tiers : le dossier est « selon l'origine du document » tant que l'habitude ne le décide pas.
    if (r.parOrigine) setEditions(p => (p[d.id]?.via === 'convention' ? { ...p, [d.id]: { ...p[d.id], via: 'origine' } } : p))
    setMessages(m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== d.id)))
    setDecrits(t => ({ ...t, [d.id]: '' }))
  }

  const classement = (d: DocumentRow) => {
    const e = edition(d)
    const m = montantSaisiEnCts(e.montant)
    return {
      nom: e.nom.trim(), chemin: texteEnChemin(e.chemin), type: e.type || null, date: e.date || null, tiers: e.tiers.trim() || null, reference: e.reference.trim() || null,
      montant_ttc_cts: m != null && !Number.isNaN(m) ? m : null, resume: d.proposition?.resume ?? null,
    }
  }
  const pret = (d: DocumentRow) => { const e = edition(d); return driveOk && e.nom.trim() !== '' && e.type !== '' && texteEnChemin(e.chemin).length > 0 }

  /**
   * Range un lot : les cartes disparaissent TOUT DE SUITE (le document passe « classé » dans la liste), l'envoi vers le Drive se fait en
   * arrière-plan par paquets de 8 (une requête par paquet). Un document qui échoue revient dans À confirmer, tes corrections gardées.
   */
  const envoyer = async (lot: DocumentRow[]) => {
    if (lot.length === 0) return
    const items = lot.map(d => ({ id: d.id, classement: classement(d) }))
    const avant = new Map(lot.map(d => [d.id, d]))
    for (const it of items) patch([it.id], { statut_tri: 'classe', file_name: it.classement.nom, proposition: null })
    setEnvoi(n => n + lot.length)
    let ok = 0
    let premierEchec: string | null = null
    for (let i = 0; i < items.length; i += PAQUET) {
      const resultats = await rangerDansDrive(items.slice(i, i + PAQUET))
      for (const r of resultats) {
        if (r.ok) {
          ok++
          const chemin = cheminEnTexte(texteEnChemin(edition(avant.get(r.id)!).chemin))
          patch([r.id], { drive_chemin: chemin })
          void noterCheminDrive(r.id, chemin)
          continue
        }
        premierEchec ??= r.raison ?? 'Envoi impossible'
        const d = avant.get(r.id)
        if (d) patch([r.id], { statut_tri: 'propose', file_name: d.file_name, proposition: d.proposition })
      }
    }
    setEnvoi(n => n - lot.length)
    if (premierEchec) toast(`${lot.length - ok} non rangé${lot.length - ok > 1 ? 's' : ''} : ${premierEchec}`, 'error')
    if (ok > 0) onRanges()
    if (ok > 0) toast(ok === 1 ? 'Document rangé dans le Drive' : `${ok} documents rangés dans le Drive`)
  }

  const rejeter = async (d: DocumentRow) => {
    patch([d.id], { statut_tri: 'a_trier', proposition: null })
    const { error } = await remettreDansInbox(d.id)
    if (error) { patch([d.id], { statut_tri: 'propose', proposition: d.proposition }); toast(error.message, 'error'); return }
    toast('Remis dans l\'Inbox')
  }

  const ouvrir = async (d: DocumentRow) => {
    const url = await getDownloadUrl(d)
    if (url) ouvrirDocument(url, { titre: d.file_name, type: d.mime_type?.startsWith('image/') ? 'image' : undefined })
  }

  if (docs.length === 0) {
    return <EmptyState icon={<Sparkles size={40} />} title="Rien à confirmer" description="Lance le tri depuis l'Inbox : les propositions arrivent ici." />
  }

  // Les documents sûrs d'abord (tri stable : l'ordre d'arrivée est gardé dans chaque groupe).
  const visibles = docs.filter(d => correspondRecherche(d, q)).map((d, i) => ({ d, i, sur: estSur(d) }))
    .sort((a, b) => Number(b.sur) - Number(a.sur) || a.i - b.i).map(x => x.d)
  const prets = visibles.filter(pret).length

  const toutRanger = () => {
    const aFaire = visibles.filter(pret)
    if (visibles.length > aFaire.length) toast(`${visibles.length - aFaire.length} à compléter (type ou dossier manquant)`, 'error')
    void envoyer(aFaire)
  }

  return (
    <div className="flex flex-col gap-3">
      {envoi > 0 && (
        <p role="status" className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="size-2 rounded-full bg-[var(--brand)] animate-pulse" /> Envoi vers le Drive : {envoi} document{envoi > 1 ? 's' : ''}… tu peux continuer.
        </p>
      )}
      {!driveOk && (
        <p className="rounded-[var(--r-xl)] border border-[var(--warning)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text)]">
          Le Drive n'est pas branché : rien ne peut être rangé. Connecte le compte Google de la société dans Paramètres › Google (coche bien « Drive »).
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2.5">
        <BarreRecherche value={q} onChange={setQ} placeholder="Chercher : nom, tiers, type, dossier…" ariaLabel="Rechercher dans À confirmer"
          className="flex-1 min-w-[14rem] max-w-xl" compteur={`${visibles.length} sur ${docs.length}`} />
        {peutEcrire && (
          <Button variant="primary" className="min-h-10 ml-auto" disabled={prets === 0} onClick={toutRanger}>
            <CheckCheck size={15} /> Tout ranger ({prets})
          </Button>
        )}
      </div>

      {visibles.length === 0 && <p className="text-sm text-[var(--text-muted)] px-1">Aucun document ne correspond.</p>}
      <ul className="flex flex-col gap-2.5">
        {visibles.map(d => {
          const e = edition(d)
          const c = d.proposition?.confiance
          const p = d.proposition
          const douteux = (k: 'type' | 'date' | 'tiers' | 'montant') => (c ? c[k] < SEUIL_DOUTE : true)
          const bord = (k: 'type' | 'date' | 'tiers' | 'montant', vide: boolean) => (vide || douteux(k) ? '!border-[var(--warning)]' : '')
          const segments = texteEnChemin(e.chemin)
          const dossierNouveau = !!p?.chemin && e.chemin === cheminEnTexte(p.chemin) && (p.chemin_nouveaux ?? []).some(Boolean)
          return (
            <li key={d.id} className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-3 flex flex-col gap-2.5">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => void ouvrir(d)} aria-label="Ouvrir le document" className="shrink-0">
                  <MiniatureDoc mime={d.mime_type} url={d.storage_path ? miniatures[d.storage_path] : undefined} taille="lg" />
                </button>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input value={e.nom} aria-label="Nom proposé" disabled={!peutEcrire}
                      onChange={ev => modifier(d, { nom: ev.target.value, nomManuel: true })}
                      className="field font-medium text-[var(--text)] flex-1 min-w-0" />
                    {estSur(d) && <span title="Lu avec certitude" className="shrink-0 text-[var(--success)]"><ShieldCheck size={18} aria-label="Lu avec certitude" /></span>}
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] min-w-0" title={cheminEnTexte(segments)}>
                    <FolderTree size={14} className="shrink-0" />
                    <span className="truncate">{segments.length ? segments.join(' › ') : 'Aucun dossier choisi'}</span>
                    {dossierNouveau && <Badge color="warning">nouveau dossier</Badge>}
                  </p>
                  {libelleVia(e.via, e.tiers) && <p className="text-xs text-[var(--text-muted)] -mt-1 pl-5">{libelleVia(e.via, e.tiers)}</p>}
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)] min-w-0">
                    <span className="truncate">Fichier : {d.file_name}</span>
                    {p?.lu_via === 'nom' && <Badge color="warning">Pièce sensible : non lue par l'IA</Badge>}
                    {p?.lu_via === 'saisie' && <Badge color="info">Décrit par toi</Badge>}
                  </p>
                  {p?.doublon_de && (
                    <p className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
                      <AlertTriangle size={13} /> Peut-être déjà rangé : {p.doublon_de}
                    </p>
                  )}
                </div>
              </div>

              {peutEcrire && (
                <>
                  <form onSubmit={ev => { ev.preventDefault(); decrire(d) }} className="flex items-center gap-2">
                    <input value={decrits[d.id] ?? ''} onChange={ev => { setDecrits(t => ({ ...t, [d.id]: ev.target.value })); if (messages[d.id]) setMessages(m => Object.fromEntries(Object.entries(m).filter(([k]) => k !== d.id))) }}
                      placeholder="Dis-moi ce que c'est : « permis de conduire Jean Dupont »" aria-label="Dis-moi ce que c'est" className="field flex-1 min-w-0" />
                    <Button type="submit" variant="secondary" className="min-h-10 shrink-0" disabled={!(decrits[d.id] ?? '').trim()}>
                      <Wand2 size={15} /> Renommer
                    </Button>
                  </form>
                  {messages[d.id] && (
                    <div role="alert" className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--warning)] -mt-1">
                      <span>{messages[d.id].texte}</span>
                      {messages[d.id].suggestions.map(c => (
                        <button key={c} type="button" onClick={() => decrire(d, c)}
                          className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors">
                          {typeDe(c)?.libelle ?? c}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="primary" className="min-h-11 flex-1 sm:flex-none sm:min-w-[10rem]" disabled={!pret(d)} onClick={() => { void envoyer([d]) }}>
                      <Check size={16} /> Confirmer
                    </Button>
                    {driveOk && !pret(d) && <span className="text-xs text-[var(--warning)]">Choisis un type et un dossier.</span>}
                    <span className="ml-auto"><BoutonIcone icone={Undo2} libelle="Rejeter : remettre dans l'Inbox" onClick={() => void rejeter(d)} /></span>
                  </div>

                  <details className="group border-t border-[var(--border)] pt-2">
                    <summary className="flex items-center gap-1.5 cursor-pointer text-sm text-[var(--text-muted)] hover:text-[var(--text)] select-none list-none">
                      <ChevronDown size={15} className="transition-transform group-open:rotate-180" /> Modifier les détails
                    </summary>
                    <div className="flex flex-col gap-3 pt-3">
                      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                        <ListeDeroulante valeur={e.type} onChange={v => modifier(d, { type: v })} ariaLabel="Type de document" placeholder="Type…" recherche={false}
                          invalide={e.type === ''} options={TYPES_DOCUMENT.map(t => ({ valeur: t.cle, libelle: t.libelle, detail: t.dossier }))} />
                        <input type="date" value={e.date} onChange={ev => modifier(d, { date: ev.target.value })} aria-label="Date du document"
                          className={`field ${bord('date', false)}`} />
                        <input value={e.tiers} onChange={ev => modifier(d, { tiers: ev.target.value })} placeholder="Client / fournisseur / salarié" aria-label="Tiers"
                          className={`field ${bord('tiers', e.tiers === '')}`} />
                        <input value={e.reference} onChange={ev => modifier(d, { reference: ev.target.value })} placeholder="Référence (n° facture…)" aria-label="Référence" className="field" />
                        <input value={e.montant} onChange={ev => modifier(d, { montant: ev.target.value })} placeholder="Montant TTC (fiche)" inputMode="decimal" aria-label="Montant TTC (pas dans le nom)"
                          className={`field font-mono ${Number.isNaN(montantSaisiEnCts(e.montant) as number) ? '!border-[var(--danger)]' : ''}`} />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-muted)]">Dossier du Drive</span>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <ListeDeroulante valeur={e.chemin} onChange={v => modifier(d, { chemin: v, cheminManuel: true })} ariaLabel="Dossier du Drive"
                              placeholder="Choisir un dossier…" recherche invalide={segments.length === 0}
                              options={optionsChemin(dossiers, [segments, ...(p?.chemin ? [p.chemin] : []), ...(p?.alternatives ?? []).map(a => a.chemin)])} />
                          </div>
                          <BoutonIcone icone={FolderPlus} libelle="Créer un sous-dossier ici" onClick={() => setNouveau({ id: d.id, nom: '' })} actif={nouveau?.id === d.id} />
                        </div>
                        {nouveau?.id === d.id && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[var(--text-muted)] shrink-0">{e.chemin || 'Racine'} /</span>
                            <input autoFocus className="field flex-1 min-w-0" placeholder="Nom du nouveau dossier" value={nouveau.nom} onChange={ev => setNouveau({ id: d.id, nom: ev.target.value })}
                              onKeyDown={ev => {
                                if (ev.key === 'Escape') setNouveau(null)
                                if (ev.key === 'Enter' && nouveau.nom.trim()) { modifier(d, { chemin: cheminEnTexte(texteEnChemin(`${e.chemin} / ${nouveau.nom}`)), cheminManuel: true }); setNouveau(null) }
                              }} />
                            <BoutonIcone icone={Check} libelle="Créer ce sous-dossier" taille="sm" disabled={!nouveau.nom.trim()}
                              onClick={() => { modifier(d, { chemin: cheminEnTexte(texteEnChemin(`${e.chemin} / ${nouveau.nom}`)), cheminManuel: true }); setNouveau(null) }} />
                            <BoutonIcone icone={X} libelle="Annuler" taille="sm" onClick={() => setNouveau(null)} />
                          </div>
                        )}
                        {(p?.alternatives ?? []).length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <span>Sinon :</span>
                            {(p?.alternatives ?? []).map(a => (
                              <button key={a.chemin.join('/')} type="button" onClick={() => modifier(d, { chemin: cheminEnTexte(a.chemin), cheminManuel: true })}
                                className="rounded-full border border-[var(--border)] px-2.5 py-1 hover:bg-[var(--bg-card-hover)] hover:text-[var(--text)] transition-colors">
                                {cheminEnTexte(a.chemin)}
                              </button>
                            ))}
                          </div>
                        )}
                        {p?.resume && <p className="text-xs text-[var(--text-muted)]">{p.resume}</p>}
                      </div>
                    </div>
                  </details>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
