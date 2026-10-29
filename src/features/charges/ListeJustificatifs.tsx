import { ChevronRight, FileText } from 'lucide-react'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Badge } from '../../shared/ui/Badge'
import { formatMoney } from '../../shared/lib/money'
import { libelleCategorie } from '../../shared/lib/depenses'
import { libelleCarte } from '../../shared/lib/cartesBancaires'
import { useCartes } from '../../shared/lib/useCartesBancaires'
import type { TicketInbox } from '../../shared/lib/receiptsInbox.queries'
import { Paiement } from './FicheJustificatif'
import { etatJustificatif, jourJustif, manquePourValider, type GroupeJustif } from './justificatifs.logic'

const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Colonnes affichées : elles changent avec la section (en Notes de frais, le titre du groupe dit déjà qui et comment). */
export type ModeListe = 'ndf' | 'cb' | 'carburant' | 'mixte'
type Col = 'declarant' | 'paiement' | 'carte' | 'vehicule' | 'date' | 'montant' | 'etat'

const COLONNES: Record<ModeListe, Col[]> = {
  ndf: ['date', 'montant', 'etat'],
  cb: ['declarant', 'carte', 'date', 'montant', 'etat'],
  carburant: ['declarant', 'vehicule', 'carte', 'date', 'montant', 'etat'],
  mixte: ['declarant', 'paiement', 'date', 'montant', 'etat'],
}

const ENTETE: Record<Col, string> = {
  declarant: 'Déclarant', paiement: 'Paiement', carte: 'Carte', vehicule: 'Véhicule', date: 'Date', montant: 'Montant TTC', etat: '',
}

/** Miniature du ticket (photo) ; pictogramme pour un PDF ou tant que le lien n'est pas arrivé. */
function Miniature({ t, url }: { t: TicketInbox; url: string | undefined }) {
  return (
    <span className="h-11 w-11 shrink-0 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg-deep)] overflow-hidden flex items-center justify-center text-[var(--text-disabled)]">
      {url && t.mime_type?.startsWith('image/')
        ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <FileText size={18} />}
    </span>
  )
}

const Montant = ({ t }: { t: TicketInbox }) => (
  t.montant_ttc_cts != null ? <>{formatMoney(t.montant_ttc_cts)}</> : <span className="font-sans font-medium text-[var(--danger)]">À saisir</span>
)

/** « Prêt à valider » ou ce qui manque : remplace la colonne « Statut » (qui disait « À traiter » sur 100 % des lignes). */
function Manque({ t }: { t: TicketInbox }) {
  const m = manquePourValider(t)
  return m.length === 0
    ? <span className="text-xs text-[var(--success)] whitespace-nowrap">Prêt à valider</span>
    : <span className="text-xs text-[var(--warning)]" title={`Il manque : ${m.join(', ').toLowerCase()}`}>{m.join(' · ')}</span>
}

/** Statut des autres onglets + repère d'envoi à Pennylane pour un justificatif validé. */
function Statut({ t }: { t: TicketInbox }) {
  const etat = etatJustificatif(t)
  const envoye = t.statut === 'traite' && t.moyen_paiement !== 'carte_carburant' && t.pennylane_envoye_le
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge color={etat.ton}>{etat.libelle}</Badge>
      {envoye && <span className="text-[0.6875rem] text-[var(--text-muted)] whitespace-nowrap">Pennylane · {jourCourt(t.pennylane_envoye_le!.slice(0, 10))}</span>}
    </span>
  )
}

/**
 * Liste de justificatifs : tableau sur PC (colonnes selon `mode`), cartes sur mobile.
 * `aTraiter` = onglet « À traiter » (dernière colonne = ce qui manque) ; sinon le statut.
 * `groupes` = notes de frais : une ligne de titre par salarié DANS le même tableau (un seul en-tête).
 */
export function ListeJustificatifs({ lignes, groupes, mode, aTraiter, miniatures, nomDe, vehicules, onOuvrir }: {
  lignes: TicketInbox[]
  groupes?: Array<GroupeJustif<TicketInbox>>
  mode: ModeListe
  aTraiter: boolean
  miniatures: Record<string, string>
  nomDe: (t: TicketInbox) => string
  vehicules: Array<{ id: string; label: string }>
  onOuvrir: (id: string) => void
}) {
  const cartes = useCartes()
  const cols = COLONNES[mode]
  const nbCols = cols.length + 2
  const vehicule = (t: TicketInbox) => (t.vehicle_id ? (vehicules.find(v => v.id === t.vehicle_id)?.label ?? 'Véhicule supprimé') : null)

  const cellule = (c: Col, t: TicketInbox) => {
    switch (c) {
      case 'declarant': return (
        <td key={c} className="px-2 py-2.5 whitespace-nowrap max-w-[14rem]">
          <span className="inline-flex items-center gap-2 text-[var(--text)] max-w-full">
            <AvatarInitiales nom={nomDe(t)} taille="sm" /><span className="truncate">{nomDe(t)}</span>
          </span>
        </td>)
      case 'paiement': return <td key={c} className="px-2 py-2.5 whitespace-nowrap"><Paiement moyen={t.moyen_paiement} carte={t.carte} /></td>
      case 'carte': return (
        <td key={c} className="px-2 py-2.5 whitespace-nowrap font-mono text-xs">
          {t.carte ? libelleCarte(t.carte, cartes) : <span className="font-sans text-[var(--warning)]">Carte ?</span>}
        </td>)
      case 'vehicule': return (
        <td key={c} className="px-2 py-2.5 whitespace-nowrap">
          {vehicule(t) ?? <span className="text-[var(--warning)]">Véhicule ?</span>}
        </td>)
      case 'date': return <td key={c} className="px-2 py-2.5 font-mono text-xs text-[var(--text-muted)] whitespace-nowrap">{jourCourt(jourJustif(t))}</td>
      case 'montant': return (
        <td key={c} className="px-2 py-2.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap"><Montant t={t} /></td>)
      case 'etat': return <td key={c} className="px-2 py-2.5">{aTraiter ? <Manque t={t} /> : <Statut t={t} />}</td>
    }
  }

  const ligne = (t: TicketInbox) => (
    <tr key={t.id} onClick={() => onOuvrir(t.id)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') onOuvrir(t.id) }}
      className="group border-b border-[var(--border)] last:border-0 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors">
      <td className="pl-4 pr-2 py-2.5 max-w-[22rem]">
        <span className="flex items-center gap-3 min-w-0">
          <Miniature t={t} url={miniatures[t.storage_path]} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-[var(--text)]">{t.note || t.file_name}</span>
            <span className="block truncate text-xs text-[var(--text-muted)]">{t.categorie ? libelleCategorie(t.categorie) : 'Catégorie non précisée'}</span>
          </span>
        </span>
      </td>
      {cols.map(c => cellule(c, t))}
      <td className="pr-3 text-[var(--text-disabled)] group-hover:text-[var(--text-muted)]"><ChevronRight size={16} /></td>
    </tr>
  )

  const resume = (g: GroupeJustif<TicketInbox>) => (
    <>
      <span>{g.rows.length} note{g.rows.length > 1 ? 's' : ''}</span>
      {!(g.totalCts === 0 && g.sansMontant > 0) && <span className="font-mono font-semibold text-[var(--text)]">{formatMoney(g.totalCts)}</span>}
      {g.sansMontant > 0 && <span className="text-[var(--warning)] hidden sm:inline">{g.totalCts === 0 ? '' : '+ '}{g.sansMontant} sans montant</span>}
    </>
  )

  const carteMobile = (t: TicketInbox) => (
    <li key={t.id}>
      <button type="button" onClick={() => onOuvrir(t.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-card-hover)]">
        <Miniature t={t} url={miniatures[t.storage_path]} />
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="flex items-start gap-2">
            <span className="flex-1 min-w-0 truncate font-medium text-[var(--text)]">{t.note || t.file_name}</span>
            <span className="font-mono font-semibold tabular-nums text-[var(--text)] shrink-0"><Montant t={t} /></span>
          </span>
          <span className="text-xs text-[var(--text-muted)] truncate">
            {mode !== 'ndf' && <>{nomDe(t)} · </>}{jourCourt(jourJustif(t))}
            {t.carte && <> · {libelleCarte(t.carte, cartes)}</>}{mode === 'carburant' && <> · {vehicule(t) ?? 'véhicule ?'}</>}
          </span>
          <span>{aTraiter ? <Manque t={t} /> : <Statut t={t} />}</span>
        </span>
      </button>
    </li>
  )

  return (
    <>
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
            <th className="pl-4 pr-2 py-2.5 font-medium">Justificatif</th>
            {cols.map(c => (
              <th key={c} className={`px-2 py-2.5 font-medium ${c === 'montant' ? 'text-right' : ''}`}>
                {c === 'etat' ? (aTraiter ? 'Pour valider' : 'Statut') : ENTETE[c]}
              </th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {groupes
            ? groupes.map(g => (
              <FragmentGroupe key={g.cle} nbCols={nbCols} nom={g.libelle} resume={resume(g)}>
                {g.rows.map(ligne)}
              </FragmentGroupe>))
            : lignes.map(ligne)}
        </tbody>
      </table>

      <ul className="md:hidden divide-y divide-[var(--border)]">
        {groupes
          ? groupes.map(g => (
            <li key={g.cle}>
              <div className="px-4 py-2 flex items-center gap-2 bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
                <AvatarInitiales nom={g.libelle} taille="sm" />
                <span className="font-semibold text-[var(--text)] truncate min-w-0 flex-1">{g.libelle}</span>
                <span className="shrink-0 flex items-center gap-2">{resume(g)}</span>
              </div>
              <ul className="divide-y divide-[var(--border)]">{g.rows.map(carteMobile)}</ul>
            </li>))
          : lignes.map(carteMobile)}
      </ul>
    </>
  )
}

/** Titre d'un groupe (un salarié) dans le tableau : une ligne qui court sur toutes les colonnes. */
function FragmentGroupe({ nbCols, nom, resume, children }: { nbCols: number; nom: string; resume: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <td colSpan={nbCols} className="px-4 py-2">
          <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <AvatarInitiales nom={nom} taille="sm" />
            <span className="font-semibold text-sm text-[var(--text)] truncate">{nom}</span>
            <span className="ml-auto flex items-center gap-3 tabular-nums">{resume}</span>
          </span>
        </td>
      </tr>
      {children}
    </>
  )
}
