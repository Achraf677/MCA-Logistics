import { useState, useEffect, useCallback } from 'react'
import { Plus, Eye, EyeOff, Pencil, Check, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  listProduitsVehicule, createProduitVehicule, enregistrerProduit,
} from '../../shared/lib/produitsVehicule.queries'
import {
  LIBELLE_FAMILLE, LIBELLE_FAMILLE_PLURIEL, produitsEffectifs,
  type FamilleProduit, type ProduitEffectif, type ProduitVehicule,
} from '../../shared/lib/produitsVehicule'

/**
 * Tous les produits de « Carburant & consommables » en UNE liste : ceux fournis
 * d'office et ceux ajoutés. Chacun se renomme et se masque (un produit masqué
 * disparaît des listes déroulantes mais reste sur les pleins passés).
 */
export function GestionProduits() {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [table, setTable] = useState<ProduitVehicule[]>([])
  const [loading, setLoading] = useState(true)
  const [nouveau, setNouveau] = useState('')
  const [famille, setFamille] = useState<FamilleProduit>('liquide')
  const [edition, setEdition] = useState<{ code: string; libelle: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setTable(await listProduitsVehicule())
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const produits = produitsEffectifs(table)

  const enregistrer = async (p: ProduitEffectif, patch: Partial<Pick<ProduitEffectif, 'libelle' | 'actif'>>) => {
    if (!companyId) return
    setBusy(true)
    const { error } = await enregistrerProduit(companyId, { ...p, ...patch })
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    setEdition(null)
    void load()
  }

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

  const iconBtn = `inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)]
    text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-30`

  const groupe = (f: FamilleProduit) => (
    <div key={f} className="flex flex-col">
      <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">
        {LIBELLE_FAMILLE_PLURIEL[f]}
      </span>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {produits.filter(p => p.famille === f).map(p => (
          <li key={p.code} className={`flex items-center gap-2 py-2 ${p.actif ? '' : 'opacity-50'}`}>
            {edition?.code === p.code ? (
              <form
                className="flex items-center gap-1 flex-1"
                onSubmit={e => { e.preventDefault(); if (edition.libelle.trim()) void enregistrer(p, { libelle: edition.libelle }) }}
              >
                <input
                  autoFocus value={edition.libelle} maxLength={60}
                  onChange={e => setEdition({ code: p.code, libelle: e.target.value })}
                  className="field flex-1 w-auto text-[var(--fs-sm)] !py-1"
                />
                <button type="submit" className={iconBtn} disabled={busy} title="Enregistrer"><Check size={13} /></button>
                <button type="button" className={iconBtn} onClick={() => setEdition(null)} title="Annuler"><X size={13} /></button>
              </form>
            ) : (
              <>
                <span className="text-[var(--fs-sm)] text-[var(--text)] flex-1">
                  {p.libelle}
                  {!p.actif && <span className="ml-2 text-[var(--fs-xs)] text-[var(--text-disabled)]">masqué</span>}
                </span>
                <button className={iconBtn} disabled={busy} title="Renommer"
                  onClick={() => setEdition({ code: p.code, libelle: p.libelle })}>
                  <Pencil size={13} />
                </button>
                <button className={iconBtn} disabled={busy}
                  title={p.actif ? 'Masquer des listes (reste sur les pleins passés)' : 'Afficher à nouveau'}
                  onClick={() => void enregistrer(p, { actif: !p.actif })}>
                  {p.actif ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </>
            )}
          </li>
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
