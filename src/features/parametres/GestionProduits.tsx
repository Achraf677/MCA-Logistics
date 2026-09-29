import { useState, useEffect, useCallback } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { LigneParametre } from '../../shared/ui/LigneParametre'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  listProduitsVehicule, createProduitVehicule, enregistrerProduit,
  supprimerProduit, restaurerProduitsBase, compterUsagesProduits,
} from '../../shared/lib/produitsVehicule.queries'
import {
  LIBELLE_FAMILLE, LIBELLE_FAMILLE_PLURIEL, produitsEffectifs, produitsBaseSupprimes,
  type FamilleProduit, type ProduitEffectif, type ProduitVehicule,
} from '../../shared/lib/produitsVehicule'

/**
 * Tous les produits de « Carburant & consommables » en UNE liste : ceux fournis
 * d'office et ceux ajoutés. Chacun se renomme, se masque, et se supprime s'il
 * n'a jamais servi.
 */
export function GestionProduits() {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [table, setTable] = useState<ProduitVehicule[]>([])
  const [usages, setUsages] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [nouveau, setNouveau] = useState('')
  const [famille, setFamille] = useState<FamilleProduit>('liquide')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, u] = await Promise.all([listProduitsVehicule(), compterUsagesProduits()])
    setTable(t); setUsages(u)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const produits = produitsEffectifs(table)
  const supprimesBase = produitsBaseSupprimes(table)

  const agir = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    if (ok) toast(ok)
    void load()
  }

  const enregistrer = (p: ProduitEffectif, patch: Partial<Pick<ProduitEffectif, 'libelle' | 'actif'>>) =>
    companyId ? agir(() => enregistrerProduit(companyId, { ...p, ...patch })) : undefined

  const ajouter = async () => {
    const nom = nouveau.trim()
    if (!nom || !companyId) return
    setBusy(true)
    const { error } = await createProduitVehicule(companyId, nom, famille)
    setBusy(false)
    if (error) {
      toast(error.code === '23505' ? `« ${nom} » existe déjà` : error.message, 'error')
      return
    }
    setNouveau('')
    toast(`« ${nom} » ajouté aux ${LIBELLE_FAMILLE_PLURIEL[famille].toLowerCase()}`)
    void load()
  }

  const groupe = (f: FamilleProduit) => (
    <div key={f} className="flex flex-col">
      <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
        {LIBELLE_FAMILLE_PLURIEL[f]}
      </span>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {produits.filter(p => p.famille === f).map(p => (
          <LigneParametre
            key={p.code}
            libelle={p.libelle}
            usages={usages.get(p.code) ?? 0}
            unite={['ligne', 'lignes']}
            actif={p.actif}
            busy={busy}
            onRenommer={libelle => enregistrer(p, { libelle })}
            onBasculer={() => enregistrer(p, { actif: !p.actif })}
            onSupprimer={() => companyId
              ? agir(() => supprimerProduit(companyId, p), `« ${p.libelle} » supprimé`)
              : undefined}
          />
        ))}
      </ul>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="text-[var(--fs-sm)] text-[var(--text-disabled)]">Chargement…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{groupe('carburant')}{groupe('liquide')}</div>
      )}

      {supprimesBase.length > 0 && companyId && (
        <button
          onClick={() => void agir(() => restaurerProduitsBase(companyId), 'Produits restaurés')}
          className="self-start inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <RotateCcw size={12} /> Restaurer {supprimesBase.length} produit{supprimesBase.length > 1 ? 's' : ''} supprimé{supprimesBase.length > 1 ? 's' : ''}
        </button>
      )}

      <form
        onSubmit={e => { e.preventDefault(); void ajouter() }}
        className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]"
      >
        <input
          value={nouveau}
          onChange={e => setNouveau(e.target.value)}
          placeholder="Ajouter un produit (ex. Liquide de direction)…"
          maxLength={60}
          className="field flex-1 w-auto text-[var(--fs-sm)]"
        />
        <select value={famille} onChange={e => setFamille(e.target.value as FamilleProduit)} className="field w-auto text-[var(--fs-sm)]">
          <option value="carburant">{LIBELLE_FAMILLE.carburant}</option>
          <option value="liquide">{LIBELLE_FAMILLE.liquide}</option>
        </select>
        <Button type="submit" variant="secondary" size="compact" disabled={!nouveau.trim() || busy}>
          <Plus size={13} /> Ajouter
        </Button>
      </form>
    </div>
  )
}
