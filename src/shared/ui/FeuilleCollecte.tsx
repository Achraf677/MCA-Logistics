import { useState } from 'react'
import { Check, PackageCheck, PackagePlus, X } from 'lucide-react'
import { useToast } from './useToast'
import { colisCollecteDefaut, resultatCollecte, type ArretColis } from '../lib/tourneesColis'
import { changerTypeArret, eclaterArret } from '../lib/tourneesColis.queries'
import { PastilleColis } from './PastilleColis'
import { SelecteurColis } from './SelecteurColis'

const libelleAdresse = (a: Pick<ArretColis, 'numero' | 'rue'>) => (a.numero ? `${a.numero} ${a.rue}` : a.rue)

const GROS = 'min-h-16 px-4 inline-flex items-center justify-center gap-2 rounded-[var(--r-lg)] text-lg font-bold disabled:opacity-40 active:scale-[0.98]'

/**
 * Collecte sur une adresse : un arrêt devient collecte, une collecte redevient colis normal, ou un arrêt de
 * plusieurs colis s'éclate en 1 collecte + le reste en colis normal. Une seule validation.
 */
export function FeuilleCollecte({ arret, onFait, onFermer }: {
  arret: ArretColis
  onFait: (maj: ArretColis[]) => void
  onFermer: () => void
}) {
  const { toast } = useToast()
  const [k, setK] = useState(colisCollecteDefaut(arret.quantite))
  const [occupe, setOccupe] = useState(false)
  const estCollecte = arret.type === 'col'
  const r = resultatCollecte(arret.quantite, k)

  const valider = async () => {
    setOccupe(true)
    if (estCollecte || r.mode === 'tout') {
      const { data, error } = await changerTypeArret(arret.id, estCollecte ? 'c' : 'col')
      setOccupe(false)
      if (error || !data) { toast(error?.message ?? 'Enregistrement impossible', 'error'); return }
      onFait([data])
      toast(estCollecte ? 'Remis en colis normal' : 'Arrêt passé en collecte', 'success')
    } else {
      const { data, error } = await eclaterArret(arret.id, r.collecte)
      setOccupe(false)
      if (error || data.length === 0) { toast(error?.message ?? 'Enregistrement impossible', 'error'); return }
      onFait(data)
      toast('Arrêt éclaté : 1 collecte + colis normal', 'success')
    }
    onFermer()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Collecte">
      <button type="button" aria-label="Fermer" onClick={onFermer} className="absolute inset-0 bg-black/60" />
      <div className="relative flex flex-col gap-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]
        rounded-t-[var(--r-xl,1.25rem)] bg-[var(--bg-elevated)] border-t border-[var(--border-strong)]">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-[var(--text)] break-words">{libelleAdresse(arret)}</p>
            <p className="text-base text-[var(--text-muted)]">{arret.commune}</p>
          </div>
          <PastilleColis n={arret.quantite} grand />
          <button type="button" onClick={onFermer} aria-label="Fermer"
            className="size-12 shrink-0 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--text)]">
            <X size={22} />
          </button>
        </div>

        {estCollecte ? (
          <button type="button" disabled={occupe} onClick={valider} className={`${GROS} bg-[var(--success)] text-black`}>
            <PackageCheck size={24} /> Remettre en colis normal
          </button>
        ) : (
          <>
            {arret.quantite > 1 && (
              <>
                <p className="text-base font-semibold text-[var(--text)]">Combien de colis en collecte ?</p>
                <SelecteurColis total={arret.quantite} valeur={k} onChange={n => setK(Math.max(1, n))} />
                <p className="text-sm text-center text-[var(--text-muted)]">
                  {r.mode === 'tout' ? 'Tout l’arrêt passe en collecte.' : `1 collecte (${r.collecte}) + 1 arrêt de ${r.normal} colis à livrer.`}
                </p>
              </>
            )}
            <button type="button" disabled={occupe} onClick={valider} className={`${GROS} bg-[var(--brand)] text-white`}>
              {r.mode === 'tout' ? <PackagePlus size={24} /> : <Check size={24} />}
              {r.mode === 'tout' ? 'Transformer en collecte' : 'Éclater'}
            </button>
          </>
        )}
        <button type="button" onClick={onFermer} className="min-h-12 inline-flex items-center justify-center text-base text-[var(--text-muted)] underline">
          Annuler
        </button>
      </div>
    </div>
  )
}
