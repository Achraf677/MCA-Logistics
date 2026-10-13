import { useState } from 'react'
import { Pencil, RotateCcw, Trash2, ArrowRight } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { colisRetenus, type JourneeColis } from '../../shared/lib/journeesColis'
import { corrigerJournee, rouvrirJournee, supprimerJournee } from '../../shared/lib/journeesColis.queries'
import { dateFr } from './equipe.logic'
import {
  ecarts, nombresSaisis, versSaisie, motifValide, confirmationRetapee, LIBELLE_CHAMP, type NombresColis,
} from './journees.logic'

type Mode = null | 'corriger' | 'rouvrir' | 'supprimer'

/**
 * Gestes du bureau sur une journée, tous gardés :
 * - Corriger (journée validée) : 1) nouvelles valeurs + motif ; 2) récapitulatif avant → après
 *   + case « je confirme » ;
 * - Rouvrir (journée validée) : motif, la journée repasse « envoyée » (retour dans À valider) ;
 * - Supprimer : 1) motif ; 2) retaper le nom du salarié ou la date ; 3) confirmation finale.
 * Tout est tracé par la base (historique avant / après, qui, quand, motif).
 */
export function ActionsJournee({ j, peutCorriger, peutSupprimer, onFait, onSupprimee }: {
  j: JourneeColis
  peutCorriger: boolean
  peutSupprimer: boolean
  onFait: () => void
  onSupprimee: () => void
}) {
  const [mode, setMode] = useState<Mode>(null)
  const validee = j.statut === 'validee'
  if (!peutCorriger && !peutSupprimer) return null

  if (mode === 'corriger') return <Corriger j={j} onAnnuler={() => setMode(null)} onFait={() => { setMode(null); onFait() }} />
  if (mode === 'rouvrir') return <Rouvrir j={j} onAnnuler={() => setMode(null)} onFait={() => { setMode(null); onFait() }} />
  if (mode === 'supprimer') return <Supprimer j={j} onAnnuler={() => setMode(null)} onFait={onSupprimee} />

  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--border)]">
      {peutCorriger && validee && (
        <>
          <Button variant="secondary" onClick={() => setMode('corriger')}><Pencil size={14} /> Corriger</Button>
          <Button variant="secondary" onClick={() => setMode('rouvrir')}><RotateCcw size={14} /> Rouvrir</Button>
        </>
      )}
      {peutSupprimer && (
        <Button variant="ghost" className="ml-auto text-[var(--danger)]" onClick={() => setMode('supprimer')}>
          <Trash2 size={14} /> Supprimer…
        </Button>
      )}
    </div>
  )
}

function Cadre({ titre, danger, children }: { titre: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-3 rounded-[var(--r-md)] border p-3 ${danger
      ? 'border-[var(--danger)]/40 bg-[var(--danger)]/5' : 'border-[var(--warning)]/40 bg-[var(--warning)]/5'}`}>
      <p className="text-sm font-semibold text-[var(--text)]">{titre}</p>
      {children}
    </div>
  )
}

function ChampMotif({ valeur, onChange, aide }: { valeur: string; onChange: (v: string) => void; aide: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--text-muted)]">Motif (obligatoire, gardé dans l’historique) *</span>
      <textarea className="field min-h-[3.5rem]" value={valeur} placeholder={aide} onChange={e => onChange(e.target.value)} />
      {valeur && !motifValide(valeur) && <span className="text-xs text-[var(--text-muted)]">5 caractères minimum</span>}
    </label>
  )
}

function Corriger({ j, onAnnuler, onFait }: { j: JourneeColis; onAnnuler: () => void; onFait: () => void }) {
  const { toast } = useToast()
  const avant: NombresColis = colisRetenus(j)
  const [saisie, setSaisie] = useState(versSaisie(avant))
  const [motif, setMotif] = useState('')
  const [etape, setEtape] = useState<1 | 2>(1)
  const [confirme, setConfirme] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const apres = nombresSaisis(saisie)
  const diff = apres ? ecarts(avant, apres) : []

  const enregistrer = async () => {
    if (!apres) return
    setEnvoi(true)
    const { error } = await corrigerJournee(j.id, apres, motif.trim())
    setEnvoi(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Correction enregistrée (historique mis à jour)')
    onFait()
  }

  if (etape === 1) {
    return (
      <Cadre titre="Corriger une journée validée — étape 1 / 2">
        <div className="grid grid-cols-3 gap-2">
          {(['domicile', 'relais', 'litige'] as const).map(c => (
            <label key={c} className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-[var(--text-muted)] truncate">{LIBELLE_CHAMP[c]}</span>
              <input className="field text-right" inputMode="numeric" value={saisie[c]}
                onChange={e => setSaisie(s => ({ ...s, [c]: e.target.value }))} />
            </label>
          ))}
        </div>
        {apres == null && <p className="text-xs text-[var(--danger)]">Entier positif attendu dans chaque case.</p>}
        {apres && diff.length === 0 && <p className="text-xs text-[var(--text-muted)]">Aucun changement pour l’instant.</p>}
        <ChampMotif valeur={motif} onChange={setMotif} aide="ex. Recompté avec le relevé du client : 3 colis en trop" />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={!apres || diff.length === 0 || !motifValide(motif)} onClick={() => setEtape(2)}>
            Vérifier la correction <ArrowRight size={14} />
          </Button>
          <Button variant="secondary" onClick={onAnnuler}>Annuler</Button>
        </div>
      </Cadre>
    )
  }

  return (
    <Cadre titre="Corriger une journée validée — étape 2 / 2 : vérifier">
      <p className="text-sm text-[var(--text-muted)]">
        {j.team_members?.full_name ?? 'Salarié'} · {dateFr(j.date)} · {j.clients?.name ?? ''}
      </p>
      <div className="flex flex-col gap-1">
        {diff.map(d => (
          <p key={d.champ} className="text-sm text-[var(--text)]">
            {LIBELLE_CHAMP[d.champ]} : <span className="line-through text-[var(--text-muted)]">{d.avant}</span>
            {' → '}<span className="font-semibold">{d.apres}</span>
          </p>
        ))}
      </div>
      <p className="text-sm text-[var(--text-muted)]">Motif : {motif.trim()}</p>
      <label className="flex items-start gap-2 text-sm text-[var(--text)] cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={confirme} onChange={e => setConfirme(e.target.checked)} />
        Je confirme cette correction : elle change les colis payés au salarié et reste dans l’historique.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!confirme || envoi} onClick={() => void enregistrer()}>
          {envoi ? 'Enregistrement…' : 'Enregistrer la correction'}
        </Button>
        <Button variant="secondary" disabled={envoi} onClick={() => { setEtape(1); setConfirme(false) }}>Retour</Button>
        <Button variant="ghost" disabled={envoi} onClick={onAnnuler}>Annuler</Button>
      </div>
    </Cadre>
  )
}

function Rouvrir({ j, onAnnuler, onFait }: { j: JourneeColis; onAnnuler: () => void; onFait: () => void }) {
  const { toast } = useToast()
  const [motif, setMotif] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const rouvrir = async () => {
    setEnvoi(true)
    const { error } = await rouvrirJournee(j.id, motif.trim())
    setEnvoi(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Journée rouverte : elle revient dans « À valider »')
    onFait()
  }
  return (
    <Cadre titre="Rouvrir la journée">
      <p className="text-sm text-[var(--text-muted)]">
        Elle repasse « envoyée au bureau » et revient dans l’onglet À valider. Le salarié peut de nouveau la modifier.
      </p>
      <ChampMotif valeur={motif} onChange={setMotif} aide="ex. Le salarié doit ajouter la photo du deuxième appareil" />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!motifValide(motif) || envoi} onClick={() => void rouvrir()}>
          {envoi ? '…' : 'Rouvrir'}
        </Button>
        <Button variant="secondary" disabled={envoi} onClick={onAnnuler}>Annuler</Button>
      </div>
    </Cadre>
  )
}

function Supprimer({ j, onAnnuler, onFait }: { j: JourneeColis; onAnnuler: () => void; onFait: () => void }) {
  const { toast } = useToast()
  const [motif, setMotif] = useState('')
  const [retape, setRetape] = useState('')
  const [etape, setEtape] = useState<1 | 2>(1)
  const [finale, setFinale] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const nom = j.team_members?.full_name ?? ''

  const supprimer = async () => {
    setEnvoi(true)
    const { error } = await supprimerJournee(j.id, motif.trim())
    setEnvoi(false)
    setFinale(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Journée supprimée (trace gardée dans l’historique)')
    onFait()
  }

  return (
    <Cadre titre={`Supprimer la journée — étape ${etape} / 3`} danger>
      {etape === 1 ? (
        <>
          <p className="text-sm text-[var(--text-muted)]">
            La journée disparaît des rapports et de la paie. Préférer « Corriger » si seuls les nombres sont faux.
          </p>
          <ChampMotif valeur={motif} onChange={setMotif} aide="ex. Journée saisie en double pour le même client" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!motifValide(motif)} onClick={() => setEtape(2)}>
              Continuer <ArrowRight size={14} />
            </Button>
            <Button variant="secondary" onClick={onAnnuler}>Annuler</Button>
          </div>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--text)]">
              Pour confirmer, retape le nom du salarié (<strong>{nom || '—'}</strong>) ou la date (<strong>{dateFr(j.date)}</strong>).
            </span>
            <input className="field" value={retape} onChange={e => setRetape(e.target.value)} autoComplete="off" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" className="!from-[var(--danger)] !to-[var(--danger)]"
              disabled={!confirmationRetapee(retape, nom, j.date) || envoi} onClick={() => setFinale(true)}>
              <Trash2 size={14} /> Supprimer définitivement…
            </Button>
            <Button variant="secondary" disabled={envoi} onClick={() => setEtape(1)}>Retour</Button>
            <Button variant="ghost" disabled={envoi} onClick={onAnnuler}>Annuler</Button>
          </div>
        </>
      )}
      <ConfirmDialog
        open={finale}
        title="Dernière confirmation"
        message={`Supprimer la journée de ${nom || 'ce salarié'} du ${dateFr(j.date)} (${j.clients?.name ?? 'client'}) ? Motif : ${motif.trim()}`}
        acknowledgeLabel="Je comprends que cette journée sera supprimée"
        confirmLabel="Supprimer"
        loading={envoi}
        onConfirm={() => void supprimer()}
        onCancel={() => setFinale(false)}
      />
    </Cadre>
  )
}
