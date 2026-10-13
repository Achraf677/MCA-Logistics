import { useEffect, useState } from 'react'
import { History, AlertTriangle, MessageSquare } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Badge } from '../../shared/ui/Badge'
import {
  COULEUR_STATUT_JOURNEE, LIBELLE_STATUT_JOURNEE, LIBELLE_ACTION_HISTORIQUE, colisRetenus,
  type JourneeColis, type HistoriqueJournee, type StatutJournee,
} from '../../shared/lib/journeesColis'
import { historiqueJournee, photosJournee } from '../../shared/lib/journeesColis.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { PhotosJournee } from './PhotosJournee'
import { ActionsJournee } from './ActionsJournee'
import { nomsComptes } from './equipe.queries'
import { dateFr } from './equipe.logic'
import { changementsHistorique } from './journees.logic'

const libelleStatut = (s: string) => LIBELLE_STATUT_JOURNEE[s as StatutJournee] ?? s

/** Détail d'une journée de colis : nombres, photos, historique, gestes gardés du bureau. */
export function DrawerJournee({ j, onClose, onChanged }: {
  j: JourneeColis | null
  onClose: () => void
  onChanged: () => void
}) {
  const { can } = usePermissions()
  const [photos, setPhotos] = useState<DocumentRow[] | null>(null)
  const [histo, setHisto] = useState<HistoriqueJournee[] | null>(null)
  const [erreurHisto, setErreurHisto] = useState<string | null>(null)
  const [noms, setNoms] = useState<Record<string, string>>({})

  const id = j?.id
  const version = j?.updated_at
  useEffect(() => {
    if (!id) return
    let vivant = true
    setPhotos(null); setHisto(null); setErreurHisto(null)
    photosJournee(id).then(r => { if (vivant) setPhotos(r.data) })
    historiqueJournee(id).then(async r => {
      if (!vivant) return
      setHisto(r.data)
      setErreurHisto(r.error ? r.error.message : null)
      const n = await nomsComptes(r.data.map(h => h.par ?? '').filter(Boolean))
      if (vivant) setNoms(n)
    })
    return () => { vivant = false }
  }, [id, version])

  if (!j) return null
  const retenus = colisRetenus(j)
  const validee = j.statut === 'validee'

  return (
    <Drawer open={!!j} onClose={onClose} width="max-w-2xl"
      title={`${j.team_members?.full_name ?? 'Salarié'} · ${dateFr(j.date)}`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={COULEUR_STATUT_JOURNEE[j.statut]}>{LIBELLE_STATUT_JOURNEE[j.statut]}</Badge>
          <span className="text-sm text-[var(--text-muted)]">{j.clients?.name ?? 'Client inconnu'}</span>
          {j.envoyee_le && (
            <span className="text-xs text-[var(--text-muted)] ml-auto">
              Envoyée le {new Date(j.envoyee_le).toLocaleString('fr-FR')}
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-muted)]">
              <th className="text-left font-medium py-1">Colis</th>
              <th className="text-right font-medium py-1">Déclarés</th>
              <th className="text-right font-medium py-1">Validés</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {([['Domicile', j.colis_domicile, retenus.domicile], ['Point relais', j.colis_relais, retenus.relais],
              ['Litiges', j.colis_litige, retenus.litige]] as const).map(([l, d, v]) => (
              <tr key={l}>
                <td className="py-1.5 text-[var(--text)]">{l}</td>
                <td className="py-1.5 text-right">{d}</td>
                <td className={`py-1.5 text-right font-semibold ${validee && v !== d ? 'text-[var(--warning)]' : ''}`}>
                  {validee ? v : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(j.colis_litige > 0 || j.litige_raison) && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Litige : {j.litige_raison?.trim() || 'raison non indiquée'}
          </p>
        )}
        {j.note?.trim() && (
          <p className="flex items-start gap-1.5 text-sm text-[var(--text-muted)]">
            <MessageSquare size={14} className="mt-0.5 shrink-0" /> {j.note}
          </p>
        )}
        {j.statut === 'refusee' && j.motif_refus && (
          <p className="text-sm text-[var(--danger)]">Renvoyée au salarié : {j.motif_refus}</p>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">Photos du compteur</p>
          {photos == null ? <p className="text-sm text-[var(--text-muted)]">Chargement…</p> : <PhotosJournee docs={photos} />}
        </div>

        <ActionsJournee j={j}
          peutCorriger={can('equipe.journees', 'update')}
          peutSupprimer={can('equipe.journees', 'delete')}
          onFait={onChanged}
          onSupprimee={() => { onChanged(); onClose() }} />

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
            <History size={13} /> Historique
          </p>
          {histo == null ? (
            <p className="text-sm text-[var(--text-muted)]">Chargement…</p>
          ) : erreurHisto ? (
            <p className="text-sm text-[var(--danger)]">Historique non chargé : {erreurHisto}</p>
          ) : histo.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aucun événement enregistré.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {histo.map(h => {
                const ch = changementsHistorique(h, libelleStatut).filter(c => c.libelle !== 'Statut')
                return (
                  <li key={h.id} className="rounded-[var(--r-md)] bg-[var(--bg)] px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-[var(--text)]">{LIBELLE_ACTION_HISTORIQUE[h.action] ?? h.action}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(h.le).toLocaleString('fr-FR')} · {h.par ? (noms[h.par] ?? 'compte inconnu') : 'système'}
                      </span>
                    </div>
                    {ch.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {ch.map(c => (
                          <li key={c.libelle} className="text-xs text-[var(--text-muted)]">
                            {c.libelle} : {c.avant} → <span className="text-[var(--text)]">{c.apres}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {h.motif && <p className="mt-1 text-xs text-[var(--text)]">Motif : {h.motif}</p>}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </div>
    </Drawer>
  )
}
