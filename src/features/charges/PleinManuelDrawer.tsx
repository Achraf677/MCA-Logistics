import { useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { CARTES_CARBURANT, montantSaisiEnCts } from '../../shared/lib/depenses'
import { toLocalISO } from '../../shared/lib/dates'
import {
  creerPleinManuel, modifierPleinManuel, supprimerPleinManuel, type PleinManuel,
} from './pleinsManuels.queries'

/** Saisie d'un plein sans justificatif (suivi perso du bureau). `plein` = modification d'un plein déjà saisi. */
export function PleinManuelDrawer({ plein, companyId, vehicules, peutSupprimer, onClose, onEnregistre }: {
  plein: PleinManuel | null
  companyId: string
  vehicules: Array<{ id: string; label: string; plate: string | null }>
  peutSupprimer: boolean
  onClose: () => void
  onEnregistre: () => Promise<void>
}) {
  const { toast } = useToast()
  const auj = toLocalISO(new Date())
  const [date, setDate] = useState(plein?.date_plein ?? auj)
  const [vehicule, setVehicule] = useState(plein?.vehicle_id ?? '')
  const [montant, setMontant] = useState(plein ? (plein.montant_ttc_cts / 100).toFixed(2).replace('.', ',') : '')
  const [carte, setCarte] = useState(plein?.carte ?? CARTES_CARBURANT[0].valeur)
  const [note, setNote] = useState(plein?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const cts = montantSaisiEnCts(montant)
  const montantValide = cts != null && !Number.isNaN(cts) && cts > 0
  const manques = [
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Date' : null,
    !vehicule ? 'Véhicule' : null,
    !montantValide ? 'Montant' : null,
  ].filter(Boolean) as string[]

  const enregistrer = async () => {
    if (manques.length > 0 || busy || cts == null) return
    setBusy(true)
    const saisie = { vehicle_id: vehicule, date_plein: date, montant_ttc_cts: cts, carte: carte || null, note: note.trim() || null }
    const { error } = plein ? await modifierPleinManuel(plein.id, saisie) : await creerPleinManuel(companyId, saisie)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(plein ? 'Plein corrigé' : 'Plein ajouté')
    await onEnregistre()
  }

  const supprimer = async () => {
    if (!plein) return
    setSuppression(false)
    setBusy(true)
    const { error } = await supprimerPleinManuel(plein.id)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Plein supprimé')
    await onEnregistre()
  }

  return (
    <Drawer open onClose={onClose} title={plein ? 'Modifier le plein' : 'Ajouter un plein'} width="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--text-muted)]">Plein saisi à la main, sans justificatif. Il compte dans le suivi du mois, pas ailleurs (rien n’est envoyé à Pennylane).</p>
        <Champ label="Date" requis>
          <input className="field" type="date" max={auj} value={date} onChange={e => setDate(e.target.value)} />
        </Champ>
        <Champ label="Véhicule" requis>
          <ListeDeroulante valeur={vehicule} onChange={setVehicule} placeholder="Choisir le véhicule" ariaLabel="Véhicule" invalide={!vehicule}
            options={vehicules.map(v => ({ valeur: v.id, libelle: v.label, detail: v.plate ?? undefined }))} />
        </Champ>
        <Champ label="Montant TTC (€)" requis error={montant && !montantValide ? 'Montant invalide (ex. 62,40)' : undefined}>
          <input className="field font-mono" inputMode="decimal" placeholder="62,40" value={montant} onChange={e => setMontant(e.target.value)} />
        </Champ>
        <Champ label="Carte">
          <ListeDeroulante valeur={carte} onChange={setCarte} placeholder="Choisir la carte" ariaLabel="Carte" options={CARTES_CARBURANT} />
        </Champ>
        <Champ label="Note">
          <input className="field" value={note} placeholder="Ex. : plein du lundi" onChange={e => setNote(e.target.value)} />
        </Champ>
        {manques.length > 0 && <p className="text-xs text-[var(--text-muted)]">Il manque : {manques.join(' · ').toLowerCase()}.</p>}
        <div className="flex items-center gap-2">
          <Button variant="primary" className="min-h-10" disabled={manques.length > 0 || busy} onClick={() => void enregistrer()}>
            {busy ? 'Enregistrement…' : plein ? 'Enregistrer' : 'Ajouter le plein'}
          </Button>
          {plein && peutSupprimer && (
            <Button variant="secondary" className="min-h-10 ml-auto" disabled={busy} onClick={() => setSuppression(true)}>Supprimer</Button>
          )}
        </div>
      </div>
      <ConfirmDialog open={suppression} title="Supprimer ce plein ?" message="Ce plein disparaît du suivi. Cette action est définitive."
        confirmLabel="Supprimer" onConfirm={() => void supprimer()} onCancel={() => setSuppression(false)} />
    </Drawer>
  )
}
