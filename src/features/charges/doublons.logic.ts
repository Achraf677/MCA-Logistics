/**
 * Garde-fou anti-doublon Pennylane.
 *
 * Regle metier posee par le president : « Je veux un garde-fou qui me dise
 * qu'il existe deja sur Pennylane. On garde Pennylane en priorite. »
 *
 * Comment on sait ce qui existe sur Pennylane SANS appeler Pennylane :
 * l'Edge Function `pennylane-sync` recopie deja les factures fournisseur de
 * Pennylane dans la table `charges`, en leur posant un `pennylane_id`. La
 * table locale EST donc le miroir de Pennylane. On compare a ce miroir.
 *
 * Limite assumee, et elle doit etre dite a l'ecran : une facture saisie sur
 * Pennylane il y a dix minutes et pas encore synchronisee ne sera pas vue.
 * Le garde-fou reduit les doublons, il ne les rend pas impossibles.
 *
 * Ce module est PUR : aucune base, aucun DOM. Il recoit la charge en cours de
 * saisie et la liste des charges deja connues, il rend les suspects.
 */

/** La charge en cours de saisie, reduite a ce qui sert a comparer. */
export interface CandidatCharge {
  /** Rempli en edition : on ne se compare jamais a soi-meme. */
  id?: string | null
  date: string                      // 'AAAA-MM-JJ'
  montant_ttc_cts: number
  supplier_id: string | null
}

/** Une charge deja en base, reduite de la meme facon. */
export interface ChargeConnue {
  id: string
  date: string
  montant_ttc_cts: number | null
  supplier_id: string | null
  label: string
  pennylane_id: string | null
}

export type NiveauDoublon = 'certain' | 'probable'

export interface Doublon {
  charge: ChargeConnue
  niveau: NiveauDoublon
  /** Phrase prete a afficher, qui dit POURQUOI c'est suspect. */
  raison: string
}

/** Ecart de jours entre deux dates 'AAAA-MM-JJ', en UTC pour ignorer l'heure d'ete. */
export function ecartJours(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(ms)) return Number.POSITIVE_INFINITY
  return Math.abs(Math.round(ms / 86_400_000))
}

/** Fenetre de tolerance sur la date, en jours. Une meme facture peut etre
 *  datee du jour de l'achat ici et du jour de reception chez Pennylane. */
const FENETRE_JOURS = 7

/**
 * Suspects pour une charge en cours de saisie.
 *
 * Le montant TTC doit etre EXACTEMENT identique — c'est le seul critere qui
 * ne ment pas. Un montant approchant (arrondi de TVA) n'est pas retenu : une
 * alerte qui se declenche a tort finit par etre cliquee sans etre lue, et le
 * garde-fou ne sert plus a rien.
 *
 * Deux niveaux :
 *   - `certain`  : meme montant TTC, meme fournisseur, dans la fenetre ;
 *   - `probable` : meme montant TTC dans la fenetre, fournisseur different ou
 *                  absent (tres frequent : la charge locale n'a pas encore de
 *                  fournisseur rattache).
 *
 * Les charges qui ne viennent PAS de Pennylane sont ignorees : le but est de
 * prevenir la double saisie d'une facture deja chez le comptable, pas de
 * policer les saisies locales.
 */
export function trouverDoublonsPennylane(
  candidat: CandidatCharge,
  connues: ChargeConnue[],
): Doublon[] {
  if (!candidat.montant_ttc_cts || candidat.montant_ttc_cts <= 0) return []

  const suspects: Doublon[] = []

  for (const c of connues) {
    if (!c.pennylane_id) continue                    // pas une facture Pennylane
    if (candidat.id && c.id === candidat.id) continue // soi-meme, en edition
    if (c.montant_ttc_cts !== candidat.montant_ttc_cts) continue

    const ecart = ecartJours(candidat.date, c.date)
    if (ecart > FENETRE_JOURS) continue

    const memeFournisseur =
      candidat.supplier_id != null && c.supplier_id === candidat.supplier_id

    suspects.push({
      charge: c,
      niveau: memeFournisseur ? 'certain' : 'probable',
      raison: memeFournisseur
        ? (ecart === 0
            ? 'Même fournisseur, même montant, même date.'
            : `Même fournisseur, même montant, à ${ecart} jour${ecart > 1 ? 's' : ''} d'écart.`)
        : (ecart === 0
            ? 'Même montant, même date.'
            : `Même montant, à ${ecart} jour${ecart > 1 ? 's' : ''} d'écart.`),
    })
  }

  // Les plus surs d'abord, puis les plus proches en date : ce que l'oeil doit
  // lire en premier doit etre en haut.
  return suspects.sort((a, b) => {
    if (a.niveau !== b.niveau) return a.niveau === 'certain' ? -1 : 1
    return ecartJours(candidat.date, a.charge.date) - ecartJours(candidat.date, b.charge.date)
  })
}
