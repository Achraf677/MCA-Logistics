import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCheck, HardDrive, Inbox, Sparkles } from 'lucide-react'
import { useProfile } from '../../app/providers'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { urlsTickets } from '../../shared/lib/receiptsInbox.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { listerDocuments, statutDrive, type StatutDrive } from './documents.queries'
import { InboxDocuments } from './InboxDocuments'
import { ConfirmationTri } from './ConfirmationTri'
import { BibliothequeDocuments } from './BibliothequeDocuments'

type Vue = 'inbox' | 'confirmer' | 'bibliotheque'

/**
 * Onglet Documents (Système) : TOUS les fichiers du site au même endroit.
 *  - Inbox : ce qui n'est pas encore rangé (dépôts, pièces jointes des livraisons, véhicules, tournées…). On lance le tri.
 *  - À confirmer : l'IA a lu et PROPOSE un nom rangé, un type, une date, un tiers ; rien n'est appliqué sans confirmation.
 *  - Bibliothèque : le Drive de la société (un seul compte Google, branché dans Paramètres) ; les documents confirmés y sont rangés.
 */
export function Documents() {
  const { companyId, profile } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const [vue, setVue] = useState<Vue>('inbox')
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [drive, setDrive] = useState<StatutDrive | null>(null)
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [miniatures, setMiniatures] = useState<Record<string, string>>({})

  const peutEcrire = can('systeme.documents', 'update') && can('systeme.documents', 'create')
  const peutSupprimer = can('systeme.documents', 'delete')

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setLoading(true)
    const [d, st] = await Promise.all([listerDocuments(), statutDrive()])
    if (d.error) { setErreur(d.error.message); setLoading(false); return }
    setErreur(null)
    setDocs(d.data ?? [])
    setDrive(st)
    setLoading(false)
  }, [])

  useEffect(() => { void charger() }, [charger])

  // Mise à jour locale (sans recharger) : une confirmation fait disparaître la carte aussitôt.
  const patch = useCallback((ids: string[], maj: Partial<DocumentRow>) => {
    setDocs(prev => prev.map(d => (ids.includes(d.id) ? { ...d, ...maj } : d)))
  }, [])

  const aTrier = useMemo(() => docs.filter(d => (d.statut_tri ?? 'a_trier') === 'a_trier'), [docs])
  const propositions = useMemo(() => docs.filter(d => d.statut_tri === 'propose'), [docs])
  const classes = useMemo(() => docs.filter(d => d.statut_tri === 'classe'), [docs])
  const driveOk = !!drive?.connecte && !!drive.drive

  // Miniatures des photos affichées (liens signés par lot, une seule fois par chemin).
  useEffect(() => {
    const visibles = vue === 'inbox' ? aTrier : vue === 'confirmer' ? propositions : []
    const manquants = visibles.map(d => ({ c: d.storage_path, m: d.mime_type }))
      .filter(x => x.c && x.m?.startsWith('image/') && !miniatures[x.c]).slice(0, 100).map(x => x.c as string)
    if (manquants.length === 0) return
    let annule = false
    void urlsTickets(manquants).then(m => { if (!annule) setMiniatures(prev => ({ ...prev, ...m })) })
    return () => { annule = true }
  }, [vue, aTrier, propositions, miniatures])

  const onglets: Array<{ cle: Vue; libelle: string; n: number; icone: typeof Inbox }> = [
    { cle: 'inbox', libelle: 'Inbox', n: aTrier.length, icone: Inbox },
    { cle: 'confirmer', libelle: 'À confirmer', n: propositions.length, icone: CheckCheck },
    { cle: 'bibliotheque', libelle: 'Bibliothèque', n: classes.length, icone: BookOpen },
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
        <ChiffreCarte libelle="Rangés" icone={<BookOpen size={13} />} valeur={String(classes.length)} detail="envoyés dans le Drive"
          titre="Bibliothèque" actif={vue === 'bibliotheque'} onClick={() => setVue('bibliotheque')} />
        <ChiffreCarte libelle="Google Drive" icone={<HardDrive size={13} />} valeur={driveOk ? 'Connecté' : drive?.connecte ? 'Drive refusé' : 'Non connecté'}
          ton={driveOk ? undefined : 'warning'} detail={driveOk ? (drive?.email ?? 'compte de la société') : drive?.connecte ? 'reconnecte-toi en cochant Drive' : 'à connecter dans Paramètres'}
          titre="Bibliothèque" actif={false} onClick={() => setVue('bibliotheque')} />
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
        <ConfirmationTri docs={propositions} classes={classes} miniatures={miniatures} peutEcrire={peutEcrire} driveOk={driveOk}
          patch={patch} toast={toast} />
      )}
      {vue === 'bibliotheque' && (
        <BibliothequeDocuments peutEcrire={peutEcrire} estPresident={profile?.role === 'president'} toast={toast} />
      )}
    </div>
  )
}
