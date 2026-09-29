import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Field } from '../../shared/ui/Field'
import { useToast } from '../../shared/ui/useToast'
import { supabase, useProfile } from '../../app/providers'
import { trouverVehicule } from '../../shared/lib/lectureFacture'
import { fromTtcAndRate } from '../../shared/lib/montants'
import { createFuelLogs, lireReleve } from './carburant.queries'
import { CARBURANTS, FUEL_TYPE_LABELS, LIQUIDES, estLiquide, formatCents } from './carburant.logic'
import {
  controleReleve, erreurLigne, euroVersCts, normaliserLignes,
  type LigneReleve, type LigneReleveBrute,
} from './releve.logic'
import type { ChargePick, FuelLogInsert, FuelType } from './carburant.types'

type Lookup = { id: string; label: string; plate?: string | null }

interface Props {
  open: boolean
  onClose: () => void
  charge: ChargePick | null
  onSaved: () => void
}

/**
 * Import d'un RELEVÉ de carte carburant : une facture → plusieurs pleins.
 *
 * Aucun modèle de fournisseur : `lire-releve` ramène n'importe quel relevé
 * (Fleet Pro, Carte Total, AS24…) au même tableau. L'utilisateur complète ce
 * que le relevé ne dit pas (véhicule, chauffeur), décoche les frais, et la
 * somme de TOUTES les lignes lues doit égaler le total de la facture — preuve
 * que la lecture n'a rien oublié avant de créer quoi que ce soit.
 */
export function DrawerReleve({ open, onClose, charge, onSaved }: Props) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers, setDrivers] = useState<Lookup[]>([])
  const [lignes, setLignes] = useState<LigneReleve[]>([])
  const [chauffeurDefaut, setChauffeurDefaut] = useState('')
  const [lecture, setLecture] = useState<'idle' | 'en-cours' | 'ok' | 'erreur'>('idle')
  const [erreur, setErreur] = useState('')
  const [ecartAccepte, setEcartAccepte] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('vehicles').select('id, label, plate').eq('status', 'active').order('label')
      .then(({ data }) => setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label, plate: v.plate }))))
    supabase.from('team_members').select('id, full_name').eq('active', true).order('full_name')
      .then(({ data }) => setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name }))))
  }, [open])

  const lire = async () => {
    if (!charge) return
    setLecture('en-cours'); setErreur(''); setEcartAccepte(false)
    const { data, error } = await lireReleve(charge.id)
    if (error || !data?.ok) {
      setLecture('erreur')
      setErreur(data?.error === 'service surchargé'
        ? 'Service de lecture surchargé — réessaie dans un instant.'
        : data?.error ?? error?.message ?? 'Lecture impossible')
      return
    }
    setLignes(normaliserLignes((data.data?.lignes ?? []) as LigneReleveBrute[], charge.date))
    setLecture('ok')
  }

  // Lecture automatique à l'ouverture : c'est la seule raison d'ouvrir ce tiroir.
  useEffect(() => {
    if (open && charge) { setLignes([]); void lire() }
    if (!open) { setLecture('idle'); setLignes([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, charge?.id])

  // Véhicule deviné par la plaque (ou le nom du modèle) dès que le parc est chargé.
  useEffect(() => {
    if (vehicles.length === 0) return
    setLignes(ls => ls.map(l => l.vehicleId ? l : { ...l, vehicleId: trouverVehicule(l.plaque, vehicles) ?? '' }))
  }, [vehicles, lecture])

  const maj = (cle: string, patch: Partial<LigneReleve>) =>
    setLignes(ls => ls.map(l => l.cle === cle ? { ...l, ...patch } : l))

  const lignesEffectives = useMemo(
    () => lignes.map(l => ({ ...l, driverId: l.driverId || chauffeurDefaut })),
    [lignes, chauffeurDefaut],
  )
  const ctrl = controleReleve(lignesEffectives, charge?.montant_ttc_cts ?? null)
  const aCreer = lignesEffectives.filter(l => l.inclure)
  const erreurs = aCreer.map(l => erreurLigne(l, estLiquide)).filter(Boolean)
  const ecart = ctrl.ecartCts ?? 0
  const peutCreer = aCreer.length > 0 && erreurs.length === 0 && (ecart === 0 || ecartAccepte) && !saving

  const creer = async () => {
    if (!charge || !companyId) return
    setSaving(true)
    try {
      const tvaRate = charge.tva_rate ?? 20
      const payload: FuelLogInsert[] = aCreer.map(l => {
        const ttc = euroVersCts(l.montantTtc)
        const litres = Number(l.litres.replace(',', '.')) || 0
        const prixMilli = Math.round((Number(l.prixLitre.replace(',', '.')) || 0) * 1000)
        const m = fromTtcAndRate(ttc, tvaRate)
        return {
          company_id: companyId,
          date: l.date,
          vehicle_id: l.vehicleId,
          driver_id: l.driverId,
          liters: litres,
          price_per_liter_milli: prixMilli || (litres > 0 ? Math.round(ttc * 10 / litres) : 0),
          total_cts: m.ttc_cts,
          tva_cts: m.tva_cts > 0 ? m.tva_cts : null,
          fuel_type: l.produit,
          mileage_km: l.kilometrage ? parseInt(l.kilometrage) : null,
          station: l.station || charge.suppliers?.name || null,
          tva_rate: tvaRate,
          tva_deductible_pct: 100,
          receipt_url: charge.receipt_url,
          supplier_id: charge.supplier_id,
          charge_id: charge.id,
        }
      })
      const { error } = await createFuelLogs(payload)
      if (error) throw error
      toast(`${payload.length} ligne${payload.length > 1 ? 's' : ''} créée${payload.length > 1 ? 's' : ''} depuis le relevé`)
      onSaved()
      onClose()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const cellCls = 'field !py-1 !px-2 text-[var(--fs-xs)]'

  return (
    <Drawer open={open} onClose={onClose} title="Importer un relevé de carte" width="max-w-6xl">
      {charge && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-3 text-[var(--fs-sm)]">
            <p className="font-medium text-[var(--text)]">{charge.label}</p>
            <p className="text-[var(--text-muted)] text-[var(--fs-xs)] mt-1">
              {new Date(charge.date).toLocaleDateString('fr-FR')} · Total facture{' '}
              <span className="font-mono">{charge.montant_ttc_cts != null ? formatCents(charge.montant_ttc_cts) : '—'}</span>
            </p>
          </div>

          {lecture === 'en-cours' && (
            <p className="flex items-center gap-2 text-[var(--text-muted)] text-[var(--fs-sm)]">
              <Loader2 size={14} className="animate-spin" /> Lecture du relevé…
            </p>
          )}
          {lecture === 'erreur' && (
            <div className="flex items-center gap-3 text-[var(--fs-sm)]">
              <span className="text-[var(--danger)]">{erreur}</span>
              <Button variant="secondary" size="compact" onClick={lire}><RefreshCw size={12} /> Réessayer</Button>
            </div>
          )}

          {lecture === 'ok' && (
            <>
              <Field label="Chauffeur (pour toutes les lignes sans chauffeur)">
                <select value={chauffeurDefaut} onChange={e => setChauffeurDefaut(e.target.value)} className="field">
                  <option value="">— Sélectionner —</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </Field>

              <div className="overflow-x-auto panel rounded-[var(--r-lg)]">
                <table className="w-full text-[var(--fs-xs)]">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                      {['', 'Date', 'Station', 'Produit', 'Véhicule', 'Chauffeur', 'Litres', '€/L', 'TTC €', 'km'].map(h => (
                        <th key={h} className="px-2 py-2 font-medium uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignesEffectives.map(l => {
                      const err = erreurLigne(l, estLiquide)
                      return (
                        <tr key={l.cle} className={`border-t border-[var(--border)] ${l.inclure ? '' : 'opacity-50'}`}>
                          <td className="px-2 py-1">
                            <input type="checkbox" checked={l.inclure} onChange={e => maj(l.cle, { inclure: e.target.checked })}
                              title={l.inclure ? 'Sera créée' : 'Ignorée (frais, service…)'} />
                          </td>
                          <td className="px-2 py-1"><input type="date" value={l.date} onChange={e => maj(l.cle, { date: e.target.value })} className={cellCls} /></td>
                          <td className="px-2 py-1"><input value={l.station} onChange={e => maj(l.cle, { station: e.target.value })} className={cellCls} /></td>
                          <td className="px-2 py-1">
                            <select value={l.produit ?? ''} onChange={e => maj(l.cle, { produit: (e.target.value || null) as FuelType | null })} className={cellCls}>
                              <option value="">Frais / autre</option>
                              <optgroup label="Carburants">{CARBURANTS.map(t => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}</optgroup>
                              <optgroup label="Liquides">{LIQUIDES.map(t => <option key={t} value={t}>{FUEL_TYPE_LABELS[t]}</option>)}</optgroup>
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <select value={l.vehicleId} onChange={e => maj(l.cle, { vehicleId: e.target.value })} className={cellCls}
                              title={l.plaque ? `Plaque lue : ${l.plaque}` : undefined}>
                              <option value="">—</option>
                              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <select value={l.driverId} onChange={e => maj(l.cle, { driverId: e.target.value })} className={cellCls}>
                              <option value="">—</option>
                              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1"><input type="number" value={l.litres} onChange={e => maj(l.cle, { litres: e.target.value })} className={`${cellCls} w-20`} /></td>
                          <td className="px-2 py-1"><input type="number" value={l.prixLitre} onChange={e => maj(l.cle, { prixLitre: e.target.value })} className={`${cellCls} w-20`} /></td>
                          <td className="px-2 py-1"><input type="number" value={l.montantTtc} onChange={e => maj(l.cle, { montantTtc: e.target.value })} className={`${cellCls} w-24`} /></td>
                          <td className="px-2 py-1">
                            <input type="number" value={l.kilometrage} onChange={e => maj(l.cle, { kilometrage: e.target.value })} className={`${cellCls} w-24`} />
                            {err && <p className="text-[var(--danger)] mt-0.5">{err}</p>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-[var(--r-lg)] border border-[var(--border)] p-3 flex flex-col gap-1 text-[var(--fs-sm)]">
                <p>Lu sur le relevé : <span className="font-mono">{formatCents(ctrl.sommeLueCts)}</span>
                  {' '}· dont importé <span className="font-mono">{formatCents(ctrl.importeCts)}</span>
                  {ctrl.horsImportCts > 0 && <> · hors import (frais…) <span className="font-mono">{formatCents(ctrl.horsImportCts)}</span></>}
                </p>
                {ctrl.ecartCts != null && (ecart === 0 ? (
                  <p className="text-[var(--success)]">✓ La somme des lignes égale le total de la facture.</p>
                ) : (
                  <label className="flex items-center gap-2 text-[var(--danger)]">
                    <input type="checkbox" checked={ecartAccepte} onChange={e => setEcartAccepte(e.target.checked)} />
                    Écart de {formatCents(Math.abs(ecart))} avec le total de la facture — une ligne manque ou est mal lue. Créer quand même ?
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
                <Button variant="primary" onClick={creer} disabled={!peutCreer}>
                  {saving ? 'Création…' : `Créer ${aCreer.length} ligne${aCreer.length > 1 ? 's' : ''}`}
                </Button>
                <Button variant="secondary" onClick={onClose}>Annuler</Button>
                <Button variant="ghost" size="compact" onClick={lire} className="ml-auto"><RefreshCw size={12} /> Relire</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  )
}
