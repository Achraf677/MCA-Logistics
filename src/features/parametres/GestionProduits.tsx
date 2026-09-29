import { useState, useEffect, useCallback } from 'react'
import { Plus, RotateCcw, Settings2 } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { LigneParametre } from '../../shared/ui/LigneParametre'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  listProduitsVehicule, createProduitVehicule, enregistrerProduit,
  supprimerProduit, restaurerProduitsBase, compterUsagesProduits,
} from '../../shared/lib/produitsVehicule.queries'
import {
  FAMILLES, ICONE_FAMILLE, LIBELLE_FAMILLE, LIBELLE_FAMILLE_PLURIEL, UNITES,
  familleStockable, produitsEffectifs, produitsBaseSupprimes,
  type FamilleProduit, type ProduitEffectif, type ProduitVehicule, type ReglagesArticle, type Unite,
} from '../../shared/lib/produitsVehicule'

/** Résumé discret des réglages, sous le libellé. */
function resume(p: ProduitEffectif): string {
  const r = p.reglages
  const morceaux: string[] = [r.unite]
  if (r.stockable) morceaux.push(r.seuilStock != null ? `stockable · alerte < ${r.seuilStock}` : 'stockable')
  if (r.periodiciteKm) morceaux.push(`tous les ${r.periodiciteKm.toLocaleString('fr-FR')} km`)
  if (r.periodiciteMois) morceaux.push(`tous les ${r.periodiciteMois} mois`)
  return morceaux.join(' · ')
}

/**
 * Paramètres › Articles & familles (plan « Dépenses véhicule », étape 1).
 * Les 4 familles ⛽ 🧴 🔧 📦, chacune avec ses articles (fournis d'office ou
 * ajoutés) : renommer, masquer, supprimer si inutilisé, et régler l'unité, le
 * stock et la périodicité d'entretien.
 */
export function GestionProduits() {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [table, setTable] = useState<ProduitVehicule[]>([])
  const [usages, setUsages] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [nouveau, setNouveau] = useState('')
  const [famille, setFamille] = useState<FamilleProduit>('liquide')
  const [ouvert, setOuvert] = useState<string | null>(null)
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
    if (error) { toast(error.message, 'error'); return false }
    if (ok) toast(ok)
    void load()
    return true
  }

  const enregistrer = (p: ProduitEffectif, patch: Partial<Pick<ProduitEffectif, 'libelle' | 'actif' | 'reglages'>>) =>
    companyId ? agir(() => enregistrerProduit(companyId, { ...p, ...patch })) : Promise.resolve(false)

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
    toast(`« ${nom} » ajouté à ${LIBELLE_FAMILLE_PLURIEL[famille]}`)
    void load()
  }

  const groupe = (f: FamilleProduit) => (
    <div key={f} className="flex flex-col rounded-[var(--r-lg)] border border-[var(--border)] p-3">
      <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
        {ICONE_FAMILLE[f]} {LIBELLE_FAMILLE_PLURIEL[f]}
      </span>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {produits.filter(p => p.famille === f).map(p => (
          <LigneParametre
            key={p.code}
            libelle={p.libelle}
            sousTitre={resume(p)}
            usages={usages.get(p.code) ?? 0}
            unite={['ligne', 'lignes']}
            actif={p.actif}
            busy={busy}
            actions={(
              <button
                className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                title="Réglages (unité, stock, périodicité)"
                onClick={() => setOuvert(o => (o === p.code ? null : p.code))}
              >
                <Settings2 size={13} />
              </button>
            )}
            enfants={ouvert === p.code && (
              <FormReglages
                produit={p}
                busy={busy}
                onAnnuler={() => setOuvert(null)}
                onEnregistrer={async reglages => { if (await enregistrer(p, { reglages })) setOuvert(null) }}
              />
            )}
            onRenommer={libelle => { void enregistrer(p, { libelle }) }}
            onBasculer={() => { void enregistrer(p, { actif: !p.actif }) }}
            onSupprimer={() => { if (companyId) void agir(() => supprimerProduit(companyId, p), `« ${p.libelle} » supprimé`) }}
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
        <div className="grid gap-3 md:grid-cols-2">{FAMILLES.map(groupe)}</div>
      )}

      {supprimesBase.length > 0 && companyId && (
        <button
          onClick={() => void agir(() => restaurerProduitsBase(companyId), 'Articles restaurés')}
          className="self-start inline-flex items-center gap-1.5 text-[var(--fs-xs)] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <RotateCcw size={12} /> Restaurer {supprimesBase.length} article{supprimesBase.length > 1 ? 's' : ''} supprimé{supprimesBase.length > 1 ? 's' : ''}
        </button>
      )}

      <form
        onSubmit={e => { e.preventDefault(); void ajouter() }}
        className="flex flex-wrap items-center gap-2 pt-3 border-t border-[var(--border)]"
      >
        <input
          value={nouveau}
          onChange={e => setNouveau(e.target.value)}
          placeholder="Ajouter un article (ex. Support téléphone)…"
          maxLength={60}
          className="field flex-1 w-auto text-[var(--fs-sm)]"
        />
        <select value={famille} onChange={e => setFamille(e.target.value as FamilleProduit)} className="field w-auto text-[var(--fs-sm)]">
          {FAMILLES.map(f => <option key={f} value={f}>{ICONE_FAMILLE[f]} {LIBELLE_FAMILLE[f]}</option>)}
        </select>
        <Button type="submit" variant="secondary" size="compact" disabled={!nouveau.trim() || busy}>
          <Plus size={13} /> Ajouter
        </Button>
      </form>
    </div>
  )
}

/** Réglages d'un article : seuls les champs qui ont un sens pour sa famille. */
function FormReglages({ produit, busy, onAnnuler, onEnregistrer }: {
  produit: ProduitEffectif
  busy: boolean
  onAnnuler: () => void
  onEnregistrer: (r: ReglagesArticle) => void
}) {
  const [r, setR] = useState<ReglagesArticle>(produit.reglages)
  const nombre = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)) || null)
  const stockable = familleStockable(produit.famille)
  const entretien = produit.famille === 'entretien'

  return (
    <div className="mt-2 ml-1 flex flex-wrap items-end gap-3 rounded-[var(--r-md)] bg-[var(--bg-elevated)] p-3 text-[var(--fs-xs)]">
      <label className="flex flex-col gap-1">
        Unité
        <select value={r.unite} onChange={e => setR({ ...r, unite: e.target.value as Unite })} className="field w-auto !py-1">
          {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </label>
      {stockable && (
        <>
          <label className="flex items-center gap-1.5 h-8">
            <input type="checkbox" checked={r.stockable} onChange={e => setR({ ...r, stockable: e.target.checked })} />
            Stockable
          </label>
          {r.stockable && (
            <label className="flex flex-col gap-1">
              Alerte stock bas sous
              <input type="number" min={0} value={r.seuilStock ?? ''} onChange={e => setR({ ...r, seuilStock: nombre(e.target.value) })}
                className="field w-24 !py-1" placeholder="—" />
            </label>
          )}
        </>
      )}
      {entretien && (
        <>
          <label className="flex flex-col gap-1">
            Tous les … km
            <input type="number" min={0} step={1000} value={r.periodiciteKm ?? ''} onChange={e => setR({ ...r, periodiciteKm: nombre(e.target.value) })}
              className="field w-28 !py-1" placeholder="—" />
          </label>
          <label className="flex flex-col gap-1">
            Tous les … mois
            <input type="number" min={0} value={r.periodiciteMois ?? ''} onChange={e => setR({ ...r, periodiciteMois: nombre(e.target.value) })}
              className="field w-24 !py-1" placeholder="—" />
          </label>
        </>
      )}
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="primary" size="compact" disabled={busy} onClick={() => onEnregistrer(r)}>Enregistrer</Button>
        <Button variant="ghost" size="compact" onClick={onAnnuler}>Annuler</Button>
      </div>
    </div>
  )
}
