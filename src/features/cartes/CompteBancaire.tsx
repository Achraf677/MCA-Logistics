import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Eye, FileText, Landmark, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import { useProfile } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Drawer } from '../../shared/ui/Drawer'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { erreurLibelleCompte, erreursBancaires, ibanLisible } from '../../shared/lib/coordonneesBancaires'
import {
  creerCompte, envoyerRib, lienRib, listerComptes, modifierCompte, retirerRib, supprimerCompteBancaire,
  type CompteBancaire as Compte,
} from '../../shared/lib/compteBancaire.queries'

/**
 * Comptes bancaires de la société : un ou plusieurs comptes, chacun avec son RIB en PDF (consultable et téléchargeable).
 * Lecture par défaut ; changer l'IBAN d'un compte existant demande une confirmation.
 */
export function CompteBancaire() {
  const { companyId } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const peutModifier = can('systeme.parametres', 'update')
  const [comptes, setComptes] = useState<Compte[] | null>(null)
  const [fiche, setFiche] = useState<{ compte: Compte | null } | null>(null)
  const [aSupprimer, setASupprimer] = useState<Compte | null>(null)

  const charger = useCallback(async () => {
    const { data, error } = await listerComptes()
    if (error) toast(error.message, 'error')
    setComptes((data as Compte[]) ?? [])
  }, [toast])
  useEffect(() => { void charger() }, [charger])

  async function ouvrirRib(c: Compte) {
    const url = await lienRib(c)
    if (!url) { toast('RIB introuvable', 'error'); return }
    ouvrirDocument(url, { titre: `RIB ${c.libelle}`, type: /\.(png|jpe?g|webp)$/i.test(c.rib_nom ?? '') ? 'image' : 'pdf' })
  }
  async function telechargerRib(c: Compte) {
    const url = await lienRib(c, true)
    if (!url) { toast('RIB introuvable', 'error'); return }
    window.location.assign(url)
  }
  async function supprimer(c: Compte) {
    setASupprimer(null)
    setComptes(cs => (cs ?? []).filter(x => x.id !== c.id))
    const { error } = await supprimerCompteBancaire(c)
    if (error) { toast(error.message, 'error'); void charger() } else toast('Compte supprimé')
  }

  return (
    <>
      <Bloc titre="Comptes bancaires de la société" icone={<Landmark size={15} />}
        droite={peutModifier ? <Button variant="ghost" size="compact" onClick={() => setFiche({ compte: null })}><Plus size={13} /> Ajouter un compte</Button> : undefined}>
        {comptes === null ? <p className="text-sm text-[var(--text-muted)]">Chargement…</p>
          : comptes.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Aucun compte. {peutModifier ? 'Ajoute le compte de la société et glisse son RIB.' : ''}</p>
          : (
            <ul className="flex flex-col divide-y divide-[var(--border)] -my-1">
              {comptes.map(c => (
                <li key={c.id} className="py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="min-w-[10rem]">
                    <p className="text-sm font-medium text-[var(--text)]">{c.libelle}</p>
                    {c.banque && <p className="text-xs text-[var(--text-muted)]">{c.banque}</p>}
                  </div>
                  <div className="flex-1 min-w-[16rem] text-sm font-mono break-all">
                    {c.iban ? ibanLisible(c.iban) : <span className="font-sans text-[var(--text-disabled)]">IBAN non renseigné</span>}
                    {c.bic && <span className="ml-3 text-[var(--text-muted)]">{c.bic}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.rib_path ? (
                      <>
                        <Button variant="secondary" size="compact" onClick={() => ouvrirRib(c)}><FileText size={13} /> RIB</Button>
                        <Button variant="ghost" size="compact" onClick={() => telechargerRib(c)} title="Télécharger le RIB"><Download size={13} /></Button>
                      </>
                    ) : <span className="text-xs text-[var(--text-disabled)]">Pas de RIB</span>}
                    {peutModifier && (
                      <>
                        <Button variant="ghost" size="compact" onClick={() => setFiche({ compte: c })} title="Modifier"><Pencil size={13} /></Button>
                        <Button variant="ghost" size="compact" onClick={() => setASupprimer(c)} title="Supprimer" className="text-[var(--danger)]"><Trash2 size={13} /></Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
      </Bloc>

      {fiche && companyId && (
        <FicheCompte compte={fiche.compte} companyId={companyId}
          onClose={() => setFiche(null)}
          onSaved={() => { setFiche(null); void charger() }} />
      )}

      <ConfirmDialog
        open={aSupprimer !== null}
        title={`Supprimer le compte « ${aSupprimer?.libelle ?? ''} » ?`}
        message="Le compte et son RIB seront supprimés. Cette action est irréversible."
        confirmLabel="Supprimer"
        onConfirm={() => { if (aSupprimer) void supprimer(aSupprimer) }}
        onCancel={() => setASupprimer(null)}
      />
    </>
  )
}

function FicheCompte({ compte, companyId, onClose, onSaved }: {
  compte: Compte | null; companyId: string; onClose: () => void; onSaved: () => void
}) {
  const { toast } = useToast()
  const [libelle, setLibelle] = useState(compte?.libelle ?? '')
  const [banque, setBanque] = useState(compte?.banque ?? '')
  const [iban, setIban] = useState(compte?.iban ?? '')
  const [bic, setBic] = useState(compte?.bic ?? '')
  const [fichier, setFichier] = useState<File | null>(null)
  const [ribRetire, setRibRetire] = useState(false)
  const [survol, setSurvol] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmer, setConfirmer] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const erreurs = erreursBancaires({ iban, bic })
  const erreurNom = erreurLibelleCompte(libelle)
  const norm = (v: string) => v.replace(/\s/g, '').toUpperCase()
  const coordonneesChangees = !!compte && (norm(iban) !== norm(compte.iban ?? '') || norm(bic) !== norm(compte.bic ?? ''))
  const bloque = !!erreurNom || Object.keys(erreurs).length > 0

  function choisir(f: File | undefined | null) {
    if (!f) return
    if (!/pdf|image/.test(f.type)) { toast('Le RIB doit être un PDF ou une image', 'error'); return }
    setFichier(f); setRibRetire(false)
  }

  async function enregistrer() {
    if (bloque) return
    setSaving(true)
    const saisie = { libelle: libelle.trim(), banque: banque.trim() || null, iban: norm(iban) || null, bic: norm(bic) || null }
    let ribPath = compte?.rib_path ?? null
    let ribNom = compte?.rib_nom ?? null
    if (fichier) {
      const r = await envoyerRib(companyId, fichier)
      if (r.error || !r.path) { toast(r.error?.message ?? 'Envoi du RIB impossible', 'error'); setSaving(false); return }
      if (compte?.rib_path) void retirerRib(compte.rib_path)
      ribPath = r.path; ribNom = fichier.name
    } else if (ribRetire && compte?.rib_path) {
      void retirerRib(compte.rib_path)
      ribPath = null; ribNom = null
    }
    const { error } = compte
      ? await modifierCompte(compte.id, { ...saisie, rib_path: ribPath, rib_nom: ribNom })
      : await creerCompte(companyId, saisie).then(async r => {
          if (!r.error && r.data && ribPath) return modifierCompte(r.data.id, { rib_path: ribPath, rib_nom: ribNom })
          return r
        })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast(compte ? 'Compte enregistré' : 'Compte ajouté')
    onSaved()
  }

  const ribAffiche = fichier?.name ?? (!ribRetire ? compte?.rib_nom : null)

  return (
    <>
      <Drawer open onClose={onClose} title={compte ? 'Modifier le compte' : 'Ajouter un compte'} width="max-w-lg">
        <div className="flex flex-col gap-4 min-h-full">
          <Bloc titre="Le compte">
            <Champ label="Nom du compte" requis error={libelle ? erreurNom : undefined}>
              <input className="field" value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Compte principal" />
            </Champ>
            <Champ label="Banque">
              <input className="field" value={banque} onChange={e => setBanque(e.target.value)} placeholder="Qonto" />
            </Champ>
            <Champ label="IBAN" error={erreurs.iban}>
              <input className="field font-mono" value={iban} onChange={e => setIban(e.target.value)} placeholder="FR76 …" />
            </Champ>
            <Champ label="BIC / SWIFT" error={erreurs.bic}>
              <input className="field font-mono" value={bic} onChange={e => setBic(e.target.value)} placeholder="QNTOFRP1XXX" />
            </Champ>
          </Bloc>

          <Bloc titre="RIB (PDF)" icone={<FileText size={15} />}>
            <div
              onDragOver={e => { e.preventDefault(); setSurvol(true) }}
              onDragLeave={() => setSurvol(false)}
              onDrop={e => { e.preventDefault(); setSurvol(false); choisir(e.dataTransfer.files?.[0]) }}
              className={`rounded-[var(--r-md)] border-2 border-dashed p-5 text-center transition-colors ${survol ? 'border-[var(--brand)] bg-[var(--brand)]/5' : 'border-[var(--border)]'}`}>
              <Upload size={18} className="mx-auto mb-2 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text)]">Glisse le RIB ici</p>
              <button type="button" className="text-xs text-[var(--brand)] hover:underline mt-1" onClick={() => input.current?.click()}>ou choisis un fichier</button>
              <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { choisir(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            {ribAffiche && (
              <div className="flex items-center gap-2 text-sm">
                <FileText size={14} className="text-[var(--brand)] shrink-0" />
                <span className="truncate flex-1">{ribAffiche}{fichier ? ' (à enregistrer)' : ''}</span>
                {compte?.rib_path && !fichier && (
                  <Button variant="ghost" size="compact" onClick={async () => { const u = await lienRib(compte); if (u) ouvrirDocument(u, { titre: `RIB ${compte.libelle}`, type: /\.(png|jpe?g|webp)$/i.test(compte.rib_nom ?? '') ? 'image' : 'pdf' }) }}><Eye size={13} /></Button>
                )}
                <Button variant="ghost" size="compact" title="Retirer le RIB" onClick={() => { setFichier(null); setRibRetire(true) }}><X size={13} /></Button>
              </div>
            )}
          </Bloc>

          <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)] flex-1">{bloque ? 'Il manque le nom du compte, ou un IBAN / BIC est incorrect.' : 'Prêt à enregistrer.'}</span>
            <Button variant="secondary" className="min-h-10" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button variant="primary" className="min-h-10" disabled={saving || bloque}
              onClick={() => coordonneesChangees ? setConfirmer(true) : void enregistrer()}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmer}
        title="Changer les coordonnées bancaires ?"
        message="L'IBAN de la société est repris dans les règlements. Une erreur ou une substitution détourne des paiements : vérifie bien la nouvelle valeur."
        confirmLabel="Enregistrer"
        acknowledgeLabel="Je confirme vouloir changer ces coordonnées"
        onConfirm={() => { setConfirmer(false); void enregistrer() }}
        onCancel={() => setConfirmer(false)}
      />
    </>
  )
}
