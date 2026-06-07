// Cerveau PROVISOIRE de l'assistant — aide à l'usage par mots-clés.
// Aucune dépendance réseau / IA. Les réponses sont dérivées de docs/site-map.md
// (mode d'emploi par onglet). À remplacer par un vrai appel IA à l'étape suivante.

export interface HelpIntent {
  /** Mots-clés (sans accents, en minuscules) qui déclenchent la réponse. */
  keywords: string[]
  /** Onglet concerné (pour l'entête de la réponse). */
  tab: string
  /** Réponse d'aide à l'usage. */
  answer: string
}

/** Normalise une saisie : minuscules, sans accents, espaces compactés. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Ordre = priorité : la première intention qui matche gagne.
export const HELP_INTENTS: HelpIntent[] = [
  {
    keywords: ['ajouter un vehicule', 'nouveau vehicule', 'vehicule', 'crit', 'ptac', 'echeance vehicule'],
    tab: 'Véhicules',
    answer: 'Onglet **Véhicules** (Flotte). Clique « Nouveau » pour ajouter un véhicule (immatriculation, PTAC ≤ 3,5 t, échéances CT/assurance/révision), ou clique une carte pour l’éditer. Le statut se change via les boutons en haut du drawer.',
  },
  {
    keywords: ['facturer', 'creer une livraison', 'nouvelle livraison', 'livraison', 'course', 'statut livraison'],
    tab: 'Livraisons',
    answer: 'Onglet **Livraisons** (Opérations). « Nouvelle livraison » → onglet Détail puis Montant. Le cycle de vie se pilote dans l’onglet Suivi (Démarrer, Marquer livrée, Facturer, Encaisser, Annuler). Seul le président peut supprimer une course non facturée.',
  },
  {
    keywords: ['optimiser', 'repartir', 'tournee', 'dispatch', 'itineraire', 'gps'],
    tab: 'Tournées',
    answer: 'Onglet **Tournées** (Opérations). Choisis la date, coche les véhicules + leur chauffeur, coche les livraisons géocodées, puis « Répartir & optimiser ». Sur le terrain : « Naviguer »/« Waze », « Livré », et « Démarrer »/« Terminer » la tournée.',
  },
  {
    keywords: ['client', 'encours', 'tarif', 'siret'],
    tab: 'Clients',
    answer: 'Onglet **Clients** (Tiers). « Nouveau » pour créer (nom requis, SIRET sur 14 chiffres, tarif requis si mode ≠ manuel). Clique une ligne pour éditer, voir l’historique ou l’encours. Suppression réservée au président ; « Désactiver » pour tous.',
  },
  {
    keywords: ['fournisseur', 'siren', 'doublon'],
    tab: 'Fournisseurs',
    answer: 'Onglet **Fournisseurs** (Tiers). « Nouveau » (nom requis). Si le SIREN existe déjà, un avertissement anti-doublon s’affiche et une confirmation est demandée avant d’enregistrer.',
  },
  {
    keywords: ['incident', 'accident', 'panne', 'sinistre'],
    tab: 'Incidents',
    answer: 'Onglet **Incidents** (Opérations). « Nouveau » pour signaler un incident (type, dommages estimés, statut). Le président peut le supprimer depuis le drawer.',
  },
  {
    keywords: ['inspection', 'checklist', 'controle vehicule'],
    tab: 'Inspections',
    answer: 'Onglet **Inspections** (Opérations). « Nouveau », choisis véhicule + type, bascule les points de contrôle défectueux (le statut Conforme/Défauts se calcule seul), détaille les défauts, puis Enregistrer.',
  },
  {
    keywords: ['carburant', 'plein', 'gasoil', 'litre'],
    tab: 'Carburant',
    answer: 'Onglet **Carburant** (Flotte). « Nouveau » pour saisir un plein : litres × prix/L remplissent le total automatiquement. « Export » télécharge le CSV filtré.',
  },
  {
    keywords: ['entretien', 'maintenance', 'revision', 'vidange'],
    tab: 'Entretiens',
    answer: 'Onglet **Entretiens** (Flotte). « Nouveau », choisis véhicule + type d’intervention, saisis le coût et éventuellement la prochaine échéance (date/km).',
  },
  {
    keywords: ['charge', 'depense', 'facture fournisseur'],
    tab: 'Charges',
    answer: 'Onglet **Charges** (Finance). « Nouvelle charge » (libellé, date, montant HT > 0) ; le TTC se calcule selon le taux de TVA. Filtres par dates/catégorie + export CSV.',
  },
  {
    keywords: ['paiement', 'encaissement', 'reglement', 'encaisser'],
    tab: 'Encaissement',
    answer: 'Onglet **Encaissement** (Finance). « Saisir un paiement » → choisis le client (requis) et éventuellement la livraison facturée à solder (le montant se pré-remplit), puis le mode et la référence.',
  },
  {
    keywords: ['tva', 'declaration'],
    tab: 'TVA',
    answer: 'Onglet **TVA** (Finance). Choisis le mode (Trimestre/Mois) et la période ; la TVA collectée, déductible et le solde net se calculent automatiquement (sur livraisons Facturées/Payées). Lecture seule.',
  },
  {
    keywords: ['tresorerie', 'qonto', 'solde', 'banque'],
    tab: 'Trésorerie',
    answer: 'Onglet **Trésorerie** (Finance). « Synchroniser Qonto » rafraîchit le solde et les transactions, puis « Vérifier les paiements » rapproche les livraisons encaissées et les marque payées.',
  },
  {
    keywords: ['equipe', 'membre', 'salaire', 'chauffeur', 'validite', 'permis'],
    tab: 'Équipe',
    answer: 'Onglet **Équipe**. « Nouveau » pour ajouter un membre (identité, contrat, salaire). Pour un chauffeur, l’onglet « Validités » (permis B, visite médicale) calcule l’aptitude.',
  },
  {
    keywords: ['heure', 'pointage', 'temps de travail'],
    tab: 'Heures',
    answer: 'Onglet **Heures** (Équipe). « Nouveau » pour saisir une journée (chauffeur, horaires, pause, livraison optionnelle) ; le total net s’affiche en aperçu.',
  },
  {
    keywords: ['alerte', 'briefing', 'echeance'],
    tab: 'Alertes',
    answer: 'Onglet **Alertes** (Système). Les alertes actives s’affichent automatiquement ; filtre par sévérité/catégorie/recherche, « Voir → » ouvre l’onglet concerné. « Briefing du jour » génère une synthèse IA priorisée.',
  },
  {
    keywords: ['brouillon', 'mail', 'email', 'relance', 'annonce', 'redaction'],
    tab: 'Brouillons IA',
    answer: 'Onglet **Brouillons IA** (Système). Choisis un type (Relance/Email/Annonce/Libre), décris ta demande, « Générer », puis « Copier ». Rien n’est enregistré (ne mets pas de données sensibles).',
  },
  {
    keywords: ['copilote', 'feuille de route', 'extraction', 'ocr', 'scanner'],
    tab: 'Copilote IA',
    answer: 'Onglet **Copilote IA** (Système). Importe une image/PDF ou colle le texte d’une feuille de route, « Analyser » : l’IA propose des livraisons en tableau éditable. Vérifie, coche les lignes, puis « Créer les livraisons cochées ».',
  },
  {
    keywords: ['parametre', 'societe', 'depot', 'iban', 'adresse depot'],
    tab: 'Paramètres',
    answer: 'Onglet **Paramètres** (Système). Édite la fiche société (identité, IBAN…) puis « Enregistrer ». Sélectionne une adresse dans l’autocomplétion pour géocoder le dépôt (utile aux tournées).',
  },
  {
    keywords: ['planning', 'semaine'],
    tab: 'Planning',
    answer: 'Onglet **Planning** (Opérations). Vue hebdomadaire des livraisons. Navigue de semaine en semaine ; clique une carte pour éditer, « + Nouvelle livraison » pour en créer une.',
  },
  {
    keywords: ['calendrier', 'mois'],
    tab: 'Calendrier',
    answer: 'Onglet **Calendrier** (Opérations). Vue mensuelle des livraisons. Navigue de mois en mois ; clique une vignette pour ouvrir/éditer la livraison.',
  },
  {
    keywords: ['rentabilite', 'resultat', 'marge'],
    tab: 'Rentabilité',
    answer: 'Onglet **Rentabilité** (Pilotage). Choisis une année : CA, charges, carburant, entretiens et résultat brut s’affichent mois par mois. Lecture seule.',
  },
  {
    keywords: ['statistique', 'top client', 'analyse'],
    tab: 'Statistiques',
    answer: 'Onglet **Statistiques** (Pilotage). Tendances de l’année en cours : CA mensuel, Top 5 clients, charges par catégorie. Lecture seule.',
  },
  {
    keywords: ['dashboard', 'accueil', 'tableau de bord'],
    tab: 'Dashboard',
    answer: 'Onglet **Dashboard** (Pilotage). Vue d’accueil : KPIs du mois, référentiels actifs, tendance CA sur 6 mois et dernières livraisons.',
  },
]

/** Message d'accueil affiché à l'ouverture du panneau. */
export const GREETING =
  'Bonjour 👋 Je suis l’assistant MCA (version provisoire, sans IA pour l’instant). '
  + 'Pose-moi une question d’usage — ex. « comment ajouter un véhicule », « optimiser une tournée », « faire une relance ».'

/** Réponse provisoire quand aucune intention ne matche. */
export const FALLBACK =
  'Je ne sais pas encore répondre à ça précisément — je serai bientôt connecté à l’IA. '
  + 'En attendant, essaie un mot-clé : véhicule, livraison, tournée, client, facture, TVA, alertes, brouillon…'

/**
 * Routeur d'aide provisoire : renvoie la première intention dont un mot-clé
 * est contenu dans la question normalisée, sinon le message de repli.
 */
export function routeHelp(query: string): string {
  const q = normalize(query)
  if (!q) return FALLBACK
  for (const intent of HELP_INTENTS) {
    if (intent.keywords.some(k => q.includes(k))) return intent.answer
  }
  return FALLBACK
}
