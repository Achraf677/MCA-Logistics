# MCA Logistics — Cahier des charges des évolutions (onglet par onglet)

> **Statut** : à exécuter APRÈS le 100 % fiable (tests → validation → déploiement → usage réel).
> Ce document = la spec de référence des évolutions. Chaque ligne « À faire » deviendra une brique
> (spec onglet → code → test → validation), selon la méthode actuelle.
>
> **Principes de cohérence (valables pour TOUTES les évolutions)**
> - 1 évolution = 1 brique modulaire (feature étanche), calculs dans `*.logic.ts` **testables**.
> - Tout appel à une API externe passe par une **Edge Function** (clé jamais exposée au front).
> - Géo = **stack OSM/UE** : Photon (adresse), OpenRouteService (km/tournée, clé API), Leaflet/OSM (carte).
> - **Zéro riba**, **RGPD** : données sensibles (IBAN, transactions) jamais envoyées à un module IA.
> - L'IA **propose**, l'humain **valide** (jamais d'écriture auto).
> - Le PGI est un outil de **gestion interne** : il ne remplace ni l'outil comptable (**Pennylane**)
>   ni les dispositifs réglementaires (**tachygraphe**).
>
> **Retirés du périmètre** (déjà couverts par Pennylane) : export TVA/CA3, FEC, lettrage auto,
> rapprochement bancaire comptable.
> **Traité à part** : documents de transport (bon de livraison / lettre de voiture / CMR) → voir
> dernière section (modèles officiels à chercher par Claude in Chrome avant toute spec).

---

## Onglet 1 — Dashboard
- **État** : vue mois (CA HT, nb livraisons, % facturé/payé, référentiels, graphe CA 6 mois).
- **À faire** :
  - Widgets **cliquables** « échéances flotte à venir » (CT/assurance < 30 j) et « factures impayées en retard » → renvoient vers l'onglet concerné, filtré.
  - **Carte des livraisons** du mois (points enlèvement/livraison) → dépend du géocodage (onglet 4).
- **Approche** : widgets = lecture des données existantes (aucune nouvelle table). Carte = Leaflet/OSM.
- **Effort** : widgets faible · carte moyen. **Dépend de** : 4 (géocodage). **Vague** : 1 (widgets) / 3 (carte).

## Onglet 2 — Rentabilité
- **État** : P&L mensualisé annuel (CA, charges, carburant, entretiens, marge).
- **À faire** : rentabilité **par client / par véhicule / par tournée**, avec **€/km** et **coût de revient au km**.
- **Approche** : extraire d'abord `rentabilite.logic.ts` (aujourd'hui logique inline), puis ajouter les
  agrégations par dimension. Le €/km dépend du km (onglet 4). Fonctions pures testées.
- **Effort** : moyen. **Dépend de** : 4 (km), chantier qualité (logic.ts). **Vague** : 2.

## Onglet 3 — Statistiques
- **État** : KPI annuels, CA mensuel, top clients, charges par catégorie.
- **À faire** : indicateurs **opérationnels** — km parcourus, **CA/km**, ponctualité (si on capte l'heure
  prévue vs réelle), nb livraisons/jour, répartition par type/véhicule.
- **Approche** : extraire `statistiques.logic.ts`, ajouter les KPI opérationnels. Dépend du km.
- **Effort** : moyen. **Dépend de** : 4. **Vague** : 2.

## Onglet 4 — Livraisons ⭐ (socle géo)
- **État** : liste filtrable, KPI mois, **colonne KM vide**, export ; adresses saisies à la main.
- **À faire** :
  - **Autocomplétion d'adresse** (Photon) sur enlèvement + livraison → adresse normalisée + coordonnées.
  - **Calcul automatique des km** enlèvement→livraison (OpenRouteService) → remplit la colonne KM.
- **Approche** : Edge Function `geocode` (proxy Photon, anti-exposition clé + cache) et `route-distance`
  (proxy ORS). Stocker lat/lon + km sur la livraison. Le calcul reste **proposé** (modifiable à la main).
  → débloque tarif au km (14), marge €/km (2,3), carte (1), optimisation tournée (5).
- **Effort** : autocomplétion faible · km moyen. **Vague** : 1 (adresse) / 2 (km).

## Onglet 5 — Planning
- **État** : vue semaine des courses.
- **À faire** : **affectation chauffeur/véhicule** par glisser-déposer ; **optimisation de l'ordre des
  arrêts** d'une tournée (moins de km/carburant).
- **Approche** : affectation = interne. Optimisation = ORS (matrice/optimization) via Edge Function.
- **Effort** : affectation moyen · optimisation élevé. **Dépend de** : 4. **Vague** : 3.

## Onglet 6 — Calendrier
- **État** : vue mois des livraisons.
- **À faire** : superposer les **échéances flotte** (CT, assurance, carte grise) et **aptitudes équipe**
  (visite médicale, permis, FIMO/FCO) sur le calendrier.
- **Approche** : lecture des dates déjà présentes (véhicules/équipe) ; pas de nouvelle table.
- **Effort** : faible. **Dépend de** : 9, 18 (dates saisies). **Vague** : 2.

## Onglet 7 — Incidents
- **État** : suivi accidents/pannes/vol/infraction + coût.
- **À faire** : **pièces jointes photo** (constat, dégâts) ; champ « lié au sinistre assurance » (référence).
- **Approche** : Supabase Storage (bucket privé, RLS). Lien assurance = simple champ texte/référence.
- **Effort** : faible. **Vague** : 3.

## Onglet 8 — Inspections
- **État** : check véhicule pré/post-trajet, périodique.
- **À faire** : **check-list mobile** (terrain) + **photos** de l'état du véhicule.
- **Approche** : vue responsive/PWA + Storage. Cohérent avec le futur tableau de bord chauffeur (onglet 22).
- **Effort** : moyen. **Vague** : 3.

## Onglet 9 — Véhicules
- **État** : fiche flotte, km, échéances < 30 j.
- **À faire** : **relances automatiques** des échéances (CT, assurance, carte grise) → alimentent le
  moteur d'alertes (onglet 20) ; **km alimenté** automatiquement depuis les livraisons (cumul) ou saisie pleins.
- **Approche** : les échéances existent déjà → les exposer au moteur d'alertes. Km = somme des km livraisons.
- **Effort** : faible. **Dépend de** : 20, 4. **Vague** : 1 (échéances→alertes).

## Onglet 10 — Carburant
- **État** : pleins, litres, prix/L, conso.
- **À faire** : **calcul conso L/100 par véhicule** + **détection de surconsommation** (écart vs moyenne
  du véhicule) ; (option) import d'un relevé de carte carburant (CSV).
- **Approche** : `carburant.logic.ts` (déjà présent) → ajouter conso L/100 et seuil d'écart ; alerte si
  dépassement (→ onglet 20). Exploite des données **déjà saisies**, 100 % interne.
- **Effort** : faible. **Vague** : 1.

## Onglet 11 — Entretiens
- **État** : maintenance + échéances dépassées.
- **À faire** : **maintenance préventive automatique** basée sur km **ou** date (ex. vidange tous les
  X km / X mois) + rappels → moteur d'alertes.
- **Approche** : règles d'entretien par véhicule (intervalle km/temps) ; calcul de la prochaine échéance.
- **Effort** : moyen. **Dépend de** : 20, 4 (km). **Vague** : 2.

## Onglet 12 — Clients
- **État** : fiche, type, tarif, délai paiement, encours.
- **À faire** : **grille tarifaire au km / par zone** → base des **devis automatiques**.
- **Approche** : étend le modèle tarifaire existant (forfait/km/palette) ; le devis s'appuie sur le km (4).
- **Effort** : moyen. **Dépend de** : 4. **Vague** : 3.

## Onglet 13 — Fournisseurs
- **État** : répertoire par catégorie.
- **À faire** : *(rattachement automatique des charges/transactions = comptabilité → **Pennylane**, hors PGI)*.
  Reste utile : lien fournisseur → charges saisies (navigation interne).
- **Approche** : simple relation interne, pas de rapprochement bancaire.
- **Effort** : faible. **Vague** : 3 (optionnel).

## Onglet 14 — Charges
- **État** : saisie par catégorie HT/TTC.
- **À faire** : *(rapprochement bancaire = **Pennylane**, hors PGI)*. Reste utile : rattacher une charge à
  un fournisseur (onglet 13) et à un véhicule (pour la rentabilité par véhicule, onglet 2).
- **Effort** : faible. **Vague** : 2 (lien véhicule, utile à la rentabilité).

## Onglet 15 — Encaissement
- **État** : paiements clients par mode.
- **À faire** : *(lettrage auto = **Pennylane**, retiré du périmètre)*. **RAS côté PGI** pour l'instant.

## Onglet 16 — Trésorerie
- **État** : intégration **Qonto** (solde, transactions, « Vérifier les paiements »).
- **À faire** : (option) **prévisionnel de trésorerie** = solde actuel + encaissements attendus (encours
  clients) − charges à venir, sur 30/60/90 j.
- **Approche** : calcul interne (`tresorerie.logic.ts`) à partir des données existantes. Aucune donnée nouvelle exposée.
- **Effort** : moyen. **Vague** : 3 (option).

## Onglet 17 — TVA
- **État** : déclaration calculée par trimestre/mois.
- **À faire** : *(export CA3 / FEC = **Pennylane**, retiré)*. **RAS côté PGI**. (L'écran reste une vue de contrôle interne.)

## Onglet 18 — Équipe
- **État** : RH (rôles, contrats, salaire, aptitude médicale).
- **À faire** : **rappels** visite médicale / permis / **FIMO-FCO** (échéances) → moteur d'alertes (20).
  (Option) documents RH attachés (Storage privé).
- **Approche** : dates d'échéance saisies → exposées aux alertes et au calendrier (6).
- **Effort** : faible. **Dépend de** : 20. **Vague** : 1 (échéances→alertes).

## Onglet 19 — Heures ⏱️ (cohérence réglementaire)
- **État** : temps de travail chauffeurs lié aux livraisons.
- **Cadre réglementaire (à respecter, vérifié 06/2026)** :
  - **Transport national** (cas par défaut d'une PME locale) → **Code du travail** : amplitude, repos
    quotidien (11 h), repos hebdomadaire, durée maximale, heures supplémentaires. Le PGI peut suivre cela.
  - **Transport international / cabotage** avec VUL **> 2,5 t** → depuis le **1er juillet 2026** :
    **tachygraphe intelligent Gen2 V2 OBLIGATOIRE** + règles UE 561/2006 (conduite continue ≤ 4 h 30
    puis pause 45 min ; conduite journalière 9 h, 10 h max 2×/sem ; repos journalier 11 h ; repos
    hebdomadaire). **MCA est à Ostwald (frontière DE)** : une livraison en Allemagne = international.
- **À faire (cohérent)** :
  - Suivi du **temps de travail au sens Code du travail** (amplitude, repos, heures sup) → utile pour le national.
  - **NE PAS** prétendre calculer/remplacer le tachygraphe pour l'international (c'est l'appareil qui fait foi).
  - **Avertissement** dans l'écran : si activité internationale/cabotage avec VUL > 2,5 t → tachygraphe
    obligatoire ; le PGI ne se substitue pas au dispositif légal.
  - (Option) zone d'**archivage indicatif** des données de conduite, sans valeur réglementaire.
- **Approche** : `heures.logic.ts` (calculs Code du travail, testés). Pas d'export paie « officiel » (laisser au comptable).
- **Effort** : moyen. **Vague** : 2. **Note** : sujet réglementaire — faire valider par la DREAL Grand Est / un conseil transport.

## Onglet 20 — Alertes ⭐ (meilleur ROI / faible effort)
- **État** : centre de notifications **vide**.
- **À faire** : **moteur d'alertes automatiques** agrégeant :
  - échéances véhicules (CT, assurance, carte grise) → onglet 9 ;
  - aptitudes équipe (visite médicale, permis, FIMO/FCO) → onglet 18 ;
  - factures **impayées en retard** (selon délai de paiement client) ;
  - entretien préventif dû (km/date) → onglet 11 ;
  - surconsommation carburant → onglet 10.
- **Approche** : commencer **simple** = `alertes.logic.ts` qui **dérive** les alertes des données
  existantes à l'affichage (aucune nouvelle table, aucun cron) → testable, zéro dette. Évolution
  ultérieure possible : persistance + notifications (email) via Edge Function planifiée.
- **Effort** : faible/moyen. **Vague** : 1 (le premier ajout recommandé).

## Onglet 21 — Brouillons IA
- **État** : génération texte (relance, email, annonce) — Mistral UE, saisie libre RGPD-safe.
- **À faire** : **pré-remplissage** optionnel avec des données client réelles (nom, montant dû, échéance)
  → en conservant l'avertissement RGPD et le contrôle humain.
- **Approche** : l'utilisateur choisit le client/la facture → le PGI pré-remplit le contexte (pas de
  données sensibles type IBAN). L'IA propose, l'humain valide/envoie.
- **Effort** : faible. **Vague** : 2.

## Onglet 22 — Copilote IA
- **État** : lecture feuille de route image/PDF → propositions de livraisons (B1→B2.1).
- **À faire** : **géocodage des adresses extraites** (Photon) → coordonnées + km (ORS) directement dans
  les propositions ; (option) **saisie vocale** (le module lit déjà des documents).
- **Approche** : réutilise les Edge Functions géo de l'onglet 4. Reste « propose → valide ».
- **Effort** : moyen. **Dépend de** : 4. **Vague** : 2/3.

## Onglet 23 — Paramètres
- **État** : identité légale, coordonnées, IBAN/BIC.
- **À faire** : **seuils d'alerte** paramétrables (jours avant échéance, retard impayé, seuil surconso) ;
  **clé API OpenRouteService** (stockée en secret Supabase, pas en clair) ; mention d'**attribution OSM**.
- **Approche** : table de paramètres société (déjà existante) ; clé via secret Edge Function.
- **Effort** : faible. **Vague** : 1 (prérequis des alertes et du géo).

---

## SECTION À PART — Documents de transport (à spécifier plus tard)
**Bon de livraison · Lettre de voiture · CMR.** Sujet réglementaire spécifique au transport routier
de marchandises. **Avant toute spec** : Claude in Chrome doit chercher les **modèles officiels en
vigueur** (mentions obligatoires, format CMR international, lettre de voiture nationale). On spécifiera
ensuite la génération PDF (locale, sans donnée tierce) à partir des données de livraison. À NE PAS
mélanger avec les autres briques.

---

## Récapitulatif par vague (ordre d'exécution conseillé, post-100 %)
- **Vague 1 (fort impact / faible effort, interne)** : 23 Paramètres (seuils + clé) → 20 Alertes →
  4 autocomplétion adresse → 10 surconsommation → 9 & 18 échéances (alimentent les alertes).
- **Vague 2 (effort moyen)** : 4 calcul km → 2 rentabilité €/km → 3 stats opérationnelles →
  11 maintenance préventive → 19 Heures (Code du travail) → 21 Brouillons pré-remplis → 6 Calendrier échéances.
- **Vague 3 (effort élevé / dépendances)** : 1 carte → 5 optimisation tournée → 22 géo Copilote + vocal →
  12 grille tarifaire/devis → 7 & 8 photos terrain → 16 prévisionnel trésorerie.
- **À part** : documents de transport (BL / lettre de voiture / CMR) → après recherche des modèles.
