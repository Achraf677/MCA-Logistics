import { useEffect, useState } from 'react'
import { Check, CreditCard, ExternalLink, FileText, Sparkles, Trash2, Undo2, Wallet, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { Skeleton } from '../../shared/ui/Skeleton'
import { formatMoney } from '../../shared/lib/money'
import {
  CATEGORIES_DEPENSE, LIBELLE_CHAMP_LU, moyenAvecCarte, estCarburant, manquesValidation, montantSaisiEnCts, type CategorieDepense,
} from '../../shared/lib/depenses'
import { libelleCarte, optionsCartes, typeCarteDuMoyen } from '../../shared/lib/cartes'
import { useCartes } from '../../shared/lib/useCartes'
import { urlTicket, type TicketInbox } from '../../shared/lib/receiptsInbox.queries'
import { jourFr } from './charges.logic'
import { etapesSuivi, etatJustificatif, type EtapeSuivi } from './justificatifs.logic'

const aujourdhuiLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export interface MajJustificatif {
  montant_ttc_cts: number | null; date_depense: string | null; categorie: string | null
  moyen_paiement: string | null; carte: string | null; vehicle_id: string | null; supplier_id: string | null
}

/** Moyen de paiement : pictogramme + libellé. */
export function Paiement({ moyen, carte }: { moyen: string | null | undefined; carte?: string | null }) {
  const cartes = useCartes()
  if (moyen === 'personnel') return <span className="inline-flex items-center gap-1.5 text-[var(--text)]"><Wallet size={13} className="text-[var(--text-muted)]" /> Note de frais</span>
  if (moyen === 'carte_carburant') return <span className="inline-flex items-center gap-1.5 text-[var(--text)]"><CreditCard size={13} className="text-[var(--text-muted)]" /> Carte carburant{carte ? ` · ${libelleCarte(carte, cartes)}` : ''}</span>
  if (moyen === 'carte_societe') return <span className="inline-flex items-center gap-1.5 text-[var(--text)]"><CreditCard size={13} className="text-[var(--text-muted)]" /> Carte société{carte ? ` · ${libelleCarte(carte, cartes)}` : ''}</span>
  return <span className="text-[var(--text-disabled)]">Non précisé</span>
}

/** Ce que l'IA a lu sur le ticket : cases préremplies à vérifier, et alerte si le montant lu diffère du montant saisi. */
function BandeauLecture({ t, lectureEnCours, montantSaisi }: { t: TicketInbox; lectureEnCours: boolean; montantSaisi: number | null }) {
  const l = t.ocr_lecture
  const rempli = (l?.rempli ?? []).map(c => LIBELLE_CHAMP_LU[c] ?? c)
  const luCts = l?.lu?.total_ttc_cts ?? null
  const ecart = luCts != null && montantSaisi != null && luCts !== montantSaisi
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--brand)]/30 bg-[var(--brand)]/[0.06] px-3.5 py-2.5 text-sm flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[var(--text)]">
        <Sparkles size={15} className={`text-[var(--brand)] shrink-0 ${lectureEnCours ? 'animate-pulse' : ''}`} />
        <span>
          {lectureEnCours ? 'Lecture du ticket en cours…'
            : rempli.length ? <>Prérempli d’après le ticket : <strong className="font-semibold">{rempli.join(', ')}</strong>. Vérifie avant de valider.</>
            : l?.raison ? `Ticket non lu : ${l.raison}.` : 'Ticket lu : rien à préremplir.'}
        </span>
      </div>
      {ecart && <div className="text-[var(--warning)] font-medium">Le ticket indique {formatMoney(luCts!)}, pas {formatMoney(montantSaisi!)}.</div>}
      {l?.lu?.fournisseur && !lectureEnCours && <div className="text-xs text-[var(--text-muted)]">Fournisseur lu : {l.lu.fournisseur}</div>}
    </div>
  )
}

/** Frise de suivi : un point par étape, relié par un trait ; le point plein = acquis. */
function Frise({ etapes }: { etapes: EtapeSuivi[] }) {
  return (
    <ol className="flex items-start">
      {etapes.map((e, i) => {
        const couleur = e.etat === 'fait' ? 'var(--success)' : e.etat === 'refuse' ? 'var(--danger)' : 'var(--border-strong)'
        return (
          <li key={e.cle} className="flex-1 min-w-0 flex flex-col items-center text-center relative">
            {i > 0 && <span aria-hidden="true" className="absolute top-[0.55rem] right-1/2 w-full h-0.5" style={{ background: etapes[i - 1].etat === 'fait' ? 'var(--success)' : 'var(--border)' }} />}
            <span className="relative z-10 h-[1.15rem] w-[1.15rem] rounded-full border-2 flex items-center justify-center bg-[var(--bg-card)]"
              style={{ borderColor: couleur, background: e.etat === 'attente' ? undefined : couleur }}>
              {e.etat === 'fait' && <Check size={10} className="text-white" strokeWidth={3} />}
              {e.etat === 'refuse' && <X size={10} className="text-white" strokeWidth={3} />}
            </span>
            <span className={`mt-1.5 text-xs font-semibold ${e.etat === 'attente' ? 'text-[var(--text-muted)]' : 'text-[var(--text)]'}`}>{e.libelle}</span>
            <span className="text-[0.6875rem] text-[var(--text-muted)] truncate max-w-full">{e.date ? dateHeure(e.date) : '—'}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Aperçu du ticket : photo, PDF ou, à défaut, un lien. Grand, collé en haut pendant qu'on remplit à droite. */
function Apercu({ t, url, onFichier }: { t: TicketInbox; url: string | null; onFichier: () => void }) {
  const image = t.mime_type?.startsWith('image/')
  const pdf = t.mime_type === 'application/pdf'
  return (
    <div className="relative rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-deep)] overflow-hidden h-80 lg:h-[calc(100vh-var(--topbar-h)-9rem)] min-h-[18rem] flex items-center justify-center">
      {image ? (url ? <img src={url} alt="Justificatif" className="max-h-full max-w-full object-contain" /> : <Skeleton className="w-full h-full" />)
        : pdf && url ? <iframe src={url} title="Justificatif" className="w-full h-full bg-white" />
        : <div className="flex flex-col items-center gap-2 text-[var(--text-muted)] text-sm"><FileText size={36} /> Aperçu indisponible</div>}
      <button type="button" onClick={onFichier}
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-[var(--r-md)] bg-black/60 hover:bg-black/75 text-white text-xs font-medium px-2.5 py-1.5">
        <ExternalLink size={13} /> Ouvrir en grand
      </button>
    </div>
  )
}

/** Tiroir d'un justificatif : le ticket à gauche, ce qu'on y lit et ce qu'on décide à droite, les gestes en bas. */
export function FicheJustificatif({ t, lectureEnCours, nom, peutEcrire, busy, fournisseurs, vehicules, onFichier, onEnregistrer, onValider, onRefuser, onRembourser, peutSupprimer, onRemettre, onSupprimer }: {
  t: TicketInbox
  lectureEnCours: boolean
  nom: string
  peutEcrire: boolean
  busy: boolean
  fournisseurs: Array<{ id: string; name: string }>
  vehicules: Array<{ id: string; label: string; plate: string | null }>
  onFichier: () => void
  onEnregistrer: (maj: MajJustificatif) => void
  onValider: (maj: MajJustificatif) => void
  onRefuser: (motif: string) => void
  onRembourser: (date: string | null) => void
  peutSupprimer: boolean
  onRemettre: () => void
  onSupprimer: () => void
}) {
  const [montant, setMontant] = useState(t.montant_ttc_cts != null ? (t.montant_ttc_cts / 100).toFixed(2).replace('.', ',') : '')
  const [date, setDate] = useState(t.date_depense ?? t.created_at.slice(0, 10))
  const [categorie, setCategorie] = useState<CategorieDepense | ''>((t.categorie as CategorieDepense | null) ?? '')
  const [moyen, setMoyen] = useState(t.moyen_paiement ?? '')
  const toutesCartes = useCartes()
  const jourEnvoi = t.created_at.slice(0, 10)
  const [carte, setCarte] = useState(t.carte ?? '')
  const [vehicule, setVehicule] = useState(t.vehicle_id ?? '')
  const [fournisseur, setFournisseur] = useState(t.supplier_id ?? '')
  const [refus, setRefus] = useState(false)
  const [suppression, setSuppression] = useState(false)
  const [motif, setMotif] = useState('')
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    urlTicket(t).then(u => { if (!annule) setUrl(u) })
    return () => { annule = true }
  }, [t])

  const cts = montantSaisiEnCts(montant)
  const invalide = Number.isNaN(cts)
  const modifie = !invalide && (
    cts !== (t.montant_ttc_cts ?? null) || date !== (t.date_depense ?? t.created_at.slice(0, 10)) || (t.date_depense == null && !!date)
    || (categorie || null) !== (t.categorie ?? null) || (moyen || null) !== (t.moyen_paiement ?? null)
    || (moyenAvecCarte(moyen) ? carte || null : null) !== (t.carte ?? null)
    || (estCarburant(moyen) ? vehicule || null : null) !== (t.vehicle_id ?? null)
    || (fournisseur || null) !== (t.supplier_id ?? null))
  const etat = etatJustificatif(t)
  const noteDeFrais = t.moyen_paiement === 'personnel'
  const carburant = estCarburant(moyen)
  const montantAffiche = !invalide && cts != null ? formatMoney(cts) : null
  const a_traiter = t.statut === 'a_traiter'
  const maj: MajJustificatif = { montant_ttc_cts: cts, date_depense: date || null, categorie: categorie || null, moyen_paiement: moyen || null, carte: moyenAvecCarte(moyen) ? (carte || null) : null, vehicle_id: estCarburant(moyen) ? (vehicule || null) : null, supplier_id: fournisseur || null }
  // Ce qui manque, d'après ce qui est à l'écran (pas seulement ce qui est enregistré).
  const manques = invalide ? ['Montant'] : manquesValidation(maj)

  return (
    <div className="flex flex-col gap-5 min-h-full">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] flex-1 content-start">
        <div className="lg:sticky lg:top-0 lg:self-start">
          <Apercu t={t} url={url} onFichier={onFichier} />
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <header className="flex items-start gap-3">
            <AvatarInitiales nom={nom} taille="lg" />
            <div className="min-w-0 flex-1">
              <div className="font-mono font-semibold text-3xl leading-none text-[var(--text)]">
                {montantAffiche ?? <span className="text-xl font-sans font-medium text-[var(--danger)]">Montant à saisir</span>}
              </div>
              <div className="mt-1.5 text-sm text-[var(--text-muted)] truncate">{nom} · {jourFr(date)}</div>
              {t.note && <div className="mt-0.5 text-sm text-[var(--text)] line-clamp-2">{t.note}</div>}
            </div>
            <Badge color={etat.ton}>{etat.libelle}</Badge>
          </header>

          {t.statut === 'a_traiter' && (lectureEnCours || t.ocr_lecture) && (
            <BandeauLecture t={t} lectureEnCours={lectureEnCours} montantSaisi={Number.isNaN(cts) ? null : cts} />
          )}

          <Bloc titre="Dépense" droite={peutEcrire && t.statut === 'a_traiter' ? <span className="text-xs text-[var(--text-muted)]"><span className="text-[var(--danger)]">*</span> tout est obligatoire</span> : undefined}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ label="Montant TTC (€)" requis error={invalide ? 'Montant invalide (ex. 12,50)' : undefined}>
                <input className="field font-mono" inputMode="decimal" value={montant} onChange={e => setMontant(e.target.value)} placeholder="12,50" disabled={!peutEcrire} aria-invalid={invalide} />
              </Champ>
              <Champ label="Date de la dépense" requis>
                <input className="field" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={!peutEcrire} />
              </Champ>
              {!carburant && <Champ label="Catégorie" requis>
                <ListeDeroulante valeur={categorie} onChange={v => setCategorie(v as CategorieDepense)} disabled={!peutEcrire}
                  placeholder="Choisir une catégorie" ariaLabel="Catégorie" invalide={a_traiter && !categorie}
                  options={CATEGORIES_DEPENSE.map(c => ({ valeur: c.valeur, libelle: c.libelle }))} />
              </Champ>}
              <Champ label="Payé avec" requis>
                <ListeDeroulante valeur={moyen} onChange={v => { setMoyen(v); setCarte(''); if (!estCarburant(v)) setVehicule('') }} disabled={!peutEcrire} placeholder="Choisir" ariaLabel="Payé avec" invalide={a_traiter && !moyen}
                  options={[{ valeur: 'carte_societe', libelle: 'Carte de la société' }, { valeur: 'carte_carburant', libelle: 'Carte carburant' }, { valeur: 'personnel', libelle: 'De sa poche (note de frais)' }]} />
              </Champ>
              {moyenAvecCarte(moyen) && (
                <Champ label="Quelle carte" requis>
                  <ListeDeroulante valeur={carte} onChange={setCarte} disabled={!peutEcrire} placeholder="Choisir la carte" ariaLabel="Carte"
                    invalide={a_traiter && !carte} options={optionsCartes(toutesCartes, typeCarteDuMoyen(moyen) ?? 'toutes', date || jourEnvoi, t.carte)} />
                </Champ>
              )}
              {carburant && (
                <Champ label="Véhicule" requis>
                  <ListeDeroulante valeur={vehicule} onChange={setVehicule} disabled={!peutEcrire} placeholder="Choisir le véhicule" ariaLabel="Véhicule"
                    invalide={a_traiter && !vehicule} options={vehicules.map(v => ({ valeur: v.id, libelle: v.label, detail: v.plate ?? undefined }))} />
                </Champ>
              )}
              {!carburant && <div className="sm:col-span-2">
                <Champ label="Fournisseur" requis>
                  <ListeDeroulante valeur={fournisseur} onChange={setFournisseur} disabled={!peutEcrire} placeholder="Choisir un fournisseur" ariaLabel="Fournisseur"
                    invalide={a_traiter && !fournisseur} recherche options={fournisseurs.map(f => ({ valeur: f.id, libelle: f.name }))} />
                </Champ>
              </div>}
            </div>
            {peutEcrire && modifie && (
              <div className="flex items-center gap-3">
                <Button variant="primary" size="compact" disabled={busy || invalide}
                  onClick={() => onEnregistrer(maj)}>
                  Enregistrer les modifications
                </Button>
              </div>
            )}
          </Bloc>

          <Bloc titre="Suivi">
            <Frise etapes={etapesSuivi(t)} />
            {t.statut === 'ignore' && t.motif_refus && (
              <p className="text-sm text-[var(--danger)] rounded-[var(--r-md)] bg-[var(--danger)]/10 px-3 py-2">Motif du refus : {t.motif_refus}</p>
            )}
            {t.rembourse_le && <p className="text-sm text-[var(--text-muted)]">Remboursé le {jourFr(t.rembourse_le)}.</p>}
            <p className="text-xs text-[var(--text-muted)]"><Paiement moyen={t.moyen_paiement} carte={t.carte} /></p>
          </Bloc>
        </div>
      </div>

      {peutEcrire && (
        <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3 flex flex-col gap-3">
          {refus ? (
            <div className="flex flex-wrap items-center gap-2">
              <input className="field flex-1 min-w-[14rem]" autoFocus value={motif} placeholder="Motif lu par le déclarant (ex. ticket illisible)"
                onChange={e => setMotif(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && motif.trim().length >= 5) onRefuser(motif.trim()) }} />
              <Button variant="primary" size="compact" disabled={busy || motif.trim().length < 5} onClick={() => onRefuser(motif.trim())}>Confirmer le refus</Button>
              <Button variant="secondary" size="compact" onClick={() => setRefus(false)}>Annuler</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {a_traiter && manques.length > 0 && (
                <p className="basis-full text-xs text-[var(--warning)]">Il manque pour valider : {manques.join(', ').toLowerCase()}.</p>
              )}
              {t.statut === 'a_traiter' && (
                <>
                  <Button variant="primary" className="min-h-10" onClick={() => onValider(maj)} disabled={busy || manques.length > 0}><Check size={15} /> {carburant ? 'Valider (suivi carburant, sans Pennylane)' : 'Valider et envoyer à Pennylane'}</Button>
                </>
              )}
              {t.statut === 'traite' && noteDeFrais && (
                t.rembourse_le
                  ? <Button variant="secondary" className="min-h-10" onClick={() => onRembourser(null)} disabled={busy}>Annuler le remboursement</Button>
                  : <Button variant="primary" className="min-h-10" onClick={() => onRembourser(aujourdhuiLocal())} disabled={busy}><Check size={15} /> Marquer remboursé</Button>
              )}
              {t.statut === 'traite' && !noteDeFrais && <span className="text-sm text-[var(--text-muted)]">Justificatif validé.</span>}
              {t.statut === 'ignore' && <span className="text-sm text-[var(--text-muted)]">Dépense refusée.</span>}
              <span className="ml-auto flex items-center gap-2">
                {t.statut === 'a_traiter' && <BoutonIcone icone={X} libelle="Refuser" onClick={() => setRefus(true)} disabled={busy} />}
                {t.statut !== 'a_traiter' && <BoutonIcone icone={Undo2} libelle="Remettre à traiter" onClick={onRemettre} disabled={busy} />}
                {peutSupprimer && <BoutonIcone icone={Trash2} libelle="Supprimer" onClick={() => setSuppression(true)} disabled={busy} />}
              </span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={suppression}
        title="Supprimer ce justificatif ?"
        message={t.pennylane_envoye_le
          ? 'Le ticket et sa photo seront effacés du site. Il a déjà été envoyé à Pennylane : il y reste, à supprimer là-bas si besoin.'
          : 'Le ticket et sa photo seront effacés du site. Cette action est définitive.'}
        confirmLabel="Supprimer"
        onConfirm={() => { setSuppression(false); onSupprimer() }}
        onCancel={() => setSuppression(false)}
      />
    </div>
  )
}
