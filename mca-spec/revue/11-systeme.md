# 11 — Système (Paramètres, Administrateurs)

## 1 Rôle
- Paramètres : fiche de la société, réglages Finance / Flotte, compte Google, lecture des photos, apparence et compte de l'utilisateur.
- Administrateurs (président seulement) : comptes du bureau et droits par ressource.

- Onglet Cartes bancaires (ajouté le 29/10/2026 par le chantier Justificatifs, `features/cartes`) : hors de ce chantier, voir CLAUDE.md § 12.

## 2 Qui voit quoi
- Onglet Paramètres : droit `systeme.parametres` (vue). Modifier la société : président OU `systeme.parametres` en modification (policy `companies_update_perm`). Sans ce droit : champs et bouton grisés, message « Lecture seule ».
- Onglet Administrateurs : président seulement ; Edge `admin-users` / `admin-permissions` refusent tout autre compte.
- `companies` est lisible par tout compte de la société (salariés compris) : IBAN, SIRET… ne sont pas secrets (sur les factures). Resserrer = changement de droits, à décider avec l'utilisateur.

## 3 Écran Paramètres (refonte du 29/10/2026, lot S1)
- 3 tuiles cliquables : fiche société (n / 12 champs, ce qui manque), licence, RC pro (voyant à 60 jours) ; un clic mène au bloc.
- 5 volets (`?volet=`) : Société · Finance · Flotte · Documents & IA · Mon espace (= ex Apparence + Compte). Anciens liens `apparence` / `compte` redirigés.
- Société : blocs `Bloc` en 3 colonnes PC (tient sur 1366 × 768) : Identité légale · Pennylane (e-mail de dépôt, modifiable ici pour la 1re fois) · Dépôt · Tournées de colis (départ centre de tri) · Banque · Conformité transport.
- Barre d'actions fixe : compteur de modifications, Annuler, Enregistrer ; avertissement navigateur si on quitte avec des changements.
- Contrôles (`parametres.logic.ts`, testés) : SIREN 9 chiffres, SIRET 14, TVA (clé FR calculée), IBAN (mod 97), BIC, e-mail ; bloquent seulement une valeur MODIFIÉE (une valeur déjà en base ne bloque jamais). Avertissements : SIRET / TVA ≠ SIREN.
- Documents & IA : compte Google (`GmailConnect`, retour OAuth sur le bon volet) + « Vérifier la lecture des photos » (sans jargon).

## 4 Gestes et écritures
- `companies` : update (colonnes de `parametres.queries`). Edge `geocode` (adresse sans coordonnées).
- Google : Edge `drive-status`, `drive-oauth-start`, `drive-disconnect`.

## 5 Données lues
- `companies.pennylane_depot_email` : lu par l'Edge `pennylane-justificatif`.
- `companies.transport_license_expiry` / `rc_pro_expiry` : lues aussi par les alertes (`alertes.queries`).
- `companies.depart_colis_*` : lu par `optimiser-tournee-colis`. `depot_lat/lng` : Edge de tournées.

## 7 Reste / à décider
- Forme juridique, RCS, ville du greffe (mentions légales, lot U6) : absents de `companies`, valeurs à fournir par l'utilisateur.
- `GestionCategories` / `GestionProduits` : tailles de texte `var(--fs-*)` non corrigées (GestionProduits = zone Flotte).
- Admins : lot S2 (salariés séparés, filtres, droits par profil).

## 9 À tester
- Société : modifier un champ → barre « 1 modification » → Annuler restaure ; IBAN faux → bouton grisé ; enregistrer l'e-mail de dépôt.
- Compte sans `systeme.parametres` en modification : champs grisés.
- Mobile : aucun défilement horizontal.
