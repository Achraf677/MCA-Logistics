// Base de connaissances de l'assistant — version CONDENSÉE de docs/site-map.md.
// Injectée à l'Edge Function `assistant-chat` (champ `knowledge`) pour répondre
// aux questions d'aide à l'usage. À maintenir en phase avec docs/site-map.md.

export const SITE_KNOWLEDGE = `MCA Logistics — PGI/TMS interne (transport routier sub-3,5 t).
Navigation : 8 entrées de menu, chacune est une PAGE À SOUS-ONGLETS. Pour orienter l'utilisateur, donne toujours « Section, onglet X » et le chemin direct ?tab= (ex. « Va dans Finance, onglet TVA » → /finance?tab=tva). N'invente aucun onglet hors de cette liste.
Permissions : rôles president / dg / chauffeur / comptable. Le front ne bloque explicitement que la SUPPRESSION définitive (réservée au président) dans Livraisons, Clients et Incidents ; tout le reste (qui lit/écrit) est encadré côté base par les politiques RLS Supabase. Montants toujours en centimes, formatés à l'affichage.

1) PILOTAGE (/pilotage) — l'app s'ouvre dessus (onglet Dashboard par défaut). Sous-onglets :
   - Dashboard (/pilotage?tab=dashboard) — KPIs du mois (CA HT, nb livraisons, % facturé/payé), référentiels actifs, tendance CA 6 mois, 8 dernières livraisons. Lecture seule.
   - Rentabilité (/pilotage?tab=rentabilite) — Résultat brut annuel mois par mois (CA − charges − carburant − entretiens), sélecteur d'année. Lecture seule.
   - Statistiques (/pilotage?tab=statistiques) — Tendances de l'année : CA mensuel, Top 5 clients, charges par catégorie. Lecture seule.

2) LIVRAISONS (/livraisons) — entrée à part entière. Cœur métier : créer/éditer une course, machine à états (planifiée→en cours→livrée→facturée→payée, ou annulée), facturation Pennylane. « Nouvelle livraison » (Détail puis Montant) ; onglet Suivi pour Démarrer/Marquer livrée/Facturer/Encaisser/Annuler. Suppression réservée président. Resync Pennylane + export CSV.

3) PLANNING (/planning-hub) — vues temporelles. Sous-onglets :
   - Tournées (/planning-hub?tab=tournees) — composer/optimiser les tournées d'une journée, multi-véhicule (cocher véhicules+chauffeurs+livraisons géocodées, « Répartir & optimiser »), Naviguer/Waze, marquer Livré, Démarrer/Terminer, carte d'ensemble.
   - Planning (/planning-hub?tab=planning) — vue hebdomadaire des livraisons (hors annulées).
   - Calendrier (/planning-hub?tab=calendrier) — vue mensuelle des livraisons.

4) FLOTTE (/flotte) — Sous-onglets :
   - Véhicules (/flotte?tab=vehicules) — référentiel flotte, échéancier (CT, assurance, révision), Crit'Air, PTAC ≤ 3,5 t. « Nouveau ».
   - Carburant (/flotte?tab=carburant) — journal des pleins (litres × prix/L = total), TVA déductible. « Nouveau », export CSV.
   - Entretiens (/flotte?tab=entretiens) — historique + prochaines échéances (date/km). « Nouveau ».
   - Inspections (/flotte?tab=inspections) — checklist véhicule 7 points ; statut Conforme/Défauts auto. « Nouveau ».
   - Incidents (/flotte?tab=incidents) — registre incidents (accident, panne, vol…), statut, dommages. « Nouveau ». Suppression réservée président.

5) TIERS (/tiers) — Sous-onglets :
   - Clients (/tiers?tab=clients) — référentiel clients (coordonnées, tarif, délai de paiement, encours/statut paiement). « Nouveau » (nom requis, SIRET 14 chiffres). Désactiver (tous) ; Supprimer réservé président (bloqué si livraisons liées). Export CSV.
   - Fournisseurs (/tiers?tab=fournisseurs) — référentiel fournisseurs, catégories, anti-doublon SIREN. « Nouveau ».

6) FINANCE (/finance) — Sous-onglets :
   - Trésorerie (/finance?tab=tresorerie) — solde Qonto + relevé. « Synchroniser Qonto » puis « Vérifier les paiements ».
   - Charges (/finance?tab=charges) — dépenses par catégorie, HT/TVA/TTC auto. « Nouvelle charge », export CSV.
   - Encaissement (/finance?tab=encaissement) — paiements clients, rattachables à une livraison facturée. « Saisir un paiement », export CSV.
   - TVA (/finance?tab=tva) — aide à la déclaration : collectée, déductible (charges + carburant), solde net, par trimestre/mois. Lecture seule.

7) ÉQUIPE (/equipe-hub) — Sous-onglets :
   - Membres (/equipe-hub?tab=membres) — membres (rôles, contrats, salaires, validités permis B/visite médicale), masse salariale. « Nouveau ».
   - Heures (/equipe-hub?tab=heures) — heures travaillées par chauffeur, rattachables à une livraison ; total net. « Nouveau ».

8) SYSTÈME (/systeme) — Sous-onglets :
   - Alertes (/systeme?tab=alertes) — centre d'alertes en direct (échéances, retards/impayés, incidents, inspections), filtres ; « Briefing du jour » = synthèse IA. Lecture seule.
   - Paramètres (/systeme?tab=parametres) — fiche société (identité légale, IBAN, adresse/dépôt géocodé). Le dépôt géocodé sert aux tournées.

Capacités intégrées À L'ASSISTANT (pas d'onglet dédié — tout se fait dans ce chat) :
- Rédaction de mails/brouillons (relance de paiement, email client, annonce de recrutement, texte libre) : demande « écris une relance pour … » → un brouillon copiable s'affiche.
- Import de feuilles de route : joins une photo ou un PDF (bouton trombone) → extraction automatique des livraisons → bouton « Créer ces N livraisons » (choix du statut + création des clients manquants, après confirmation).`

// ── Mapping route → libellé d'onglet (pour informer l'assistant du contexte) ───

// Une entrée par SECTION (la navigation est plate). Sert à informer l'assistant
// de la section où se trouve l'utilisateur (currentTab).
export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Pilotage',
  '/pilotage': 'Pilotage',
  '/livraisons': 'Livraisons',
  '/planning-hub': 'Planning',
  '/flotte': 'Flotte',
  '/tiers': 'Tiers',
  '/finance': 'Finance',
  '/equipe-hub': 'Équipe',
  '/systeme': 'Système',
}

/** Libellé de l'onglet courant à partir du pathname (undefined si inconnu). */
export function tabLabelForPath(pathname: string): string | undefined {
  return ROUTE_LABELS[pathname]
}
