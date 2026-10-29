import { useEffect, useState } from 'react'
import { Landmark, Pencil } from 'lucide-react'
import { useProfile } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { erreursBancaires, ibanLisible } from '../../shared/lib/coordonneesBancaires'
import { enregistrerCompteBancaire, lireCompteBancaire } from '../../shared/lib/compteBancaire.queries'

/** Compte bancaire de la société (IBAN / BIC). Lecture par défaut ; la modification demande une confirmation. */
export function CompteBancaire() {
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const peutModifier = can('systeme.parametres', 'update')
  const [actuel, setActuel] = useState<{ iban: string; bic: string } | null>(null)
  const [form, setForm] = useState({ iban: '', bic: '' })
  const [edition, setEdition] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!companyId) return
    lireCompteBancaire(companyId).then(({ data }) => {
      const c = { iban: data?.iban ?? '', bic: data?.bic ?? '' }
      setActuel(c); setForm(c)
    })
  }, [companyId])

  const erreurs = erreursBancaires(form)
  const modifie = !!actuel && (form.iban !== actuel.iban || form.bic !== actuel.bic)

  async function enregistrer() {
    if (!companyId || Object.keys(erreurs).length) return
    setSaving(true)
    const prochain = { iban: form.iban.replace(/\s/g, '').toUpperCase(), bic: form.bic.replace(/\s/g, '').toUpperCase() }
    const { error } = await enregistrerCompteBancaire(companyId, { iban: prochain.iban || null, bic: prochain.bic || null })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    setActuel(prochain); setForm(prochain); setEdition(false)
    toast('Coordonnées bancaires enregistrées')
  }

  return (
    <>
      <Bloc titre="Compte bancaire de la société" icone={<Landmark size={15} />}
        droite={peutModifier && !edition && actuel ? (
          <Button variant="ghost" size="compact" onClick={() => setConfirmer(true)}><Pencil size={13} /> Modifier</Button>
        ) : undefined}>
        {!actuel ? <p className="text-sm text-[var(--text-muted)]">Chargement…</p> : !edition ? (
          <dl className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--text-muted)]">IBAN</dt>
            <dd className="font-mono break-all">{actuel.iban ? ibanLisible(actuel.iban) : <span className="text-[var(--text-disabled)]">Non renseigné</span>}</dd>
            <dt className="text-[var(--text-muted)]">BIC</dt>
            <dd className="font-mono">{actuel.bic || <span className="text-[var(--text-disabled)]">Non renseigné</span>}</dd>
          </dl>
        ) : (
          <>
            <Champ label="IBAN" error={erreurs.iban}>
              <input className="field" value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="FR76 …" />
            </Champ>
            <Champ label="BIC / SWIFT" error={erreurs.bic}>
              <input className="field" value={form.bic} onChange={e => setForm(f => ({ ...f, bic: e.target.value }))} placeholder="QNTOFRP1XXX" />
            </Champ>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setForm(actuel!); setEdition(false) }} disabled={saving}>Annuler</Button>
              <Button variant="primary" onClick={enregistrer} disabled={saving || !modifie || Object.keys(erreurs).length > 0}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </>
        )}
      </Bloc>

      <ConfirmDialog
        open={confirmer}
        title="Modifier le compte bancaire ?"
        message="L'IBAN de la société est repris dans les règlements. Une erreur ou une substitution détourne des paiements : vérifie bien la nouvelle valeur."
        confirmLabel="Modifier"
        acknowledgeLabel="Je confirme vouloir changer les coordonnées bancaires"
        onConfirm={() => { setConfirmer(false); setEdition(true) }}
        onCancel={() => setConfirmer(false)}
      />
    </>
  )
}
