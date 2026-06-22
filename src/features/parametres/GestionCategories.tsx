import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Lock } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { getCategories, createCategory, deleteCategory, categoryColor } from '../../shared/lib/categories.queries'
import type { ChargeCategoryWithCount } from '../../shared/types/categories'

export function GestionCategories() {
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const canWrite = can('finance.charges', 'create')

  const [categories, setCategories] = useState<ChargeCategoryWithCount[]>([])
  const [loading, setLoading]       = useState(true)
  const [newName, setNewName]       = useState('')
  const [adding, setAdding]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const rows = await getCategories(companyId)
    setCategories(rows)
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const { error } = await createCategory(companyId!, name)
    setAdding(false)
    if (error) { toast(error.message, 'error'); return }
    setNewName('')
    toast(`Catégorie « ${name} » créée`)
    load()
  }

  const handleDelete = async (cat: ChargeCategoryWithCount) => {
    const count = parseInt(cat.charges?.[0]?.count ?? '0', 10)
    if (count > 0) {
      toast(`${count} charge(s) utilisent cette catégorie — videz-les d'abord`, 'error')
      return
    }
    setDeletingId(cat.id)
    const { error } = await deleteCategory(cat.id)
    setDeletingId(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Catégorie supprimée')
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Liste */}
      {loading ? (
        <div className="text-[var(--fs-sm)] text-[var(--text-disabled)]">Chargement…</div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {categories.map(cat => {
            const count  = parseInt(cat.charges?.[0]?.count ?? '0', 10)
            const locked = cat.is_system || count > 0
            return (
              <li key={cat.id} className="flex items-center gap-3 py-2.5">
                <Badge color={categoryColor(cat.slug)}>{cat.name}</Badge>
                {cat.is_system && (
                  <span className="inline-flex items-center gap-1 text-[var(--fs-xs)] text-[var(--text-disabled)]">
                    <Lock size={11} /> Système
                  </span>
                )}
                <span className="ml-auto text-[var(--fs-xs)] text-[var(--text-disabled)] tabular-nums">
                  {count > 0 ? `${count} charge${count > 1 ? 's' : ''}` : ''}
                </span>
                {canWrite && (
                  <button
                    disabled={locked || deletingId === cat.id}
                    title={cat.is_system ? 'Catégorie système non supprimable' : count > 0 ? `${count} charge(s) liée(s)` : 'Supprimer'}
                    onClick={() => handleDelete(cat)}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)]
                      text-[var(--danger)] hover:bg-[var(--bg-elevated)] transition-colors
                      disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Formulaire ajout */}
      {canWrite && (
        <form
          onSubmit={e => { e.preventDefault(); handleAdd() }}
          className="flex items-center gap-2 pt-2 border-t border-[var(--border)]"
        >
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nouvelle catégorie…"
            maxLength={60}
            className="flex-1 h-9 px-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]
              text-[var(--text)] text-[var(--fs-sm)] focus:outline-none focus:border-[var(--brand)] transition-colors"
          />
          <Button type="submit" variant="secondary" size="compact" disabled={!newName.trim() || adding}>
            <Plus size={13} />
            Ajouter
          </Button>
        </form>
      )}
    </div>
  )
}
