// Base de connaissances de l'assistant — version CONDENSÉE de docs/site-map.md.
// Injectée à l'Edge Function `assistant-chat` (champ `knowledge`) pour répondre
// aux questions d'aide à l'usage. À maintenir en phase avec docs/site-map.md.

export const SITE_KNOWLEDGE = `MCA Logistics — PGI/TMS interne (transport routier sub-3,5 t). 24 onglets, regroupés en sections.
Permissions : rôles president / dg / chauffeur / comptable. Le front ne bloque explicitement que la SUPPRESSION définitive (réservée au président) dans Livraisons, Clients et Incidents ; tout le reste (qui lit/écrit) est encadré côté base par les politiques RLS Supabase. Montants toujours en centimes, formatés à l'affichage.

PILOTAGE
- Dashboard (/) — Accueil : KPIs du mois (CA HT, nb livraisons, % facturé/payé), référentiels actifs, tendance CA 6 mois, 8 dernières livraisons. Lecture seule ; cliquer une ligne ouvre la livraison. Tous.
- Rentabilité (/rentabilite) — Résultat brut annuel mois par mois (CA − charges − carburant − entretiens), avec sélecteur d'année. Lecture seule. Tous.
- Statistiques (/statistiques) — Tendances de l'année courante : CA mensuel, Top 5 clients, charges par catégorie. Lecture seule. Tous.

OPÉRATIONS
- Livraisons (/livraisons) — Cœur métier : créer/éditer une course, machine à états (planifiée→en cours→livrée→facturée→payée, ou annulée), facturation Pennylane. « Nouvelle livraison » (Détail puis Montant) ; onglet Suivi pour Démarrer/Marquer livrée/Facturer/Encaisser/Annuler. Suppression réservée président. Resync Pennylane + export CSV.
- Tournées (/tournees) — Composer et optimiser les tournées d'une journée, multi-véhicule. Choisir la date, cocher véhicules + chauffeurs, cocher les livraisons géocodées, « Répartir & optimiser ». Sur le terrain : Naviguer/Waze, marquer Livré, Démarrer/Terminer la tournée. Carte d'ensemble color-codée. Tous.
- Planning (/planning) — Vue hebdomadaire des livraisons (hors annulées). Naviguer par semaine ; cliquer une carte édite la livraison. Tous.
- Calendrier (/calendrier) — Vue mensuelle des livraisons. Naviguer par mois ; cliquer une vignette ouvre la livraison. Tous.
- Incidents (/incidents) — Registre des incidents flotte (accident, panne, vol…), statut et dommages. « Nouveau » pour signaler. Suppression réservée président.
- Inspections (/inspections) — Checklist véhicule 7 points (pré/post-trajet, périodique) ; le statut Conforme/Défauts se calcule selon les points cochés. « Nouveau ». Tous.

FLOTTE
- Véhicules (/vehicules) — Référentiel flotte en cartes, échéancier réglementaire (contrôle technique, assurance, révision), Crit'Air, PTAC ≤ 3,5 t. « Nouveau » ; statut modifiable dans le drawer. Tous.
- Carburant (/carburant) — Journal des pleins ; litres × prix/L = total auto ; TVA déductible. « Nouveau », export CSV. Tous.
- Entretiens (/entretiens) — Historique maintenance + prochaines échéances (date/km). « Nouveau » (véhicule, type, coût). Tous.

TIERS
- Clients (/clients) — Référentiel clients : coordonnées, tarification, délai de paiement, encours et statut de paiement. « Nouveau » (nom requis, SIRET 14 chiffres, tarif requis si mode ≠ manuel). Désactiver (tous) ; Supprimer réservé président (bloqué si livraisons liées). Export CSV.
- Fournisseurs (/fournisseurs) — Référentiel fournisseurs, catégories, anti-doublon SIREN (avertissement + confirmation). « Nouveau », désactivation. Tous.

FINANCE
- Charges (/charges) — Dépenses par catégorie, calcul HT/TVA/TTC auto. « Nouvelle charge » (libellé, date, HT > 0), export CSV. Tous.
- Encaissement (/encaissement) — Paiements clients reçus, rattachables à une livraison facturée (montant pré-rempli). « Saisir un paiement », export CSV. Tous.
- Trésorerie (/tresorerie) — Solde Qonto + relevé. « Synchroniser Qonto » puis « Vérifier les paiements » (rapproche et marque payées les livraisons encaissées). Lecture seule sinon. Tous.
- TVA (/tva) — Aide à la déclaration : TVA collectée, déductible (charges + carburant), solde net, par trimestre ou mois. Lecture seule. Tous (à valider avec le comptable).

ÉQUIPE
- Équipe (/equipe) — Membres (rôles, contrats, salaires, validités de conduite), masse salariale. « Nouveau » ; pour un chauffeur, onglet Validités (permis B, visite médicale) = aptitude. Désactivation. Tous.
- Heures (/heures) — Heures travaillées par chauffeur, rattachables à une livraison ; total net calculé. « Nouveau ». Tous.

SYSTÈME
- Alertes (/alertes) — Centre d'alertes en direct (échéances véhicules/chauffeurs, entretiens, retards/impayés, incidents, inspections), filtrables par sévérité/catégorie/recherche. « Briefing du jour » = synthèse IA priorisée (Mistral). Lecture seule. Tous.
- Paramètres (/parametres) — Fiche société (identité légale, IBAN, adresse/dépôt géocodé via autocomplétion). Modifier puis « Enregistrer ». Le dépôt géocodé sert aux tournées. Tous.

Capacités intégrées À L'ASSISTANT (plus d'onglet dédié — tout se fait dans ce chat) :
- Rédaction de mails/brouillons (relance de paiement, email client, annonce de recrutement, texte libre) : demande simplement « écris une relance pour … » → un brouillon copiable s'affiche.
- Import de feuilles de route : joins une photo ou un PDF (bouton trombone) → extraction automatique des livraisons → bouton « Créer ces N livraisons » (avec choix du statut et création des clients manquants, après confirmation).`

// ── Mapping route → libellé d'onglet (pour informer l'assistant du contexte) ───

export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/rentabilite': 'Rentabilité',
  '/statistiques': 'Statistiques',
  '/livraisons': 'Livraisons',
  '/tournees': 'Tournées',
  '/planning': 'Planning',
  '/calendrier': 'Calendrier',
  '/incidents': 'Incidents',
  '/inspections': 'Inspections',
  '/vehicules': 'Véhicules',
  '/carburant': 'Carburant',
  '/entretiens': 'Entretiens',
  '/clients': 'Clients',
  '/fournisseurs': 'Fournisseurs',
  '/charges': 'Charges',
  '/encaissement': 'Encaissement',
  '/tresorerie': 'Trésorerie',
  '/tva': 'TVA',
  '/equipe': 'Équipe',
  '/heures': 'Heures',
  '/alertes': 'Alertes',
  '/parametres': 'Paramètres',
}

/** Libellé de l'onglet courant à partir du pathname (undefined si inconnu). */
export function tabLabelForPath(pathname: string): string | undefined {
  return ROUTE_LABELS[pathname]
}
