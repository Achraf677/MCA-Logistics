import { useState } from 'react'
import { Button } from '../../shared/ui/Button'
import { Drawer } from '../../shared/ui/Drawer'
import { Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { cartesPour, optionsCartes } from '../../shared/lib/cartesBancaires'
import { useCartes } from '../../shared/lib/useCartesBancaires'
import { formatMoney } from '../../shared/lib/money'
import { decimalSaisi, montantPleinCts } from './carburantJustifs.logic'
import { toLocalISO } from '../../shared/lib/dates'
import {
  creerPleinManuel, modifierPleinManuel, supprimerPleinManuel, type PleinManuel,
} from './pleinsManuels.queries'

/** Saisie d'un plein sans justificatif (suivi perso du bureau). `plein` = modification d'un plein déjà saisi. */
export function PleinManuelDrawer({ plein, companyId, vehicules, membres, peutSupprimer, onClose, onEnregistre }: {
  plein: PleinManuel | null
  companyId: string
  vehicules: Array<{ id: string; label: string; plate: string | null }>
  membres: Array<{ id: string; full_name: string }>
  peutSupprimer: boolean
  onClose: () => void
  onEnregistre: () => Promise<void>
}) {
  const { toast } = useToast()
  const auj = toLocalISO(new Date())
  const [date, setDate] = useState(plein?.date_plein ?? auj)
  const [vehicule, setVehicule] = useState(plein?.vehicle_id ?? '')
  const [litres, setLitres] = useState(plein?.litres != null ? String(plein.litres).replace('.', ',') : '')
  const [prix, setPrix] = useState(plein?.prix_litre != null ? String(plein.prix_litre).replace('.', ',') : '')
  const cartes = useCartes()
  // Par défaut : la première carte carburant active ce jour-là.
  const [carte, setCarte] = useState(plein?.carte ?? cartesPour(cartes, 'carburant', toLocalISO(new Date()))[0]?.code ?? '')
  const [faitPar, setFaitPar] = useState(plein?.fait_par ?? '')
  const [note, setNote] = useState(plein?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [suppression, setSuppression] = useState(false)

  const l = decimalSaisi(litres, 2)
  const pl = decimalSaisi(prix, 3)
  const litresValides = l != null && !Number.isNaN(l) && l > 0
  const prixValide = pl != null && !Number.isNaN(pl) && pl > 0
  // Le TTC n'est jamais saisi : litres × prix au litre.
  const cts = litresValides && prixValide ? montantPleinCts(l, pl) : null
  const manques = [
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Date' : null,
    !vehicule ? 'Véhicule' : null,
    !litresValides ? 'Litres' : null,
    !prixValide ? 'Prix au litre' : null,
    !faitPar ? 'Qui a fait le plein' : null,
    !carte ? 'Carte' : null,
    !note.trim() ? 'Note' : null,
  ].filter(Boolean) as string[]

  const enregistrer = async () => {
    if (manques.length > 0 || busy || cts == null || l == null || pl == null) return
    setBusy(true)
    const saisie = { vehicle_id: vehicule, date_plein: date, montant_ttc_cts: cts, litres: l, prix_litre: pl, fait_par: faitPar, carte: carte || null, note: note.trim() }
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
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Litres" requis error={litres && !litresValides ? 'Invalide (ex. 45,2)' : undefined}>
            <input className="field font-mono" inputMode="decimal" placeholder="45,2" value={litres} onChange={e => setLitres(e.target.value)} />
          </Champ>
          <Champ label="Prix au litre TTC (€)" requis error={prix && !prixValide ? 'Invalide (ex. 1,789)' : undefined}>
            <input className="field font-mono" inputMode="decimal" placeholder="1,789" value={prix} onChange={e => setPrix(e.target.value)} />
          </Champ>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5 flex items-baseline justify-between">
          <span className="text-sm text-[var(--text-muted)]">Montant TTC (litres × prix)</span>
          <span className="font-mono font-semibold text-xl tabular-nums text-[var(--text)]">{cts != null ? formatMoney(cts) : '—'}</span>
        </div>
        <Champ label="Qui a fait le plein" requis>
          <ListeDeroulante valeur={faitPar} onChange={setFaitPar} recherche placeholder="Chercher un membre de l’équipe" ariaLabel="Qui a fait le plein"
            invalide={!faitPar} options={membres.map(m => ({ valeur: m.id, libelle: m.full_name }))} />
        </Champ>
        <Champ label="Carte bancaire" requis>
          <ListeDeroulante valeur={carte} onChange={setCarte} recherche placeholder="Chercher une carte" ariaLabel="Carte bancaire"
            invalide={!carte} options={optionsCartes(cartes, 'toutes', date, plein?.carte)} />
        </Champ>
        <Champ label="Note" requis>
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
