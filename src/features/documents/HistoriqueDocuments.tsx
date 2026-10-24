import { useMemo, useState } from 'react'
import { ExternalLink, FolderTree, History } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { formatMoney } from '../../shared/lib/money'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { libelleType } from '../../shared/lib/documentsTri'
import { depuisQuand } from './documents.logic'
import { lireDocumentRange } from './documents.queries'
import { MiniatureDoc } from './MiniatureDoc'

const MAX = 60

/** Libellé du jour d'un groupe : « Aujourd'hui », « Hier », sinon la date. */
function jourDe(iso: string): string {
  const d = new Date(iso)
  const auj = new Date()
  const hier = new Date(); hier.setDate(hier.getDate() - 1)
  if (d.toDateString() === auj.toDateString()) return 'Aujourd\'hui'
  if (d.toDateString() === hier.toDateString()) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Historique : les derniers documents rangés (les plus récents d'abord, groupés par jour) avec le dossier du Drive où ils sont partis,
 * pour retrouver ce qu'on vient de traiter. Ouverture dans l'appli, lien vers Google Drive.
 */
export function HistoriqueDocuments({ docs, miniatures, toast }: {
  docs: DocumentRow[]
  miniatures: Record<string, string>
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [ouvrant, setOuvrant] = useState<string | null>(null)

  const groupes = useMemo(() => {
    const tries = [...docs].sort((a, b) => (b.trie_le ?? b.created_at).localeCompare(a.trie_le ?? a.created_at)).slice(0, MAX)
    const parJour = new Map<string, DocumentRow[]>()
    for (const d of tries) {
      const j = jourDe(d.trie_le ?? d.created_at)
      parJour.set(j, [...(parJour.get(j) ?? []), d])
    }
    return [...parJour.entries()]
  }, [docs])

  const ouvrir = async (d: DocumentRow) => {
    setOuvrant(d.id)
    const lu = await lireDocumentRange(d)
    setOuvrant(null)
    if (!lu) { toast('Fichier introuvable', 'error'); return }
    ouvrirDocument(lu.url, { titre: d.file_name, type: lu.type })
  }

  if (docs.length === 0) {
    return <EmptyState icon={<History size={40} />} title="Aucun document rangé pour l'instant" description="Les documents que tu confirmes apparaissent ici, avec le dossier du Drive où ils sont partis." />
  }

  return (
    <div className="flex flex-col gap-4">
      {groupes.map(([jour, liste]) => (
        <section key={jour} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] capitalize px-1">{jour} · {liste.length}</h3>
          <ul className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
            {liste.map(d => (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors">
                <button type="button" onClick={() => void ouvrir(d)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <MiniatureDoc mime={d.mime_type} url={d.storage_path ? miniatures[d.storage_path] : undefined} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm text-[var(--text)]">{d.file_name}</span>
                    <span className="flex items-center gap-1.5 truncate text-xs text-[var(--text-muted)]">
                      <FolderTree size={12} className="shrink-0" />
                      <span className="truncate">{d.drive_chemin ?? (d.drive_file_id ? 'Drive' : 'Hors Drive')}</span>
                      {ouvrant === d.id && <span>· ouverture…</span>}
                    </span>
                  </span>
                </button>
                <span className="hidden md:inline-flex"><Badge color="muted">{libelleType(d.type_document)}</Badge></span>
                <span className="hidden sm:block w-24 shrink-0 text-right text-sm font-mono tabular-nums text-[var(--text)]">{d.montant_ttc_cts != null ? formatMoney(d.montant_ttc_cts) : ''}</span>
                <span className="hidden sm:block w-24 shrink-0 text-right text-xs text-[var(--text-muted)]">{depuisQuand(d.trie_le ?? d.created_at)}</span>
                {d.drive_url && <BoutonIcone icone={ExternalLink} libelle="Ouvrir dans Google Drive" taille="sm" onClick={() => window.open(d.drive_url!, '_blank', 'noopener')} />}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
