import { useState } from 'react'
import { Check, X, Clock, AlertTriangle, MessageSquare } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import type { JourneeColis } from '../../shared/lib/journeesColis'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { PhotosJournee } from './PhotosJournee'
import { dateFr } from './equipe.logic'
import {
  anciennete, envoiAncien, declares, ecarts, nombresSaisis, nombreSaisi, motifValide, LIBELLE_CHAMP,
  type NombresColis,
} from './journees.logic'

export type Saisie = { domicile: string; relais: string; litige: string }

/**
 * Une journée envoyée au bureau : déclaré du salarié, photos, champs « validé »
 * pré-remplis (modifiables), Valider / Refuser.
 */
export function CarteValidation({ j, photos, saisie, onSaisie, selection, onSelection, peutAgir, occupe,
  maintenant, onValider, onRefuser }: {
  j: JourneeColis
  photos: DocumentRow[]
  saisie: Saisie
  onSaisie: (s: Saisie) => void
  selection: boolean
  onSelection: (v: boolean) => void
  peutAgir: boolean
  occupe: boolean
  maintenant: Date
  onValider: (valides: NombresColis) => void
  onRefuser: (motif: string) => void
}) {
  const [refus, setRefus] = useState<string | null>(null)
  const valides = nombresSaisis(saisie)
  const diff = valides ? ecarts(declares(j), valides) : []
  const ancien = envoiAncien(j.envoyee_le, maintenant)

  const champ = (c: keyof Saisie) => {
    const invalide = nombreSaisi(saisie[c]) == null
    const change = valides != null && diff.some(d => d.champ === c)
    return (
      <label key={c} className="flex flex-col gap-1 min-w-0">
        <span className="text-xs text-[var(--text-muted)] truncate">{LIBELLE_CHAMP[c]} validé</span>
        <input inputMode="numeric" disabled={!peutAgir || occupe} value={saisie[c]}
          onChange={e => onSaisie({ ...saisie, [c]: e.target.value })}
          className={`field text-right ${invalide ? '!border-[var(--danger)]' : change ? '!border-[var(--warning)]' : ''}`} />
      </label>
    )
  }

  return (
    <div className={`rounded-[var(--r-lg)] border bg-[var(--bg-card)] p-3 flex flex-col gap-3
      ${selection ? 'border-[var(--brand)]' : 'border-[var(--border)]'}`}>
      <div className="flex items-start gap-2">
        {peutAgir && (
          <input type="checkbox" className="mt-1" checked={selection} disabled={occupe}
            onChange={e => onSelection(e.target.checked)} aria-label="Sélectionner" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)] truncate">
            {j.team_members?.full_name ?? 'Salarié inconnu'} · {dateFr(j.date)}
          </p>
          <p className="text-sm text-[var(--text-muted)] truncate">{j.clients?.name ?? 'Client inconnu'}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs shrink-0 ${ancien ? 'text-[var(--warning)] font-semibold' : 'text-[var(--text-muted)]'}`}
          title={j.envoyee_le ? new Date(j.envoyee_le).toLocaleString('fr-FR') : undefined}>
          <Clock size={12} /> Envoyée {anciennete(j.envoyee_le, maintenant)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([['Domicile', j.colis_domicile], ['Point relais', j.colis_relais], ['Litiges', j.colis_litige]] as const).map(([l, n]) => (
          <div key={l} className="rounded-[var(--r-md)] bg-[var(--bg)] px-2 py-1.5 text-center">
            <p className="text-xs text-[var(--text-muted)]">{l} déclarés</p>
            <p className={`text-lg font-semibold ${l === 'Litiges' && n > 0 ? 'text-[var(--warning)]' : 'text-[var(--text)]'}`}>{n}</p>
          </div>
        ))}
      </div>

      {(j.colis_litige > 0 || j.litige_raison) && (
        <p className="flex items-start gap-1.5 text-sm text-[var(--warning)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>Litige : {j.litige_raison?.trim() || 'raison non indiquée'}</span>
        </p>
      )}
      {j.note?.trim() && (
        <p className="flex items-start gap-1.5 text-sm text-[var(--text-muted)]">
          <MessageSquare size={14} className="mt-0.5 shrink-0" /><span>{j.note}</span>
        </p>
      )}

      <PhotosJournee docs={photos} />

      <div className="grid grid-cols-3 gap-2">
        {(['domicile', 'relais', 'litige'] as const).map(champ)}
      </div>
      {valides == null && <p className="text-xs text-[var(--danger)]">Nombre validé invalide : entier positif attendu.</p>}
      {valides && diff.length > 0 && (
        <p className="text-xs text-[var(--warning)]">
          Écart avec le déclaré : {diff.map(d => `${LIBELLE_CHAMP[d.champ]} ${d.avant} → ${d.apres}`).join(' · ')}
        </p>
      )}

      {peutAgir && (refus != null ? (
        <div className="flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-2">
          <label className="text-xs font-medium text-[var(--text-muted)]">Motif du refus (lu par le salarié) *</label>
          <textarea className="field min-h-[3.5rem]" value={refus} autoFocus
            placeholder="ex. La photo ne montre pas le compteur, renvoie-la"
            onChange={e => setRefus(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="compact" disabled={occupe || !motifValide(refus)}
              className="!bg-[var(--danger)] !from-[var(--danger)] !to-[var(--danger)]"
              onClick={() => onRefuser(refus.trim())}>
              <X size={13} /> Renvoyer à corriger
            </Button>
            <Button variant="secondary" size="compact" disabled={occupe} onClick={() => setRefus(null)}>Annuler</Button>
            {!motifValide(refus) && <span className="text-xs text-[var(--text-muted)] self-center">5 caractères minimum</span>}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[var(--border)]">
          <Button variant="primary" size="compact" disabled={occupe || valides == null}
            onClick={() => valides && onValider(valides)}>
            <Check size={13} /> {diff.length > 0 ? 'Valider avec correction' : 'Valider'}
          </Button>
          <Button variant="secondary" size="compact" disabled={occupe} onClick={() => setRefus('')}>
            <X size={13} /> Refuser
          </Button>
        </div>
      ))}
    </div>
  )
}
