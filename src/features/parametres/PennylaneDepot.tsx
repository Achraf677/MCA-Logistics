import { useState } from 'react'
import { Mail, Pencil } from 'lucide-react'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { emailMasque } from '../../shared/lib/coordonneesBancaires'
import { updateCompany } from './parametres.queries'
import { emailValide } from './parametres.logic'

/**
 * Adresse de dépôt Pennylane : tickets et factures validés y sont envoyés. Une adresse changée à tort envoie des pièces
 * comptables à un tiers : affichée masquée, elle ne se change qu'après confirmation, en la saisissant DEUX fois.
 */
export function PennylaneDepot({ companyId, valeur, peutModifier, onChange }: {
  companyId: string
  valeur: string
  peutModifier: boolean
  onChange: (v: string) => void
}) {
  const { toast } = useToast()
  const [confirmer, setConfirmer] = useState(false)
  const [edition, setEdition] = useState(false)
  const [nouvelle, setNouvelle] = useState('')
  const [repetee, setRepetee] = useState('')
  const [saving, setSaving] = useState(false)

  const formatOk = emailValide(nouvelle)
  const identiques = nouvelle.trim().toLowerCase() === repetee.trim().toLowerCase()
  const erreurNouvelle = nouvelle && !formatOk ? 'Adresse e-mail incorrecte' : undefined
  const erreurRepetee = repetee && !identiques ? 'Les deux adresses sont différentes' : undefined
  const peutEnregistrer = formatOk && identiques && nouvelle.trim().toLowerCase() !== valeur.toLowerCase()

  function fermer() { setEdition(false); setNouvelle(''); setRepetee('') }

  async function enregistrer() {
    if (!peutEnregistrer) return
    setSaving(true)
    const adresse = nouvelle.trim()
    const { error } = await updateCompany(companyId, { pennylane_depot_email: adresse })
    setSaving(false)
    if (error) { toast((error as Error).message, 'error'); return }
    onChange(adresse)
    fermer()
    toast('Adresse de dépôt Pennylane enregistrée')
  }

  return (
    <>
      <Bloc titre="Dépôt Pennylane" icone={<Mail size={15} />}
        droite={peutModifier && !edition ? <Button variant="ghost" size="compact" onClick={() => setConfirmer(true)}><Pencil size={13} /> Changer</Button> : undefined}>
        {!edition ? (
          <>
            <p className="text-sm font-mono text-[var(--text)] break-all">{valeur ? emailMasque(valeur) : <span className="font-sans text-[var(--text-disabled)]">Non renseignée</span>}</p>
            <p className="text-xs text-[var(--text-muted)]">Adresse de Pennylane qui reçoit les tickets et factures validés dans Finance › Justificatifs.</p>
          </>
        ) : (
          <>
            <Champ label="Nouvelle adresse" error={erreurNouvelle}>
              <input type="email" className="field" value={nouvelle} onChange={e => setNouvelle(e.target.value)} autoComplete="off" placeholder="depot@exemple.pennylane.tech" />
            </Champ>
            <Champ label="Retape la même adresse" error={erreurRepetee}>
              <input type="email" className="field" value={repetee} onChange={e => setRepetee(e.target.value)} autoComplete="off" />
            </Champ>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={fermer} disabled={saving}>Annuler</Button>
              <Button variant="primary" onClick={enregistrer} disabled={saving || !peutEnregistrer}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
            </div>
          </>
        )}
      </Bloc>

      <ConfirmDialog
        open={confirmer}
        title="Changer l'adresse de dépôt Pennylane ?"
        message="Les tickets et factures validés partiront à la nouvelle adresse. Si elle est fausse, des pièces comptables sortent de la société."
        confirmLabel="Changer l'adresse"
        acknowledgeLabel="Je confirme vouloir changer cette adresse"
        onConfirm={() => { setConfirmer(false); setEdition(true) }}
        onCancel={() => setConfirmer(false)}
      />
    </>
  )
}
