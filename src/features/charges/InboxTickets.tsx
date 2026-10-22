import { useState, useEffect, useCallback, useMemo } from 'react'
import { Inbox, ExternalLink, Check, X, FilePlus2, CreditCard, Wallet, User } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'
import { formatMoney } from '../../shared/lib/money'
import { libelleCategorie, totalARembourser } from '../../shared/lib/depenses'
import {
  listerTicketsATraiter, classerTicket, urlTicket, refuserDepense,
  type TicketInbox,
} from '../../shared/lib/receiptsInbox.queries'
import { nomsDeclarants } from './charges.queries'
import { ticketsAffiches, jourFr } from './charges.logic'

/**
 * Justificatifs envoyés par les salariés et associés (tickets, dépenses), en attente.
 *
 * Trois issues, et pas une de plus : « Créer la charge » (le cas normal, qui
 * ouvre le formulaire pré-rempli et classe le ticket tout seul), « Traité »
 * quand la charge a déjà été saisie ailleurs, et « Refuser » (doublon, illisible,
 * hors activité) avec un motif que le déclarant lit dans son espace. Pas de
 * quatrième voie du genre « plus tard » : une file d'attente qui autorise à
 * repousser indéfiniment cesse d'être une file.
 *
 * Une dépense dit si elle a été payée avec la carte de la société ou de la poche du
 * déclarant (note de frais à lui rembourser) : affiché en évidence, filtrable.
 * Le panneau disparaît quand la boîte est vide — il n'a rien à dire dans ce cas.
 */
export function InboxTickets({ onChanged, onCreerCharge, rafraichir = 0 }: {
  onChanged?: () => void
  /** Ouvre le formulaire de charge pre-rempli a partir de ce ticket. */
  onCreerCharge?: (t: TicketInbox) => void
  /**
   * Incremente par le parent quand LUI a classe un ticket (creation d'une
   * charge depuis le formulaire). Sans ce signal, la ligne restait affichee
   * alors qu'elle etait deja traitee en base — et on pouvait en refaire une
   * seconde charge.
   */
  rafraichir?: number
}) {
  const { toast } = useToast()
  const [tickets, setTickets] = useState<TicketInbox[]>([])
  const [noms, setNoms] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [notesSeules, setNotesSeules] = useState(false)
  const [refusId, setRefusId] = useState<string | null>(null)
  const [motif, setMotif] = useState('')

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await listerTicketsATraiter()
    const liste = data ?? []
    setTickets(liste)
    setLoading(false)
    setNoms(await nomsDeclarants(liste.map(t => t.uploaded_by ?? '')))
  }, [])

  useEffect(() => { void charger() }, [charger, rafraichir])

  const affiches = useMemo(() => ticketsAffiches(tickets, notesSeules), [tickets, notesSeules])
  const nbNotes = useMemo(() => ticketsAffiches(tickets, true).length, [tickets])
  const aRembourser = useMemo(() => totalARembourser(tickets.map(t => ({
    moyen_paiement: t.moyen_paiement ?? null, montant_ttc_cts: t.montant_ttc_cts ?? null, statut: t.statut,
  }))), [tickets])

  const ouvrir = async (t: TicketInbox) => {
    const url = await urlTicket(t)
    if (!url) { toast('Fichier introuvable', 'error'); return }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const traiter = async (t: TicketInbox) => {
    setBusyId(t.id)
    const { error } = await classerTicket(t.id, 'traite')
    setBusyId(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Justificatif classé comme traité')
    await charger()
    onChanged?.()
  }

  const refuser = async (t: TicketInbox) => {
    if (motif.trim().length < 5) { toast('Motif du refus : 5 caractères minimum', 'error'); return }
    setBusyId(t.id)
    const { error } = await refuserDepense(t.id, motif.trim())
    setBusyId(null)
    if (error) { toast(`Refus non enregistré : ${error.message}`, 'error'); return }
    toast('Dépense refusée : le déclarant voit le motif')
    setRefusId(null); setMotif('')
    await charger()
    onChanged?.()
  }

  if (loading || tickets.length === 0) return null

  return (
    <div className="mb-6 glass rounded-[var(--r-xl)] px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Inbox size={16} className="text-[var(--brand)]" />
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Justificatifs reçus de l’équipe
        </span>
        <span className="px-2 py-0.5 rounded-[var(--r-pill)] border border-[var(--brand)]/35 bg-[var(--brand)]/15 text-[var(--brand)] text-xs font-semibold">
          {tickets.length}
        </span>
        <label className="ml-auto inline-flex items-center gap-2 text-sm text-[var(--text)] cursor-pointer">
          <input type="checkbox" checked={notesSeules} onChange={e => setNotesSeules(e.target.checked)} />
          Notes de frais à rembourser ({nbNotes})
        </label>
        {aRembourser > 0 && (
          <span className="text-sm font-semibold text-[var(--warning)]">{formatMoney(aRembourser)} à rembourser</span>
        )}
      </div>

      {affiches.length === 0 ? (
        <p className="py-3 text-sm text-[var(--text-muted)]">Aucune note de frais en attente.</p>
      ) : (
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {affiches.map(t => {
          const noteDeFrais = t.moyen_paiement === 'personnel'
          const carte = t.moyen_paiement === 'carte_societe'
          const date = jourFr(t.date_depense)
          return (
          <div key={t.id} className="py-2.5 flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              {noteDeFrais ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--warning)]/15 text-[var(--warning)] border border-[var(--warning)]/35 shrink-0">
                  <Wallet size={12} /> Note de frais
                </span>
              ) : carte ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[var(--info)]/15 text-[var(--info)] border border-[var(--info)]/35 shrink-0">
                  <CreditCard size={12} /> Carte société
                </span>
              ) : (
                <span className="text-xs text-[var(--text-disabled)] shrink-0">Paiement non précisé</span>
              )}

              <div className="flex-1 min-w-[12rem]">
                <p className="text-sm text-[var(--text)] truncate">
                  <span className="font-semibold">
                    {t.montant_ttc_cts != null ? formatMoney(t.montant_ttc_cts) : 'Montant non indiqué'}
                  </span>
                  {' · '}{libelleCategorie(t.categorie)}
                  {date && <> · {date}</>}
                  {t.note && <span className="text-[var(--text-muted)]"> · {t.note}</span>}
                </p>
                <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  <User size={11} />
                  {t.uploaded_by ? (noms[t.uploaded_by] ?? 'Déclarant inconnu') : 'Déclarant inconnu'}
                  {' · envoyé le '}{new Date(t.created_at).toLocaleString('fr-FR')}
                </p>
              </div>

              <button
                onClick={() => ouvrir(t)}
                className="inline-flex items-center gap-1 text-xs text-[var(--brand)] hover:underline min-h-[2.5rem] px-1"
              >
                <ExternalLink size={13} /> Voir
              </button>

              {/* Chemin principal : on ne relit pas le ticket pour retaper ce
                  qu'il contient, on ouvre directement la charge avec ce qu'on
                  sait deja. Le classement en « traite » et le rattachement du
                  justificatif se font tout seuls a l'enregistrement. */}
              {onCreerCharge && (
                <Button variant="primary" size="compact" onClick={() => onCreerCharge(t)} disabled={busyId === t.id}>
                  <FilePlus2 size={13} /> Créer la charge
                </Button>
              )}

              <Button variant="secondary" size="compact" onClick={() => traiter(t)} disabled={busyId === t.id}>
                <Check size={13} /> Traité
              </Button>

              <Button variant="ghost" size="compact" disabled={busyId === t.id} className="text-[var(--text-muted)]"
                onClick={() => { setRefusId(refusId === t.id ? null : t.id); setMotif('') }}>
                <X size={13} /> Refuser
              </Button>
            </div>

            {refusId === t.id && (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-2">
                <input className="field flex-1 min-w-[14rem]" autoFocus value={motif}
                  placeholder="Motif lu par le déclarant (ex. ticket illisible, dépense personnelle)"
                  onChange={e => setMotif(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void refuser(t) }} />
                <Button variant="primary" size="compact" disabled={busyId === t.id || motif.trim().length < 5}
                  onClick={() => void refuser(t)}>
                  Refuser la dépense
                </Button>
                <Button variant="secondary" size="compact" onClick={() => setRefusId(null)}>Annuler</Button>
              </div>
            )}
          </div>
          )
        })}
      </div>
      )}
    </div>
  )
}
