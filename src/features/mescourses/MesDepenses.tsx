import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Receipt, Pencil, Trash2, FileText, RotateCcw, X, Send, Wallet, CreditCard, Camera } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import { formatMoney } from '../../shared/lib/money'
import {
  LIBELLE_MOYEN, LIBELLE_STATUT_DEPENSE, totalARembourser,
  type MoyenPaiement, type StatutDepense,
} from '../../shared/lib/depenses'
import {
  deposerTicket, mesDepenses, modifierDepense, supprimerDepense, urlTicket, type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'
import {
  formulaireDepenseVide, formulaireDepenseDepuis, manquesDepenseSalarie, detailsDepense, estImage,
  type FormulaireDepense,
} from './espace.logic'
import { libelleDateCourte } from './mescourses.logic'
import { Carte, MessageErreur, champCls, boutonPrimaireCls, boutonSecondaireCls } from './EspaceCommun'
import { VisionneusePhoto, ChoixPhoto } from './VisionneusePhoto'
import { useReprisePhoto } from './useReprisePhoto'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'

const aujourdhui = () => toLocalISO(new Date())

const COULEUR_STATUT: Record<StatutDepense, 'info' | 'success' | 'danger'> = {
  a_traiter: 'info', traite: 'success', ignore: 'danger',
}

const ACCEPT = 'image/*,application/pdf'

/**
 * Mes dépenses : le salarié (ou un associé) photographie un justificatif, vérifie la
 * photo en grand, indique montant, catégorie, date et avec quoi il a payé (carte de la
 * société ou de sa poche), puis suit ce que le bureau en fait. Remplace l'ancien
 * bouton « Ticket » qui envoyait la photo à l'aveugle.
 */
export function MesDepenses() {
  const { toast } = useToast()
  const [liste, setListe] = useState<TicketInbox[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fiche, setFiche] = useState<{ depense: TicketInbox | null } | null>(null)
  const [aRetirer, setARetirer] = useState<TicketInbox | null>(null)
  const [retrait, setRetrait] = useState(false)
  const [enGrand, setEnGrand] = useState<{ t: TicketInbox; url: string | null } | null>(null)

  const recharger = useCallback(async () => {
    const { data, error } = await mesDepenses()
    setErreur(error ? error.message : null)
    setListe(data)
    setChargement(false)
  }, [])
  useEffect(() => { recharger() }, [recharger])

  const aRembourser = totalARembourser(liste.map(t => ({
    moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut, rembourse_le: t.rembourse_le,
  })))

  const retirer = async () => {
    if (!aRetirer) return
    setRetrait(true)
    const { error } = await supprimerDepense(aRetirer)
    setRetrait(false)
    setARetirer(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Dépense retirée')
    await recharger()
  }

  const ouvrir = async (t: TicketInbox) => {
    if (!estImage(t.mime_type)) {
      const url = await urlTicket(t)
      if (!url) { toast('Justificatif introuvable.', 'error'); return }
      ouvrirDocument(url, { titre: t.note || t.file_name, type: 'pdf' })
      return
    }
    setEnGrand({ t, url: null })
    const url = await urlTicket(t)
    setEnGrand(g => (g && g.t.id === t.id ? { t, url } : g))
    if (!url) toast('Photo introuvable.', 'error')
  }

  return (
    <div className="flex flex-col gap-4">
      <Carte>
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 shrink-0 rounded-full inline-flex items-center justify-center bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            <Wallet size={20} />
          </span>
          <div className="flex-1 min-w-0">
            <span className="block text-sm text-[var(--text-muted)]">À te rembourser</span>
            <span className="block text-2xl font-semibold tabular-nums text-[var(--text)]">{formatMoney(aRembourser)}</span>
          </div>
        </div>
        <button className={`${boutonPrimaireCls} w-full`} onClick={() => setFiche({ depense: null })}>
          <Plus size={20} /> Nouvelle dépense
        </button>
      </Carte>

      {erreur && <MessageErreur>Impossible de lire tes dépenses : {erreur}</MessageErreur>}

      {chargement ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : liste.length === 0 ? (
        <EmptyState icon={<Receipt size={28} />} title="Aucune dépense" />
      ) : (
        <ul className="flex flex-col gap-2">
          {liste.map(t => (
            <LigneDepense key={t.id} t={t} onOuvrir={() => ouvrir(t)}
              onModifier={() => setFiche({ depense: t })} onRetirer={() => setARetirer(t)} />
          ))}
        </ul>
      )}

      {fiche && (
        <FicheDepense depense={fiche.depense} onFermer={() => setFiche(null)}
          onEnregistree={async () => { setFiche(null); await recharger() }} />
      )}

      {enGrand && (
        <VisionneusePhoto src={enGrand.url} titre="Justificatif" onFermer={() => setEnGrand(null)} />
      )}

      <ConfirmDialog open={!!aRetirer} title="Retirer la dépense"
        message="Retirer cette dépense et sa photo ? Le bureau ne la verra plus."
        confirmLabel="Retirer" loading={retrait} onConfirm={retirer} onCancel={() => setARetirer(null)} />
    </div>
  )
}

function LigneDepense({ t, onOuvrir, onModifier, onRetirer }: {
  t: TicketInbox
  onOuvrir: () => void
  onModifier: () => void
  onRetirer: () => void
}) {
  const date = t.date_depense ?? t.created_at.slice(0, 10)
  const statut = t.statut as StatutDepense
  return (
    <li className="flex gap-3 p-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)]">
      <button onClick={onOuvrir} aria-label="Voir le justificatif en grand"
        className="w-16 h-16 shrink-0 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
        <Vignette t={t} />
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-start gap-2">
          <span className="flex-1 min-w-0 text-base font-semibold tabular-nums text-[var(--text)]">
            {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : <span className="text-sm font-normal text-[var(--text-muted)]">Montant non indiqué</span>}
          </span>
          <Badge color={COULEUR_STATUT[statut] ?? 'muted'}>{LIBELLE_STATUT_DEPENSE[statut] ?? t.statut}</Badge>
        </div>
        <span className="text-sm text-[var(--text)] truncate">
          {t.note ? `${t.note} · ` : ''}<span className="first-letter:uppercase">{libelleDateCourte(date)}</span>
        </span>
        {t.moyen_paiement && (
          <span className="text-xs text-[var(--text-muted)]">{LIBELLE_MOYEN[t.moyen_paiement as MoyenPaiement] ?? t.moyen_paiement}</span>
        )}
        {t.moyen_paiement === 'personnel' && statut === 'traite' && (
          <span className={`text-xs font-semibold ${t.rembourse_le ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
            {t.rembourse_le ? `Remboursée le ${libelleDateCourte(t.rembourse_le)}` : 'À te rembourser'}
          </span>
        )}
        {statut === 'ignore' && t.motif_refus && (
          <span className="text-xs text-[var(--danger)]">Refusée : {t.motif_refus}</span>
        )}
        {statut === 'a_traiter' && (
          <div className="flex gap-4 pt-1">
            <button onClick={onModifier} className="min-h-10 inline-flex items-center gap-1.5 text-sm text-[var(--brand)]">
              <Pencil size={15} /> Corriger
            </button>
            <button onClick={onRetirer} className="min-h-10 inline-flex items-center gap-1.5 text-sm text-[var(--danger)]">
              <Trash2 size={15} /> Retirer
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

/** Vignette signée à l'affichage (bucket privé, lien d'une heure). */
function Vignette({ t }: { t: TicketInbox }) {
  const [url, setUrl] = useState<string | null>(null)
  const image = estImage(t.mime_type)
  useEffect(() => {
    if (!image) return
    let annule = false
    urlTicket(t).then(u => { if (!annule) setUrl(u) })
    return () => { annule = true }
  }, [t, image])
  if (!image) return <FileText size={22} className="m-auto text-[var(--text-muted)]" />
  return url
    ? <img src={url} alt="Justificatif" className="w-full h-full object-cover" loading="lazy" />
    : <Camera size={20} className="m-auto text-[var(--text-disabled)]" />
}

// ── Saisie / correction d'une dépense ───────────────────────────────────────

function FicheDepense({ depense, onFermer, onEnregistree }: {
  depense: TicketInbox | null
  onFermer: () => void
  onEnregistree: () => Promise<void>
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const auj = aujourdhui()
  const [form, setForm] = useState<FormulaireDepense>(() =>
    depense ? formulaireDepenseDepuis(depense, auj) : formulaireDepenseVide(auj))
  const [fichier, setFichier] = useState<{ file: File; url: string | null } | null>(null)
  const [urlExistante, setUrlExistante] = useState<string | null>(null)
  const [enGrand, setEnGrand] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  // Correction : la photo déjà envoyée, en lecture (on corrige les infos, pas le fichier).
  useEffect(() => {
    if (!depense || !estImage(depense.mime_type)) return
    let annule = false
    urlTicket(depense).then(u => { if (!annule) setUrlExistante(u) })
    return () => { annule = true }
  }, [depense])

  useEffect(() => () => { if (fichier?.url) URL.revokeObjectURL(fichier.url) }, [fichier])

  const choisir = (file: File) => {
    setFichier({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
  }
  const reprise = useReprisePhoto(choisir, ACCEPT)

  const aUnFichier = !!depense || !!fichier
  const manques = manquesDepenseSalarie(form, aUnFichier, auj)

  const envoyer = async () => {
    if (manques.length > 0 || envoi) return
    if (!companyId) { toast('Session expirée : reconnecte-toi.', 'error'); return }
    setEnvoi(true)
    const details = detailsDepense(form)
    const { error } = depense
      ? await modifierDepense(depense.id, { ...details, note: form.note.trim() || null })
      : await deposerTicket(fichier!.file, companyId, form.note, details)
    setEnvoi(false)
    if (error) { toast(`Dépense non envoyée : ${error.message}`, 'error'); return }
    toast(depense ? 'Dépense corrigée' : 'Dépense envoyée au bureau')
    await onEnregistree()
  }

  const apercuUrl = fichier?.url ?? (fichier ? null : urlExistante)
  const nomPdf = fichier && !fichier.url ? fichier.file.name : (!fichier && depense && !estImage(depense.mime_type) ? depense.file_name : null)

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center bg-black/50" onClick={() => !envoi && onFermer()}>
      <div role="dialog" aria-modal="true" aria-label={depense ? 'Corriger la dépense' : 'Nouvelle dépense'}
        onClick={e => e.stopPropagation()}
        className="w-full md:max-w-[34rem] max-h-[95dvh] flex flex-col rounded-t-[var(--r-lg)] md:rounded-[var(--r-lg)]
          bg-[var(--bg-card)] border border-[var(--border)]">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <h2 className="flex-1 text-base font-semibold text-[var(--text)]">{depense ? 'Corriger la dépense' : 'Nouvelle dépense'}</h2>
          <button onClick={onFermer} disabled={envoi} aria-label="Fermer"
            className="w-11 h-11 inline-flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text)]">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-4">
          {/* 1. Justificatif : aperçu AVANT envoi, agrandir, reprendre. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--text)]">Justificatif {!depense && <span className="text-[var(--danger)]">*</span>}</span>
            {(apercuUrl || nomPdf) ? (
              <div className="flex items-center gap-3">
                {apercuUrl ? (
                  <button onClick={() => setEnGrand(true)} aria-label="Agrandir la photo"
                    className="w-24 h-24 shrink-0 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]">
                    <img src={apercuUrl} alt="Justificatif" className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <span className="w-24 h-24 shrink-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-elevated)] inline-flex items-center justify-center">
                    <FileText size={26} className="text-[var(--text-muted)]" />
                  </span>
                )}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  {nomPdf && <span className="text-xs text-[var(--text-muted)] truncate">{nomPdf}</span>}
                  {!depense && (
                    <button className={boutonSecondaireCls} onClick={reprise.ouvrir} disabled={envoi}>
                      <RotateCcw size={16} /> Reprendre
                    </button>
                  )}
                </div>
              </div>
            ) : depense ? null : (
              <ChoixPhoto onFichier={choisir} accept={ACCEPT} disabled={envoi} />
            )}
          </div>

          {/* 2. Payé avec quoi : deux gros choix. */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--text)]">Payé avec <span className="text-[var(--danger)]">*</span></span>
            <div className="grid grid-cols-2 gap-2">
              {(['carte_societe', 'personnel'] as const).map(m => {
                const on = form.moyen === m
                const Icone = m === 'carte_societe' ? CreditCard : Wallet
                return (
                  <button key={m} type="button" onClick={() => setForm(f => ({ ...f, moyen: m }))} aria-pressed={on}
                    className={`min-h-16 px-3 flex flex-col items-center justify-center gap-1 rounded-[var(--r-md)] border text-sm font-medium text-center ${
                      on ? 'border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]' : 'border-[var(--border)] text-[var(--text)]'}`}>
                    <Icone size={20} /> {LIBELLE_MOYEN[m]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Montant + date. */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text)]">Montant TTC (€) {form.moyen === 'personnel' && <span className="text-[var(--danger)]">*</span>}</span>
              <input className={`${champCls} tabular-nums`} inputMode="decimal" placeholder="12,50" value={form.montant}
                onChange={e => setForm(f => ({ ...f, montant: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text)]">Date</span>
              <input className={champCls} type="date" max={auj} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--text)]">Note <span className="text-[var(--danger)]">*</span></span>
            <input className={champCls} value={form.note} placeholder="Ex. : péage A35"
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </label>
        </div>

        <div className="px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-[var(--border)] flex flex-col gap-2">
          {manques.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">Il manque : {manques.join(' · ')}</p>
          )}
          <button className={`${boutonPrimaireCls} w-full`} disabled={manques.length > 0 || envoi} onClick={envoyer}>
            <Send size={18} /> {envoi ? 'Envoi…' : depense ? 'Enregistrer la correction' : 'Envoyer au bureau'}
          </button>
        </div>

        {reprise.input}
        {enGrand && apercuUrl && (
          <VisionneusePhoto src={apercuUrl} titre="Vérifie ton justificatif" onFermer={() => setEnGrand(false)}
            actions={depense ? [] : [
              { libelle: 'Reprendre', icone: RotateCcw, onClick: () => { setEnGrand(false); reprise.ouvrir() } },
              { libelle: 'Elle est bonne', ton: 'primaire', onClick: () => setEnGrand(false) },
            ]} />
        )}
      </div>
    </div>,
    document.body,
  )
}
