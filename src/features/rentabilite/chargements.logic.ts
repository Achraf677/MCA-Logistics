// Coût de revient par CHARGEMENT — pur (sans DB ni DOM), testable.
//
// L'unité n'est ni la course ni la tournée, mais « un véhicule, un jour ».
//
// Pourquoi pas la course : le carburant s'achète au plein, pas au colis.
// Découper un plein entre huit courses oblige à inventer une clé de
// répartition, et une clé inventée donne des chiffres précis mais faux.
//
// Pourquoi pas la tournée seule : une tournée n'existe en base que si le
// bureau en a composé une. Sur 33 courses, 6 seulement en ont une —
// raisonner par tournée ne couvrirait qu'un cinquième de l'activité et
// laisserait le reste sans coût. La journée d'un véhicule couvre tout, et
// quand il n'y a qu'une course dans la journée, on obtient le coût de cette
// course sans rien calculer de plus.

// ── Formes minimales des données brutes ───────────────────────────────────────

export interface CoursePourCout {
  date: string | null
  vehicle_id: string | null
  tour_id: string | null
  amount_ht_cts: number | null
  /** Kilomètres en charge. */
  km: number | null
  /** Kilomètres à vide (retour, approche). */
  empty_km: number | null
}

export interface PleinPourCout { total_cts: number | null }
export interface EntretienPourCout { cost_cts: number | null }

/**
 * Kilomètres d'une course : en charge ET à vide.
 *
 * Les kilomètres à vide brûlent exactement le même carburant que les autres.
 * Les exclure ferait apparaître des marges plus belles qu'elles ne sont —
 * précisément sur les courses les plus coûteuses, celles où l'on rentre vide.
 */
export function kmCourse(c: Pick<CoursePourCout, 'km' | 'empty_km'>): number {
  return (c.km ?? 0) + (c.empty_km ?? 0)
}

// ── Taux au kilomètre, MESURÉS ────────────────────────────────────────────────

export interface TauxAuKm {
  carburantCtsParKm: number
  entretienCtsParKm: number
  /** Kilomètres qui ont servi à mesurer ces taux. */
  kmMesures: number
  /**
   * Y a-t-il assez de matière pour que ces taux veuillent dire quelque chose ?
   *
   * En dessous du seuil, on les calcule quand même (l'ordre de grandeur reste
   * utile) mais l'écran doit le dire : un taux tiré de 40 km et d'un seul
   * plein n'est pas une mesure, c'est un hasard.
   */
  fiable: boolean
}

/** En dessous, le taux au km est du bruit. Deux pleins et 500 km, c'est un minimum. */
export const KM_MINIMUM_FIABLE = 500
export const PLEINS_MINIMUM_FIABLE = 2

/**
 * Combien coûte un kilomètre, d'après ce qui a RÉELLEMENT été dépensé.
 *
 * Dépenses de la période ÷ kilomètres de la période. Rien n'est estimé, rien
 * n'est paramétré : si les pleins disent 2 066 € pour 11 184 km, le kilomètre
 * coûte 18,5 centimes, et pas les 15 centimes d'une constante écrite un jour
 * dans le code.
 *
 * Kilomètres à zéro → taux à zéro, jamais une division par zéro ni un nombre
 * inventé. Une marge sans coût est au moins visiblement incomplète ; une marge
 * avec un coût imaginaire ne se voit pas.
 */
export function tauxAuKm(
  courses: CoursePourCout[],
  pleins: PleinPourCout[],
  entretiens: EntretienPourCout[],
): TauxAuKm {
  const kmMesures = courses.reduce((s, c) => s + kmCourse(c), 0)
  const carburantCts = pleins.reduce((s, p) => s + (p.total_cts ?? 0), 0)
  const entretienCts = entretiens.reduce((s, e) => s + (e.cost_cts ?? 0), 0)

  if (kmMesures <= 0) {
    return { carburantCtsParKm: 0, entretienCtsParKm: 0, kmMesures: 0, fiable: false }
  }

  return {
    carburantCtsParKm: carburantCts / kmMesures,
    entretienCtsParKm: entretienCts / kmMesures,
    kmMesures,
    fiable: kmMesures >= KM_MINIMUM_FIABLE && pleins.length >= PLEINS_MINIMUM_FIABLE,
  }
}

// ── Une journée de camion ─────────────────────────────────────────────────────

export interface LigneChargement {
  /** `date|vehicle_id` — stable, sert de clé React. */
  cle: string
  date: string
  vehicleId: string | null
  vehicule: string
  nbCourses: number
  /** La journée s'appuie-t-elle sur une tournée composée au bureau ? */
  enTournee: boolean
  km: number
  recettesHtCts: number
  carburantCts: number
  entretienCts: number
  /**
   * Recettes MOINS les coûts directs. Ni le leasing, ni l'assurance, ni le
   * salaire : les répartir demanderait une clé que personne ne peut justifier,
   * et un chiffre faux est pire qu'un chiffre absent. D'où le nom.
   */
  margeCts: number
  /** Marge par kilomètre, `null` quand la journée n'a aucun kilomètre saisi. */
  margeParKmCts: number | null
}

/**
 * Regroupe les courses par (jour, véhicule) et chiffre chaque chargement.
 *
 * Les coûts sont appliqués AU KILOMÈTRE. C'est le seul rattachement honnête :
 * un plein fait le mardi alimente aussi le mercredi, et les kilomètres, eux,
 * sont attribués à la course qui les a parcourus.
 *
 * Une précision que l'écran doit reprendre : la somme des kilomètres d'une
 * journée peut dépasser ce qu'un camion parcourt en vingt-quatre heures — une
 * course longue distance porte tous ses kilomètres à sa date de départ. La
 * ligne chiffre donc « ce que coûtent les courses datées de ce jour », pas
 * « ce qui a été brûlé ce jour-là ». Répartir au kilomètre rend le calcul
 * insensible à ce décalage.
 *
 * Trié du plus récent au plus ancien, puis par véhicule.
 */
export function chargements(
  courses: CoursePourCout[],
  taux: TauxAuKm,
  nomVehicule: (id: string | null) => string,
): LigneChargement[] {
  const par = new Map<string, LigneChargement>()

  for (const c of courses) {
    if (!c.date) continue
    const jour = c.date.slice(0, 10)
    const cle = `${jour}|${c.vehicle_id ?? '__sans__'}`

    const ligne = par.get(cle) ?? {
      cle, date: jour, vehicleId: c.vehicle_id,
      vehicule: nomVehicule(c.vehicle_id),
      nbCourses: 0, enTournee: false, km: 0,
      recettesHtCts: 0, carburantCts: 0, entretienCts: 0,
      margeCts: 0, margeParKmCts: null,
    }

    ligne.nbCourses += 1
    ligne.km += kmCourse(c)
    ligne.recettesHtCts += c.amount_ht_cts ?? 0
    if (c.tour_id) ligne.enTournee = true
    par.set(cle, ligne)
  }

  return [...par.values()]
    .map(l => {
      const carburantCts = Math.round(l.km * taux.carburantCtsParKm)
      const entretienCts = Math.round(l.km * taux.entretienCtsParKm)
      const margeCts = l.recettesHtCts - carburantCts - entretienCts
      return {
        ...l,
        carburantCts, entretienCts, margeCts,
        margeParKmCts: l.km > 0 ? margeCts / l.km : null,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.vehicule.localeCompare(b.vehicule, 'fr'))
}

/** Totaux de la période, champ par champ. */
export function totauxChargements(lignes: LigneChargement[]) {
  return lignes.reduce(
    (acc, l) => ({
      nbChargements: acc.nbChargements + 1,
      nbCourses: acc.nbCourses + l.nbCourses,
      km: acc.km + l.km,
      recettesHtCts: acc.recettesHtCts + l.recettesHtCts,
      carburantCts: acc.carburantCts + l.carburantCts,
      entretienCts: acc.entretienCts + l.entretienCts,
      margeCts: acc.margeCts + l.margeCts,
    }),
    { nbChargements: 0, nbCourses: 0, km: 0, recettesHtCts: 0, carburantCts: 0, entretienCts: 0, margeCts: 0 },
  )
}
