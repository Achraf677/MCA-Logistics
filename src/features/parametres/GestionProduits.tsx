import { useState, useEffect, useCallback } from 'react'
import { Plus, Archive, ArchiveRestore } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  listProduitsVehicule, createProduitVehicule, setProduitActif,
} from '../../shared/lib/produitsVehicule.queries'
import type { FamilleProduit, ProduitVehicule } from '../../shared/lib/produitsVehicule'

/**
 * Produits PERSONNALISÉS de « Carburant & liquides » (GNV, liquide de
 * direction…). Les produits de base (Diesel, AdBlue, lave-glace…) sont fixes
 * et toujours proposés. Un produit n'est jamais supprimé, seulement archivé :
 * les pleins passés gardent leur libellé.
 */
export function GestionProduits() {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [produits, setProduits] = useState<ProduitVehicule[]>([])
  const [loading, setLoading] = useState(true)
  const [libelle, setLibelle] = useState('')
  const [famille, setFamille] = useState<FamilleProduit>('liquide')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setProduits(await listProduitsVehicule())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const ajouter = async () => {
    const nom = libelle.trim()
    if (!nom || !companyId) return
    setBusy(true)
    const { error } = await createProduitVehicule(companyId, nom, famille)
    setBusy(false)
    if (error) {
      toast(error.code === '23505' ? `« ${nom} » existe déjà` : error.message, 'error')
      return
    }
    setLibelle('')
    toast(`Produit « ${nom} » ajouté`)
    void load()
  }

  const basculer = async (p: ProduitVehicule) => {
    const { error } = await setProduitActif(p.id, !p.actif)
    if (error) { toast(error.message, 'error'); return }
    void load()
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">
        Produits de base toujours disponibles : Diesel, Essence, Électrique, Hybride, GPL, AdBlue,
        Lave-glace, Huile moteur, Liquide de refroidissement, Liquide de frein, Autre liquide.
        Ajoute ici ceux qui te manquent.
      </p>

      {loading ? (
        <div className="text-[var(--fs-sm)] text-[var(--text-disabled)]">Chargement…</div>
      ) : produits.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {produits.map(p => (
            <li key={p.id} className={`flex items-center gap-3 py-2.5 ${p.actif ? '' : 'opacity-50'}`}>
              <span className="text-[var(--fs-sm)] text-[var(--text)]">{p.libelle}</span>
              <Badge color={p.famille === 'liquide' ? 'info' : 'muted'}>
                {p.famille === 'liquide' ? 'Liquide' : 'Carburant'}
              </Badge>
              {!p.actif && <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">Archivé</span>}
              <button
                onClick={() => basculer(p)}
                title={p.actif ? 'Archiver (reste sur les pleins passés)' : 'Réactiver'}
                className="ml-auto inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)]
                  text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                {p.actif ? <Archive size={13} /> : <ArchiveRestore size={13} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={e => { e.preventDefault(); void ajouter() }}
        className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]"
      >
        <input
          value={libelle}
          onChange={e => setLibelle(e.target.value)}
          placeholder="Nouveau produit (ex. Liquide de direction)…"
          maxLength={60}
          className="field flex-1 w-auto text-[var(--fs-sm)]"
        />
        <select value={famille} onChange={e => setFamille(e.target.value as FamilleProduit)} className="field w-auto text-[var(--fs-sm)]">
          <option value="liquide">Liquide</option>
          <option value="carburant">Carburant</option>
        </select>
        <Button type="submit" variant="secondary" size="compact" disabled={!libelle.trim() || busy}>
          <Plus size={13} /> Ajouter
        </Button>
      </form>
    </div>
  )
}
