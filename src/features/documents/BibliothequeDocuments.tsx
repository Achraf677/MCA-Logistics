import { useMemo, useState } from 'react'
import { BookOpen, Check, Folder, Pencil, Trash2, Undo2, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { deleteDocument, getDownloadUrl } from '../../shared/lib/documents.queries'
import { formatMoney } from '../../shared/lib/money'
import { urlsTickets } from '../../shared/lib/receiptsInbox.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { TYPES_DOCUMENT, libelleType } from '../../shared/lib/documentsTri'
import { DOSSIERS, anneesDe, compteursDossiers, filtrerBibliotheque, tailleLisible, type LigneBibliotheque } from './documents.logic'
import { remettreDansInbox, renommerDocument } from './documents.queries'
import { MiniatureDoc } from './MiniatureDoc'

const jourFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')

/** Bibliothèque : les documents rangés, par dossier, avec recherche. Les justificatifs de Finance y figurent en lecture seule. */
export function BibliothequeDocuments({ lignes, docs, miniatures, peutEcrire, peutSupprimer, onChange, toast }: {
  lignes: LigneBibliotheque[]
  docs: DocumentRow[]
  miniatures: Record<string, string>
  peutEcrire: boolean
  peutSupprimer: boolean
  onChange: () => Promise<void>
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [q, setQ] = useState('')
  const [dossier, setDossier] = useState('')
  const [annee, setAnnee] = useState('')
  const [type, setType] = useState('')
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null)
  const [aSupprimer, setASupprimer] = useState<LigneBibliotheque | null>(null)

  const parId = useMemo(() => new Map(docs.map(d => [d.id, d])), [docs])
  const visibles = useMemo(() => filtrerBibliotheque(lignes, { q, dossier, annee, type }), [lignes, q, dossier, annee, type])
  const compteurs = useMemo(() => compteursDossiers(lignes), [lignes])
  const annees = useMemo(() => anneesDe(lignes), [lignes])
  const dossiers = [...DOSSIERS, ...(compteurs.Justificatifs ? ['Justificatifs'] : [])]

  const ouvrir = async (l: LigneBibliotheque) => {
    let url: string | null = null
    if (l.origine === 'document') { const d = parId.get(l.id); url = d ? await getDownloadUrl(d) : null }
    else if (l.chemin) url = (await urlsTickets([l.chemin]))[l.chemin] ?? null
    if (!url) { toast('Fichier introuvable', 'error'); return }
    ouvrirDocument(url, { titre: l.nom, type: l.mime?.startsWith('image/') ? 'image' : undefined })
  }

  const enregistrerNom = async () => {
    if (!edition) return
    const nom = edition.nom.trim()
    if (!nom) { toast('Le nom ne peut pas être vide', 'error'); return }
    const { error } = await renommerDocument(edition.id, nom)
    setEdition(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Document renommé')
    await onChange()
  }

  const reclasser = async (l: LigneBibliotheque) => {
    const { error } = await remettreDansInbox(l.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Remis dans l\'Inbox pour un nouveau tri')
    await onChange()
  }

  const supprimer = async (l: LigneBibliotheque) => {
    const d = parId.get(l.id)
    setASupprimer(null)
    if (!d) return
    const { error } = await deleteDocument(d)
    if (error) { toast(error.message, 'error'); return }
    toast('Document supprimé')
    await onChange()
  }

  if (lignes.length === 0) {
    return <EmptyState icon={<BookOpen size={40} />} title="Bibliothèque vide" description="Les documents rangés apparaîtront ici, par dossier. Commence par trier l'Inbox." />
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] items-start">
      {/* Dossiers */}
      <nav aria-label="Dossiers" className="flex lg:flex-col gap-1.5 overflow-x-auto lg:sticky lg:top-2 pb-1">
        {[{ cle: '', libelle: 'Tous les documents', n: lignes.length }, ...dossiers.map(d => ({ cle: d, libelle: d, n: compteurs[d] ?? 0 }))].map(d => (
          <button key={d.cle || 'tous'} type="button" aria-pressed={dossier === d.cle} onClick={() => setDossier(d.cle)}
            className={`shrink-0 h-10 px-3 rounded-[var(--r-md)] text-sm inline-flex items-center gap-2 transition-colors text-left
              ${dossier === d.cle ? 'bg-[var(--brand)]/12 text-[var(--brand)] font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text)]'}`}>
            <Folder size={15} className="shrink-0" />
            <span className="flex-1 whitespace-nowrap">{d.libelle}</span>
            <span className="tabular-nums text-xs opacity-70">{d.n}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <BarreRecherche value={q} onChange={setQ} placeholder="Chercher un document : nom, tiers, type…" ariaLabel="Rechercher un document"
            raccourci className="flex-1 min-w-[14rem] max-w-xl" compteur={`${visibles.length} résultat${visibles.length > 1 ? 's' : ''}`} />
          <div className="w-52">
            <ListeDeroulante valeur={type} onChange={setType} ariaLabel="Type" recherche={false}
              options={[{ valeur: '', libelle: 'Tous les types' }, ...TYPES_DOCUMENT.map(t => ({ valeur: t.cle, libelle: t.libelle }))]} />
          </div>
          {annees.length > 1 && (
            <div className="w-36">
              <ListeDeroulante valeur={annee} onChange={setAnnee} ariaLabel="Année" recherche={false}
                options={[{ valeur: '', libelle: 'Toutes années' }, ...annees.map(a => ({ valeur: a, libelle: a }))]} />
            </div>
          )}
        </div>

        {visibles.length === 0 ? (
          <EmptyState icon={<BookOpen size={36} />} title="Aucun document" description="Aucun document ne correspond à ces filtres." />
        ) : (
          <ul className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
            {visibles.map(l => (
              <li key={`${l.origine}-${l.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors">
                <button type="button" onClick={() => void ouvrir(l)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <MiniatureDoc mime={l.mime} url={l.chemin ? miniatures[l.chemin] : undefined} />
                  <span className="min-w-0">
                    {edition?.id === l.id ? null : <span className="block truncate font-medium text-sm text-[var(--text)]">{l.nom}</span>}
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {[l.tiers, l.source, tailleLisible(l.taille)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                {edition?.id === l.id && (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input autoFocus className="field flex-1 min-w-0" value={edition.nom} onChange={e => setEdition({ id: l.id, nom: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') void enregistrerNom(); if (e.key === 'Escape') setEdition(null) }} />
                    <BoutonIcone icone={Check} libelle="Enregistrer le nom" taille="sm" onClick={() => void enregistrerNom()} />
                    <BoutonIcone icone={X} libelle="Annuler" taille="sm" onClick={() => setEdition(null)} />
                  </div>
                )}
                <span className="hidden md:inline-flex"><Badge color={l.origine === 'justificatif' ? 'info' : 'muted'}>{l.origine === 'justificatif' ? 'Justificatif' : libelleType(l.type)}</Badge></span>
                <span className="hidden sm:block w-24 shrink-0 text-xs text-[var(--text-muted)] font-mono">{jourFr(l.date ?? l.creeLe)}</span>
                <span className="hidden sm:block w-24 shrink-0 text-right text-sm font-mono tabular-nums text-[var(--text)]">{l.montantCts != null ? formatMoney(l.montantCts) : ''}</span>
                {l.origine === 'document' && edition?.id !== l.id && (
                  <span className="flex items-center gap-1 shrink-0">
                    {peutEcrire && <BoutonIcone icone={Pencil} libelle="Renommer" taille="sm" onClick={() => setEdition({ id: l.id, nom: l.nom })} />}
                    {peutEcrire && <BoutonIcone icone={Undo2} libelle="Remettre dans l'Inbox (re-trier)" taille="sm" onClick={() => void reclasser(l)} />}
                    {peutSupprimer && <BoutonIcone icone={Trash2} libelle="Supprimer" taille="sm" onClick={() => setASupprimer(l)} />}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog open={!!aSupprimer} title="Supprimer ce document ?" message={`« ${aSupprimer?.nom ?? ''} » sera effacé du site, avec son fichier. Action définitive.`}
        confirmLabel="Supprimer" onConfirm={() => { if (aSupprimer) void supprimer(aSupprimer) }} onCancel={() => setASupprimer(null)} />
    </div>
  )
}
