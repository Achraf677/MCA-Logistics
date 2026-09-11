import { MapPin, Flag, CircleAlert, Package, Route, Euro, CalendarDays, User, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ExtractedDelivery } from './AssistantContext'

/**
 * Recapitulatif de ce que l'IA a lu dans un message colle ou une feuille de
 * route.
 *
 * Remplace un bloc de texte « · Client : … / · Date : … » affiche dans une
 * bulle de chat. Retour du president : « faudra revoir la mise en forme du
 * recap qui n'est pas du tout detaille ». Le probleme n'etait pas le nombre
 * d'informations — elles etaient toutes la — mais le fait que tout avait la
 * meme taille, la meme couleur, et qu'on ne voyait pas ou finissait une
 * livraison et ou commencait la suivante.
 *
 * Ce qui change dans la lecture :
 *   - le CLIENT est le titre, parce que c'est par lui qu'on reconnait une
 *     course ;
 *   - le trajet est dessine de haut en bas, retrait puis livraison, comme sur
 *     un bon de transport ;
 *   - date, poids, distance et montant deviennent des etiquettes separees :
 *     l'oeil attrape un chiffre sans lire une phrase ;
 *   - ce que l'IA n'a PAS trouve est sorti du bloc et signale en orange. C'est
 *     l'information la plus utile du recap : c'est ce qu'il faudra completer a
 *     la main. Elle etait auparavant en derniere ligne d'un pave de texte.
 */
export function RecapExtraction({ deliveries }: { deliveries: ExtractedDelivery[] }) {
  const n = deliveries.length
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
        {n > 1 ? `${n} livraisons lues` : '1 livraison lue'}
      </p>
      {deliveries.map((d, i) => <CarteLivraisonLue key={i} d={d} index={i} total={n} />)}
    </div>
  )
}

function CarteLivraisonLue({ d, index, total }: { d: ExtractedDelivery; index: number; total: number }) {
  const manquants = (Array.isArray(d.missing) ? d.missing : []).filter(Boolean)

  return (
    <article className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-deep)] p-3 flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-[var(--text)] min-w-0 break-words">
          {d.client_name?.trim() || <span className="text-[var(--text-disabled)] italic">Client non identifié</span>}
        </span>
        {total > 1 && (
          <span className="shrink-0 text-[var(--fs-xs)] font-mono text-[var(--text-disabled)]">
            {index + 1}/{total}
          </span>
        )}
      </div>

      {(d.pickup_address || d.delivery_address) && (
        <div className="flex flex-col gap-1.5">
          <Etape icone={<MapPin size={13} />} label="Retrait"   valeur={d.pickup_address} />
          <Etape icone={<Flag size={13} />}   label="Livraison" valeur={d.delivery_address} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Puce icone={<CalendarDays size={12} />}
              texte={[dateCourte(d.date), d.heure].filter(Boolean).join(' · ')} />
        <Puce icone={<Package size={12} />} texte={d.weight_kg != null ? `${d.weight_kg} kg` : null} />
        <Puce icone={<Route size={12} />}   texte={d.km != null ? `${d.km} km` : null} />
        {/* Le montant est le seul chiffre qu'on relit vraiment : il porte la
            couleur de marque, les autres restent neutres. */}
        <Puce icone={<Euro size={12} />}
              texte={d.montant_ht_eur != null ? `${d.montant_ht_eur} € HT` : null}
              accent />
        <Puce icone={<User size={12} />}  texte={d.driver_name} />
        <Puce icone={<Truck size={12} />} texte={d.vehicle} />
      </div>

      {d.notes?.trim() && (
        <p className="text-[var(--fs-xs)] text-[var(--text-muted)] break-words">{d.notes.trim()}</p>
      )}

      {manquants.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-[var(--r-md)] bg-[var(--warning)]/10 px-2.5 py-1.5">
          <CircleAlert size={13} className="text-[var(--warning)] shrink-0 mt-0.5" />
          <span className="text-[var(--fs-xs)] text-[var(--text)]">
            À compléter à la main : {manquants.join(', ')}
          </span>
        </div>
      )}
    </article>
  )
}

function Etape({ icone, label, valeur }: { icone: ReactNode; label: string; valeur: string | null }) {
  if (!valeur?.trim()) return null
  return (
    <div className="flex items-start gap-2">
      <span className="text-[var(--text-disabled)] mt-0.5 shrink-0">{icone}</span>
      <span className="min-w-0">
        <span className="text-[var(--fs-xs)] text-[var(--text-disabled)] block leading-tight">{label}</span>
        <span className="text-[var(--fs-sm)] text-[var(--text)] break-words">{valeur.trim()}</span>
      </span>
    </div>
  )
}

/** Une etiquette. Rend `null` si la valeur est absente — une puce vide ne
 *  dirait rien, et `missing` signale deja ce qui n'a pas ete trouve. */
function Puce({ icone, texte, accent }: { icone: ReactNode; texte: string | null | undefined; accent?: boolean }) {
  if (!texte?.trim()) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--r-pill)] text-[var(--fs-xs)]
      border ${accent
        ? 'border-[var(--brand)]/40 bg-[var(--brand-soft)] text-[var(--text)] font-medium'
        : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]'}`}>
      {icone}{texte}
    </span>
  )
}

/**
 * Date courte, en francais. Une chaine illisible est rendue telle quelle
 * plutot que remplacee par « Invalid Date » : mieux vaut montrer ce que l'IA a
 * ecrit que d'afficher un mot anglais sans signification.
 */
function dateCourte(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
