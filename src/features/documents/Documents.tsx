import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCheck, HardDrive, Inbox, Sparkles } from 'lucide-react'
import { useProfile } from '../../app/providers'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { urlsTickets } from '../../shared/lib/receiptsInbox.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { enLigne, tailleLisible, type LigneBibliotheque } from './documents.logic'
import { listerDocuments, listerJustificatifsPourBibliotheque } from './documents.queries'
import { InboxDocuments } from './InboxDocuments'
import { ConfirmationTri } from './ConfirmationTri'
import { BibliothequeDocuments } from './BibliothequeDocuments'

type Vue = 'inbox' | 'confirmer' | 'bibliotheque'

/**
 * Onglet Documents (Système) : TOUS les fichiers du site au même endroit.
 *  - Inbox : ce qui n'est pas encore rangé (dépôts, pièces jointes des livraisons, véhicules, tournées…). On lance le tri.
 *  - À confirmer : l'IA a lu et PROPOSE un nom rangé, un type, une date, un tiers ; rien n'est appliqué sans confirmation.
 *  - Bibliothèque : les documents rangés, par dossier, avec recherche ; les justificatifs de Finance y sont aussi (lecture seule).
 */
export function Documents() {
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const [vue, setVue] = useState<Vue>('inbox')
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [justificatifs, setJustificatifs] = useState<LigneBibliotheque[]>([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [miniatures, setMiniatures] = useState<Record<string, string>>({})

  const peutEcrire = can('systeme.documents', 'update') && can('systeme.documents', 'create')
  const peutSupprimer = can('systeme.documents', 'delete')

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true)
    const [d, j] = await Promise.all([listerDocuments(), listerJustificatifsPourBibliotheque()])
    if (d.error) { setErreur(d.error.message); setLoading(false); return }
    setErreur(null)
    setDocs(d.data ?? [])
    setJustificatifs(j)
    setLoading(false)
  }, [])

  useEffect(() => { void charger() }, [charger])

  const aTrier = useMemo(() => docs.filter(d => (d.statut_tri ?? 'a_trier') === 'a_trier'), [docs])
  const propositions = useMemo(() => docs.filter(d => d.statut_tri === 'propose'), [docs])
  const classes = useMemo(() => docs.filter(d => d.statut_tri === 'classe'), [docs])
  const lignes = useMemo(() => [...classes.map(enLigne), ...justificatifs], [classes, justificatifs])
  const octets = useMemo(() => docs.reduce((s, d) => s + (d.size_bytes ?? 0), 0), [docs])

  // Miniatures des photos affichées (liens signés par lot, une seule fois par chemin).
  useEffect(() => {
    const visibles = vue === 'inbox' ? aTrier : vue === 'confirmer' ? propositions : classes
    const manquants = [...visibles.map(d => ({ c: d.storage_path, m: d.mime_type })), ...(vue === 'bibliotheque' ? justificatifs.map(j => ({ c: j.chemin, m: j.mime })) : [])]
      .filter(x => x.c && x.m?.startsWith('image/') && !miniatures[x.c]).slice(0, 100).map(x => x.c as string)
    if (manquants.length === 0) return
    let annule = false
    void urlsTickets(manquants).then(m => { if (!annule) setMiniatures(prev => ({ ...prev, ...m })) })
    return () => { annule = true }
  }, [vue, aTrier, propositions, classes, justificatifs, miniatures])

  const onglets: Array<{ cle: Vue; libelle: string; n: number; icone: typeof Inbox }> = [
    { cle: 'inbox', libelle: 'Inbox', n: aTrier.length, icone: Inbox },
    { cle: 'confirmer', libelle: 'À confirmer', n: propositions.length, icone: CheckCheck },
    { cle: 'bibliotheque', libelle: 'Bibliothèque', n: lignes.length, icone: BookOpen },
  ]

  if (loading) return <div className="flex flex-col gap-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
  if (erreur) return <p className="text-[var(--danger)] text-sm py-10 text-center">{erreur}</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ChiffreCarte libelle="Inbox" icone={<Inbox size={13} />} valeur={String(aTrier.length)} ton={aTrier.length > 0 ? 'warning' : undefined}
          detail={aTrier.length > 0 ? 'à trier avec l\'IA' : 'tout est rangé'} titre="Documents à trier" actif={vue === 'inbox'} onClick={() => setVue('inbox')} />
        <ChiffreCarte libelle="À confirmer" icone={<Sparkles size={13} />} valeur={String(propositions.length)} ton={propositions.length > 0 ? 'warning' : undefined}
          detail="propositions de l'IA" titre="Propositions à confirmer" actif={vue === 'confirmer'} onClick={() => setVue('confirmer')} />
        <ChiffreCarte libelle="Classés" icone={<BookOpen size={13} />} valeur={String(lignes.length)} detail="dont justificatifs Finance"
          titre="Bibliothèque" actif={vue === 'bibliotheque'} onClick={() => setVue('bibliotheque')} />
        <ChiffreCarte libelle="Stockage" icone={<HardDrive size={13} />} valeur={tailleLisible(octets)} detail={`${docs.length} fichiers`}
          titre="Espace utilisé" actif={false} onClick={() => setVue('bibliotheque')} />
      </div>

      <div role="tablist" className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-card)] p-1 self-start max-w-full overflow-x-auto">
        {onglets.map(({ cle, libelle, n, icone: Icone }) => (
          <button key={cle} role="tab" aria-selected={vue === cle} onClick={() => setVue(cle)}
            className={`shrink-0 whitespace-nowrap h-9 px-4 rounded-full text-sm font-medium inline-flex items-center gap-2 transition-colors
              ${vue === cle ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card-hover)]'}`}>
            <Icone size={14} /> {libelle}
            <span className={`tabular-nums text-xs ${vue === cle ? 'text-white/80' : 'text-[var(--text-disabled)]'}`}>{n}</span>
          </button>
        ))}
      </div>

      {vue === 'inbox' && (
        <InboxDocuments docs={aTrier} miniatures={miniatures} companyId={companyId ?? ''} peutEcrire={peutEcrire} peutSupprimer={peutSupprimer}
          onChange={() => charger(true)} onTermine={(n) => { if (n > 0) setVue('confirmer') }} toast={toast} />
      )}
      {vue === 'confirmer' && (
        <ConfirmationTri docs={propositions} classes={classes} miniatures={miniatures} peutEcrire={peutEcrire}
          onChange={() => charger(true)} toast={toast} />
      )}
      {vue === 'bibliotheque' && (
        <BibliothequeDocuments lignes={lignes} docs={classes} miniatures={miniatures} peutEcrire={peutEcrire} peutSupprimer={peutSupprimer}
          onChange={() => charger(true)} toast={toast} />
      )}
    </div>
  )
}
