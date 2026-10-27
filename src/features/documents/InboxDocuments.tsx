import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckSquare, Square, Sparkles, Trash2, UploadCloud, Wand2 } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { deleteDocument, getDownloadUrl } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { correspondRecherche, estAncienDrive, libelleSource, lisibleParIA, lotsDe, tailleLisible } from './documents.logic'
import { deposerDansInbox, ecrirePropositionSaisie, lancerTri, type ResultatTri } from './documents.queries'
import { analyserDescription, aujourdhuiLocal, propositionDepuisDescription, suggererTypes, type Referents } from './decrire.logic'
import { origineDuDocument, typeDe, type Annuaire, type ClasseHistorique } from '../../shared/lib/conventionDocuments'
import { MiniatureDoc } from './MiniatureDoc'

const PAR_LOT = 5
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

/**
 * Inbox : tout ce qui n'est pas encore rangé. On dépose, puis UN geste : « Trier » (tout, ou la sélection). L'IA propose, rien n'est appliqué.
 * Un document que l'IA n'a pas su lire se décrit à la main (baguette) : « permis Jean Dupont » → il passe directement dans À confirmer.
 */
export function InboxDocuments({ docs, classes, miniatures, companyId, peutEcrire, peutSupprimer, dossiers, referents, annuaire, patch, onChange, onTermine, toast }: {
  docs: DocumentRow[]
  /** Documents déjà rangés : leurs noms ne doivent jamais être repris. */
  classes: DocumentRow[]
  dossiers: string[][]
  referents: Referents
  /** Fiches par identifiant : d'où vient un document (fiche salarié, véhicule, client, déposé par). */
  annuaire: Annuaire
  patch: (ids: string[], maj: Partial<DocumentRow>) => void
  miniatures: Record<string, string>
  companyId: string
  peutEcrire: boolean
  peutSupprimer: boolean
  onChange: () => Promise<void>
  /** Appelé en fin de tri avec le nombre de propositions obtenues. */
  onTermine: (propositions: number) => void
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [q, setQ] = useState('')
  const [ouvertId, setOuvertId] = useState<string | null>(null)
  const [decrit, setDecrit] = useState('')
  const [messageDecrit, setMessageDecrit] = useState<{ texte: string; suggestions: string[] } | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [depot, setDepot] = useState<{ fait: number; total: number } | null>(null)
  const [survol, setSurvol] = useState(false)
  const [tri, setTri] = useState<{ fait: number; total: number } | null>(null)
  const [echecs, setEchecs] = useState<Record<string, string>>({})
  const [aSupprimer, setASupprimer] = useState<DocumentRow | null>(null)
  const [purgerDrive, setPurgerDrive] = useState(false)
  const annule = useRef(false)
  const fichierRef = useRef<HTMLInputElement>(null)

  const visibles = useMemo(() => docs.filter(d => correspondRecherche(d, q)), [docs, q])
  const lisibles = visibles.filter(lisibleParIA)
  const anciensDrive = docs.filter(estAncienDrive)
  const choisis = lisibles.filter(d => selection.has(d.id))
  /** Sans sélection, « Trier » prend tout ce que l'IA sait lire. */
  const aTrier = choisis.length > 0 ? choisis : lisibles
  const nomsPris = useMemo(() => new Set(classes.map(c => c.file_name.toLowerCase())), [classes])
  /** Ce que l'utilisateur a déjà rangé (du plus récent au plus ancien) : dossier et type habituels d'un tiers. */
  const histo = useMemo<ClasseHistorique[]>(() => classes.map(c => ({ type_document: c.type_document, tiers: c.tiers, drive_chemin: c.drive_chemin })), [classes])

  const basculer = (id: string) => setSelection(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const deposer = async (liste: FileList | File[] | null) => {
    const fichiers = liste ? Array.from(liste) : []
    if (fichiers.length === 0 || !companyId) return
    setDepot({ fait: 0, total: fichiers.length })
    const { ok, echecs: erreurs } = await deposerDansInbox(fichiers, companyId, (fait, total) => setDepot({ fait, total }))
    setDepot(null)
    if (fichierRef.current) fichierRef.current.value = ''
    if (ok > 0) toast(`${ok} document${ok > 1 ? 's' : ''} déposé${ok > 1 ? 's' : ''} dans l'Inbox`)
    if (erreurs.length > 0) toast(`${erreurs.length} échec${erreurs.length > 1 ? 's' : ''} : ${erreurs[0]}`, 'error')
    await onChange()
  }

  const lancer = async () => {
    const ids = aTrier.map(d => d.id)
    if (ids.length === 0) return
    annule.current = false
    setEchecs({})
    setTri({ fait: 0, total: ids.length })
    let obtenues = 0
    const nouveaux: Record<string, string> = {}
    let fait = 0
    for (const lot of lotsDe(ids, PAR_LOT)) {
      if (annule.current) break
      const { resultats } = await lancerTri(lot)
      resultats.forEach((r: ResultatTri) => { if (r.ok) obtenues++; else nouveaux[r.id] = r.raison ?? 'illisible' })
      fait += lot.length
      setTri({ fait, total: ids.length })
    }
    setTri(null)
    setEchecs(nouveaux)
    setSelection(new Set())
    await onChange()
    const nbEchecs = Object.keys(nouveaux).length
    toast(`${obtenues} proposition${obtenues > 1 ? 's' : ''} à confirmer${nbEchecs ? ` · ${nbEchecs} illisible${nbEchecs > 1 ? 's' : ''}` : ''}`, obtenues > 0 ? 'success' : 'error')
    onTermine(obtenues)
  }

  /** « Dis-moi ce que c'est » : le document passe tout de suite dans À confirmer, avec son nom et son dossier de la convention. */
  const decrire = async (d: DocumentRow, typeImpose?: string) => {
    const texte = decrit.trim()
    if (!texte) return
    const r = analyserDescription(texte, referents, aujourdhuiLocal(), { origine: origineDuDocument(d, annuaire), classes: histo, type: typeImpose })
    if (!r) { setMessageDecrit({ texte: 'Je ne sais pas encore ce que c\'est. Choisis un type :', suggestions: suggererTypes(texte, histo) }); return }
    const proposition = propositionDepuisDescription(r, d, dossiers, nomsPris, histo)
    patch([d.id], { statut_tri: 'propose', proposition })
    setOuvertId(null); setDecrit(''); setMessageDecrit(null)
    const { error } = await ecrirePropositionSaisie(d.id, proposition)
    if (error) { patch([d.id], { statut_tri: 'a_trier', proposition: null }); toast(error.message, 'error'); return }
    toast('Renommé : à confirmer dans l\'onglet À confirmer')
  }

  const supprimer = async (d: DocumentRow) => {
    const { error } = await deleteDocument(d)
    setASupprimer(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Document supprimé')
    await onChange()
  }

  const purger = async () => {
    let n = 0
    for (const d of anciensDrive) { const { error } = await deleteDocument(d); if (!error) n++ }
    setPurgerDrive(false)
    toast(`${n} ancien${n > 1 ? 's' : ''} lien${n > 1 ? 's' : ''} Drive retiré${n > 1 ? 's' : ''}`)
    await onChange()
  }

  const ouvrir = async (d: DocumentRow) => {
    const url = await getDownloadUrl(d)
    if (!url) { toast('Fichier introuvable', 'error'); return }
    ouvrirDocument(url, { titre: d.file_name, type: d.mime_type?.startsWith('image/') ? 'image' : undefined })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Dépôt */}
      {peutEcrire && (
        <div onDragOver={e => { e.preventDefault(); setSurvol(true) }} onDragLeave={() => setSurvol(false)}
          onDrop={e => { e.preventDefault(); setSurvol(false); void deposer(e.dataTransfer.files) }}
          className={`rounded-[var(--r-xl)] border-2 border-dashed px-4 py-5 flex flex-wrap items-center gap-4 transition-colors
            ${survol ? 'border-[var(--brand)] bg-[var(--brand)]/8' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
          <span className="h-11 w-11 rounded-full bg-[var(--brand)]/12 text-[var(--brand)] inline-flex items-center justify-center shrink-0"><UploadCloud size={22} /></span>
          <div className="flex-1 min-w-[12rem]">
            <p className="text-sm font-semibold text-[var(--text)]">Dépose tes fichiers ici</p>
            <p className="text-xs text-[var(--text-muted)]">Photos et PDF, plusieurs à la fois, puis « Trier ».</p>
          </div>
          <input ref={fichierRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => void deposer(e.target.files)} />
          <Button variant="secondary" className="min-h-10" disabled={!!depot} onClick={() => fichierRef.current?.click()}>
            {depot ? `Envoi ${depot.fait}/${depot.total}…` : 'Choisir des fichiers'}
          </Button>
        </div>
      )}

      {docs.length === 0 ? (
        <EmptyState icon={<Sparkles size={40} />} title="Inbox vide" description="Tous les documents sont rangés. Dépose un fichier pour le trier." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <BarreRecherche value={q} onChange={setQ} placeholder="Chercher dans l'Inbox…" ariaLabel="Rechercher dans l'Inbox"
              raccourci className="flex-1 min-w-[14rem] max-w-xl" compteur={`${visibles.length} sur ${docs.length}`} />
            {peutSupprimer && anciensDrive.length > 0 && (
              <button type="button" onClick={() => setPurgerDrive(true)} className="ml-auto text-sm text-[var(--danger)] hover:underline underline-offset-2">
                Retirer {anciensDrive.length === 1 ? 'l\'ancien lien Drive' : `les ${anciensDrive.length} anciens liens Drive`}
              </button>
            )}
          </div>

          <ul className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
            {visibles.map(d => {
              const lisible = lisibleParIA(d)
              const coche = selection.has(d.id)
              return (
                <li key={d.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors ${coche ? 'bg-[var(--brand)]/6' : 'hover:bg-[var(--bg-card-hover)]'}`}>
                  <button type="button" disabled={!lisible || !!tri} onClick={() => basculer(d.id)} aria-label={coche ? 'Désélectionner' : 'Sélectionner'} aria-pressed={coche}
                    className="shrink-0 text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--brand)]">
                    {coche ? <CheckSquare size={20} className="text-[var(--brand)]" /> : <Square size={20} />}
                  </button>
                  <button type="button" onClick={() => void ouvrir(d)} disabled={!d.storage_path && !d.drive_link} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <MiniatureDoc mime={d.mime_type} url={d.storage_path ? miniatures[d.storage_path] : undefined} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-sm text-[var(--text)]">{d.file_name}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {libelleSource(d.entity_type)}{d.category ? ` · ${d.category}` : ''} · {jourCourt(d.created_at)} · {tailleLisible(d.size_bytes)}
                      </span>
                      {echecs[d.id] && <span className="flex items-center gap-1 text-xs text-[var(--danger)]"><AlertTriangle size={12} /> {echecs[d.id]}</span>}
                    </span>
                  </button>
                  {estAncienDrive(d) && <Badge color="muted">Ancien Drive</Badge>}
                  {!lisible && !estAncienDrive(d) && <Badge color="muted">Non lisible par l'IA</Badge>}
                  {peutEcrire && !estAncienDrive(d) && <BoutonIcone icone={Wand2} libelle="Dis-moi ce que c'est" taille="sm" actif={ouvertId === d.id} disabled={!!tri}
                    onClick={() => { setOuvertId(ouvertId === d.id ? null : d.id); setDecrit(''); setMessageDecrit(null) }} />}
                  {peutSupprimer && <BoutonIcone icone={Trash2} libelle="Supprimer" taille="sm" onClick={() => setASupprimer(d)} disabled={!!tri} />}
                  {ouvertId === d.id && (
                    <form onSubmit={ev => { ev.preventDefault(); void decrire(d) }} className="basis-full flex flex-col gap-1.5 pt-1">
                      <div className="flex items-center gap-2">
                        <input autoFocus value={decrit} onChange={ev => { setDecrit(ev.target.value); setMessageDecrit(null) }} aria-label="Dis-moi ce que c'est"
                          placeholder="Dis-moi ce que c'est : « permis de conduire Jean Dupont »" className="field flex-1 min-w-0" />
                        <Button type="submit" variant="primary" className="min-h-10 shrink-0" disabled={!decrit.trim()}>Renommer</Button>
                      </div>
                      {messageDecrit && (
                        <div role="alert" className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--warning)]">
                          <span>{messageDecrit.texte}</span>
                          {messageDecrit.suggestions.map(c => (
                            <button key={c} type="button" onClick={() => void decrire(d, c)}
                              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors">
                              {typeDe(c)?.libelle ?? c}
                            </button>
                          ))}
                        </div>
                      )}
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {/* Barre d'action collée en bas : le tri */}
      {peutEcrire && docs.length > 0 && (
        <div className="sticky bottom-3 z-10 rounded-[var(--r-xl)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl px-4 py-3 flex flex-wrap items-center gap-3">
          {tri ? (
            <>
              <div className="flex-1 min-w-[10rem]">
                <p className="text-sm font-medium text-[var(--text)]">Lecture par l'IA… {tri.fait} / {tri.total}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-[var(--border)] overflow-hidden"><div className="h-full bg-[var(--brand)] transition-all duration-500" style={{ width: `${(tri.fait / tri.total) * 100}%` }} /></div>
              </div>
              <Button variant="secondary" onClick={() => { annule.current = true }}>Arrêter</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--text-muted)] flex-1 min-w-[10rem]">
                {choisis.length > 0 ? <><strong className="text-[var(--text)]">{choisis.length}</strong> sélectionné{choisis.length > 1 ? 's' : ''}.</> : 'Tout ce qui est lisible sera trié.'}
                {choisis.length > 0 && <button type="button" onClick={() => setSelection(new Set())} className="ml-2 underline underline-offset-2 hover:text-[var(--text)]">Tout désélectionner</button>}
              </p>
              <Button variant="primary" className="min-h-11" onClick={() => void lancer()} disabled={aTrier.length === 0}>
                <Sparkles size={15} /> {choisis.length > 0 ? 'Trier la sélection' : 'Trier'} ({aTrier.length})
              </Button>
            </>
          )}
        </div>
      )}

      <ConfirmDialog open={!!aSupprimer} title="Supprimer ce document ?" message={`« ${aSupprimer?.file_name ?? ''} » sera effacé du site, avec son fichier. Action définitive.`}
        confirmLabel="Supprimer" onConfirm={() => { if (aSupprimer) void supprimer(aSupprimer) }} onCancel={() => setASupprimer(null)} />
      <ConfirmDialog open={purgerDrive} title="Retirer les anciens liens Drive ?" message={`${anciensDrive.length} documents n'ont plus de fichier chez nous (le Drive n'est plus branché) : seule leur ligne existe encore. Ils seront retirés de la liste. Les fichiers restent dans ton Drive.`}
        confirmLabel="Retirer" onConfirm={() => void purger()} onCancel={() => setPurgerDrive(false)} />
    </div>
  )
}
