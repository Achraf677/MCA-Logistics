import { useState, useRef, useEffect, useCallback } from 'react'
import { ScanText, Sparkles, Upload, FileText, Lock, X, Plus } from 'lucide-react'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import {
  extractDeliveries, listClients, listDrivers, listVehicles,
  createClientRow, createDeliveryRow,
} from './copilote.queries'
import type { ClientOption, DriverOption, VehicleOption } from './copilote.queries'
import {
  normalizeName, isEmptyRow, computeStatut, statutLabel, eurosToCts,
  matchDriver, matchVehicle,
} from './copilote.logic'
import type { ExtractedDelivery, ExtractInput, DeliveryType } from './copilote.types'

const MAX_FILE_BYTES = 8 * 1024 * 1024 // ~8 Mo
const NEW_CLIENT = '__new__'
const NONE = '' // option "— Non assigné" pour chauffeur/véhicule (= null)
const TYPES: DeliveryType[] = ['medical', 'ecommerce', 'retail', 'particulier']

// Ligne validable : copie éditable d'une proposition + état d'UI (création / matching).
interface RowState {
  create: boolean
  clientId: string | null      // client existant sélectionné (null si "créer")
  createNewClient: boolean      // true → on créera un nouveau client
  newClientName: string
  driverId: string | null       // chauffeur assigné (matching, jamais de création)
  vehicleId: string | null      // véhicule assigné (matching, jamais de création)
  type: DeliveryType | null
  date: string | null
  pickup_address: string | null
  delivery_address: string | null
  km: number | null
  weight_kg: number | null
  montant_ht_eur: number | null
  heure: string | null
  notes: string
  missing: string[]
}

function buildRow(
  d: ExtractedDelivery,
  clients: ClientOption[],
  drivers: DriverOption[],
  vehicles: VehicleOption[],
): RowState {
  const match = d.client_name
    ? clients.find(c => normalizeName(c.name) === normalizeName(d.client_name!))
    : undefined
  return {
    create: !isEmptyRow(d),
    clientId: match ? match.id : null,
    createNewClient: !match,
    newClientName: d.client_name ?? '',
    driverId: matchDriver(d.driver_name, drivers),
    vehicleId: matchVehicle(d.vehicle, vehicles),
    type: d.type,
    date: d.date,
    pickup_address: d.pickup_address,
    delivery_address: d.delivery_address,
    km: d.km,
    weight_kg: d.weight_kg,
    montant_ht_eur: d.montant_ht_eur,
    heure: d.heure,
    notes: d.notes ?? '',
    missing: d.missing ?? [],
  }
}

// Une valeur "à compléter" si vide/null, ou listée par l'IA dans missing.
function missingField(row: RowState, field: keyof RowState): boolean {
  const v = row[field]
  return v == null || v === '' || row.missing.includes(field)
}

const inputBase =
  'w-full rounded-[var(--r-sm)] border bg-[var(--bg-card)] px-2 py-1 text-[var(--fs-sm)] text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]'
function inputCls(missing: boolean): string {
  return `${inputBase} ${missing ? 'border-[var(--warning)]/60 bg-[var(--warning)]/5' : 'border-[var(--border-soft)]'}`
}

export function CopiloteIA() {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Ingestion (B1)
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [mimeType, setMimeType]     = useState<string | null>(null)
  const [fileName, setFileName]     = useState<string | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [instructions, setInstructions] = useState('')
  const [pending, setPending] = useState(false)

  // Validation (B2)
  const [clients, setClients]   = useState<ClientOption[]>([])
  const [drivers, setDrivers]   = useState<DriverOption[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [rows, setRows] = useState<RowState[] | null>(null)
  const [creating, setCreating] = useState(false)

  const loadClients = useCallback(async () => {
    const { data } = await listClients()
    setClients(data ?? [])
  }, [])
  const loadRefs = useCallback(async () => {
    const [c, d, v] = await Promise.all([listClients(), listDrivers(), listVehicles()])
    setClients(c.data ?? [])
    setDrivers(d.data ?? [])
    setVehicles(v.data ?? [])
  }, [])
  useEffect(() => { loadRefs() }, [loadRefs])

  const hasSource = !!fileBase64 || pastedText.trim().length > 0

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast('Fichier trop volumineux (max ~8 Mo)', 'error')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      setFileBase64(comma >= 0 ? result.slice(comma + 1) : result)
      setMimeType(file.type)
      setFileName(file.name)
    }
    reader.onerror = () => toast('Lecture du fichier impossible', 'error')
    reader.readAsDataURL(file)
  }

  const clearFile = () => {
    setFileBase64(null); setMimeType(null); setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAnalyze = async () => {
    if (!hasSource || pending) return
    setPending(true)
    setRows(null)

    const input: ExtractInput = { instructions: instructions.trim() || undefined }
    if (fileBase64 && mimeType) { input.fileBase64 = fileBase64; input.mimeType = mimeType }
    else { input.text = pastedText.trim() }

    const { data, error } = await extractDeliveries(input)
    setPending(false)
    if (error || data?.ok === false) {
      toast(error?.message ?? data?.error ?? "Échec de l'analyse", 'error')
      return
    }
    const proposals: ExtractedDelivery[] = data?.data?.deliveries ?? []
    setRows(proposals.map(d => buildRow(d, clients, drivers, vehicles)))
  }

  const update = (i: number, patch: Partial<RowState>) =>
    setRows(prev => prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev)

  const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v))

  const checkedCount = rows?.filter(r => r.create).length ?? 0

  const handleCreate = async () => {
    if (!rows || creating) return
    if (!companyId) { toast('Profil sans société (company_id manquant)', 'error'); return }
    setCreating(true)

    let created = 0
    for (const row of rows) {
      if (!row.create) continue
      try {
        // a. Client : existant, ou création si "➕ Créer".
        let clientId = row.clientId
        if (row.createNewClient || !clientId) {
          const name = row.newClientName.trim()
          if (!name) throw new Error('Nom de client manquant pour une ligne cochée')
          const { data: cdata, error: cErr } = await createClientRow({
            company_id: companyId, name, type: row.type,
          })
          if (cErr) throw new Error(cErr.message)
          clientId = (cdata as { id: string }).id
        }

        // b. Livraison. Chauffeur/véhicule par matching (null si non assignés, jamais bloquant).
        //    L'heure est persistée en préfixe des notes pour ne pas se perdre.
        const statut = computeStatut(row.date)
        const baseNotes = row.notes.trim()
        const notes = row.heure
          ? `Heure: ${row.heure}${baseNotes ? ` — ${baseNotes}` : ''}`
          : (baseNotes || null)
        const { error: dErr } = await createDeliveryRow({
          company_id: companyId,
          client_id: clientId,
          driver_id: row.driverId,
          vehicle_id: row.vehicleId,
          date: row.date ?? new Date().toISOString().slice(0, 10),
          type: row.type,
          pickup_address: row.pickup_address,
          delivery_address: row.delivery_address,
          km: row.km,
          weight_kg: row.weight_kg,
          montant_ht_cts: eurosToCts(row.montant_ht_eur),
          tva_rate: 20,
          statut,
          notes,
        })
        if (dErr) throw new Error(dErr.message)
        created++
      } catch (e) {
        // Arrêt propre : on ne poursuit pas pour éviter tout doublon.
        setCreating(false)
        await loadClients()
        toast(`Arrêt après ${created} création(s) : ${(e as Error).message}`, 'error')
        return
      }
    }

    setCreating(false)
    await loadClients()
    setRows(null)
    toast(`${created} livraison(s) créée(s)`)
  }

  return (
    <Shell pageTitle="Copilote IA">
      <div className="max-w-6xl flex flex-col gap-5">
        {/* Note RGPD */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-[var(--r-lg)] border border-[var(--warning)]/30 bg-[var(--warning)]/5 text-[var(--fs-sm)] text-[var(--text-muted)]">
          <Lock size={16} className="text-[var(--warning)] shrink-0 mt-0.5" />
          <span>Le document est envoyé à Mistral (UE) pour lecture. L'IA propose : rien n'est créé tant que tu ne cliques pas « Créer ».</span>
        </div>

        {/* Zone 1 : feuille de route */}
        <div className="flex flex-col gap-2">
          <label className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Feuille de route</label>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" id="copilote-file" />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              Importer un fichier (image / PDF)
            </Button>
            {fileName && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-md)] bg-[var(--bg-card)] border border-[var(--border)] text-[var(--fs-sm)] text-[var(--text)]">
                <FileText size={13} className="text-[var(--text-muted)]" />
                {fileName}
                <button onClick={clearFile} aria-label="Retirer le fichier" className="text-[var(--text-disabled)] hover:text-[var(--text)]"><X size={12} /></button>
              </span>
            )}
          </div>
          <span className="text-[var(--fs-xs)] text-[var(--text-disabled)]">— ou colle le texte de la feuille ci-dessous —</span>
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            rows={4}
            placeholder="Colle ici le texte de la feuille de route…"
            disabled={!!fileBase64}
            className="w-full rounded-[var(--r-md)] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)] resize-y disabled:opacity-40"
          />
        </div>

        {/* Zone 2 : précisions */}
        <div className="flex flex-col gap-2">
          <label htmlFor="copilote-instructions" className="text-[var(--fs-sm)] font-medium text-[var(--text)]">Précisions pour l'IA</label>
          <textarea
            id="copilote-instructions"
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={2}
            placeholder="Ex. : tout à 25€ sauf Muller à 40, départ entrepôt Strasbourg…"
            className="w-full rounded-[var(--r-md)] border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2.5 text-[var(--fs-sm)] text-[var(--text)] placeholder:text-[var(--text-disabled)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)] resize-y"
          />
        </div>

        <div>
          <Button variant="primary" onClick={handleAnalyze} disabled={!hasSource || pending}>
            <Sparkles size={14} className={pending ? 'animate-spin' : ''} />
            {pending ? 'Analyse…' : 'Analyser'}
          </Button>
        </div>

        {/* Résultat validable (B2) */}
        {rows !== null && (
          rows.length === 0 ? (
            <EmptyState
              icon={<ScanText size={48} />}
              title="Aucune livraison détectée"
              description="L'IA n'a rien trouvé d'exploitable — vérifie le document ou ajoute des précisions."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
                Vérifie et complète les lignes (les champs en orange sont à compléter), puis crée celles qui sont cochées.
              </p>
              <div className="overflow-x-auto rounded-[var(--r-lg)] border border-[var(--border)]">
                <table className="w-full text-[var(--fs-sm)]">
                  <thead>
                    <tr className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-left">
                      {['Créer', 'Client', 'Chauffeur', 'Véhicule', 'Date', 'Type', 'Enlèvement', 'Livraison', 'Km', 'Poids', 'Montant HT €', 'Heure', 'Statut'].map(h => (
                        <th key={h} className="px-2.5 py-2.5 font-medium text-[var(--fs-xs)] uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const statut = computeStatut(row.date)
                      return (
                        <tr key={i} className="border-t border-[var(--border)] align-top">
                          {/* Créer */}
                          <td className="px-2.5 py-2 text-center">
                            <input type="checkbox" checked={row.create} onChange={e => update(i, { create: e.target.checked })} className="accent-[var(--brand)] w-4 h-4 cursor-pointer" />
                          </td>
                          {/* Client */}
                          <td className="px-2.5 py-2 min-w-[180px]">
                            <select
                              value={row.createNewClient ? NEW_CLIENT : (row.clientId ?? NEW_CLIENT)}
                              onChange={e => {
                                const v = e.target.value
                                if (v === NEW_CLIENT) update(i, { createNewClient: true, clientId: null })
                                else update(i, { createNewClient: false, clientId: v })
                              }}
                              className={inputCls(row.createNewClient && !row.newClientName.trim())}
                            >
                              <option value={NEW_CLIENT}>➕ Créer : {row.newClientName || '(nom ?)'}</option>
                              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {row.createNewClient && (
                              <input
                                type="text"
                                value={row.newClientName}
                                onChange={e => update(i, { newClientName: e.target.value })}
                                placeholder="Nom du nouveau client"
                                className={`${inputCls(!row.newClientName.trim())} mt-1`}
                              />
                            )}
                          </td>
                          {/* Chauffeur (matching, non bloquant) */}
                          <td className="px-2.5 py-2 min-w-[150px]">
                            <select
                              value={row.driverId ?? NONE}
                              onChange={e => update(i, { driverId: e.target.value || null })}
                              className={inputCls(false)}
                            >
                              <option value={NONE}>— Non assigné</option>
                              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                            </select>
                          </td>
                          {/* Véhicule (matching, non bloquant) */}
                          <td className="px-2.5 py-2 min-w-[150px]">
                            <select
                              value={row.vehicleId ?? NONE}
                              onChange={e => update(i, { vehicleId: e.target.value || null })}
                              className={inputCls(false)}
                            >
                              <option value={NONE}>— Non assigné</option>
                              {vehicles.map(v => (
                                <option key={v.id} value={v.id}>
                                  {v.label}{v.plate ? ` (${v.plate})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          {/* Date */}
                          <td className="px-2.5 py-2 min-w-[140px]">
                            <input type="date" value={row.date ?? ''} onChange={e => update(i, { date: e.target.value || null })} className={inputCls(missingField(row, 'date'))} />
                          </td>
                          {/* Type */}
                          <td className="px-2.5 py-2 min-w-[120px]">
                            <select value={row.type ?? ''} onChange={e => update(i, { type: (e.target.value || null) as DeliveryType | null })} className={inputCls(missingField(row, 'type'))}>
                              <option value="">—</option>
                              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          {/* Enlèvement */}
                          <td className="px-2.5 py-2 min-w-[160px]">
                            <input type="text" value={row.pickup_address ?? ''} onChange={e => update(i, { pickup_address: e.target.value || null })} className={inputCls(missingField(row, 'pickup_address'))} />
                          </td>
                          {/* Livraison */}
                          <td className="px-2.5 py-2 min-w-[160px]">
                            <input type="text" value={row.delivery_address ?? ''} onChange={e => update(i, { delivery_address: e.target.value || null })} className={inputCls(missingField(row, 'delivery_address'))} />
                          </td>
                          {/* Km */}
                          <td className="px-2.5 py-2 w-[80px]">
                            <input type="number" value={row.km ?? ''} onChange={e => update(i, { km: numOrNull(e.target.value) })} className={inputCls(missingField(row, 'km'))} />
                          </td>
                          {/* Poids */}
                          <td className="px-2.5 py-2 w-[80px]">
                            <input type="number" value={row.weight_kg ?? ''} onChange={e => update(i, { weight_kg: numOrNull(e.target.value) })} className={inputCls(missingField(row, 'weight_kg'))} />
                          </td>
                          {/* Montant HT € */}
                          <td className="px-2.5 py-2 w-[100px]">
                            <input type="number" step="0.01" value={row.montant_ht_eur ?? ''} onChange={e => update(i, { montant_ht_eur: numOrNull(e.target.value) })} className={inputCls(missingField(row, 'montant_ht_eur'))} />
                          </td>
                          {/* Heure */}
                          <td className="px-2.5 py-2 w-[90px]">
                            <input type="text" value={row.heure ?? ''} onChange={e => update(i, { heure: e.target.value || null })} placeholder="—" className={inputCls(missingField(row, 'heure'))} />
                          </td>
                          {/* Statut (lecture seule) */}
                          <td className="px-2.5 py-2 whitespace-nowrap text-[var(--text-muted)]">{statutLabel(statut)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={handleCreate} disabled={checkedCount === 0 || creating}>
                  <Plus size={14} className={creating ? 'animate-spin' : ''} />
                  {creating ? 'Création…' : `Créer les ${checkedCount} livraison(s) cochée(s)`}
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    </Shell>
  )
}
