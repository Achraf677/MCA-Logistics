# 11 — Système (Paramètres, Administrateurs)

## 1 Rôle
- Paramètres : fiche de la société, réglages Finance / Flotte, compte Google, lecture des photos, apparence et compte de l'utilisateur.
- Administrateurs (président seulement) : comptes du bureau et droits par ressource.

- Onglet Cartes bancaires (ajouté le 29/10/2026 par le chantier Justificatifs, `features/cartes`) : hors de ce chantier, voir CLAUDE.md § 12.

## 2 Qui voit quoi
- Onglet Paramètres : droit `systeme.parametres` (vue). Modifier la société : président OU `systeme.parametres` en modification (policy `companies_update_perm`). Sans ce droit : champs et bouton grisés, message « Lecture seule ».
- Onglet Administrateurs : président seulement ; Edge `admin-users` / `admin-permissions` refusent tout autre compte.
- `companies` est lisible par tout compte de la société (salariés compris) : IBAN, SIRET… ne sont pas secrets (sur les factures). Resserrer = changement de droits, à décider avec l'utilisateur.

## 3 Écran Paramètres (refonte du 29/10/2026, lot S1 puis retouches)
- Plus de tuiles ni de « fiche complète n / 12 » (inutile). 5 volets (`?volet=`) : Société · Connexions (ancienne clé `documents`) · Finance · Flotte · Mon espace (= ex Apparence + Compte). Anciens liens `apparence` / `compte` redirigés.
- Société = LECTURE par défaut (`BlocFiche`) : valeurs figées, bouton « Modifier » par bloc ; les champs n'apparaissent qu'au clic (plus de liste d'adresses qui s'ouvre toute seule). Blocs : Identité légale · Conformité transport (voyants licence / RC pro à 60 jours) · Adresse du dépôt · Départ des tournées de colis. Plus d'affichage de coordonnées GPS.
- Barre d'actions fixe (Annuler / Enregistrer) seulement quand un bloc est ouvert ou modifié ; avertissement navigateur si on quitte avec des changements.
- Contrôles (`parametres.logic.ts`, testés) : SIREN 9 chiffres, SIRET 14, TVA (clé FR calculée), e-mail ; bloquent seulement une valeur MODIFIÉE. Avertissements : SIRET / TVA ≠ SIREN.
- Connexions : compte Google (`GmailConnect`) · Dépôt Pennylane (`PennylaneDepot` : adresse masquée, « Changer » = confirmation avec case à cocher puis saisie de la nouvelle adresse DEUX fois) · « Vérifier la lecture des photos ».
- IBAN / BIC : plus dans Paramètres ; bloc « Compte bancaire de la société » en haut de Système › Cartes bancaires (`features/cartes/CompteBancaire.tsx`, lecture par défaut, « Modifier » = confirmation avec case à cocher, contrôle IBAN mod 97 / BIC, `shared/lib/coordonneesBancaires.ts`). Colonnes `companies.iban / bic` inchangées (aucun autre lecteur dans le code).
- `AddressAutocomplete` : ne propose plus de liste à l'ouverture d'un champ déjà rempli (seulement si on change le texte).

## 4 Gestes et écritures
- `companies` : update (colonnes de `parametres.queries`). Edge `geocode` (adresse sans coordonnées).
- Google : Edge `drive-status`, `drive-oauth-start`, `drive-disconnect`.

## 5 Données lues
- `companies.pennylane_depot_email` : écrit par `parametres/PennylaneDepot`, lu par l'Edge `pennylane-justificatif`.
- `companies.transport_license_expiry` / `rc_pro_expiry` : lues aussi par les alertes (`alertes.queries`).
- `companies.depart_colis_*` : lu par `optimiser-tournee-colis`. `depot_lat/lng` : Edge de tournées.

## 7 Reste / à décider
- Forme juridique, RCS, ville du greffe (mentions légales, lot U6) : absents de `companies`, valeurs à fournir par l'utilisateur.
- `GestionCategories` / `GestionProduits` : tailles de texte `var(--fs-*)` non corrigées (GestionProduits = zone Flotte).

## 9 À tester
- Société : Modifier un bloc → champs + barre → Annuler restaure. Connexions › Changer l'adresse Pennylane : case à cocher, deux saisies identiques. Cartes bancaires › Modifier le compte : IBAN faux → bouton grisé.
- Compte sans `systeme.parametres` en modification : champs grisés.
- Mobile : aucun défilement horizontal.

## 10 Administrateurs (refonte du 29/10/2026, lot S2)
- Tuiles cliquables : comptes du bureau · actifs · coupés · salariés (ouvre le bloc). `BarreRecherche` (nom, e-mail, rôle), `ListeDeroulante` (rôle), `PastilleFiltre` « Actifs uniquement », « Tout réinitialiser ».
- Liste = comptes du BUREAU seulement (`separerComptes`). Les comptes salariés (`role = chauffeur`) sont dans un bloc replié « Comptes salariés (n) », lecture seule, avec lien vers Équipe › fiche › Accès (rôle, mot de passe, suppression d'un salarié ne se font plus ici).
- Tiroir d'un compte : Droits (grille 14 ressources × 4, « Appliquer un profil » = Comptable / Directeur général / Lecture seule : pré-coche seulement, rien n'est enregistré avant « Enregistrer les droits » ; aucun profil ne touche Système ni ne donne « Supprimer ») · Compte (rôle, actif, mot de passe défini / lien) · Supprimer. Barre d'actions fixe.
- Optimiste : rôle, accès coupé et suppression se voient tout de suite dans la liste, retour en arrière + message si le serveur refuse ; rechargement silencieux (plus de squelette).
- Ajout en tiroir : bascule Mot de passe / Invitation, bouton « Générer » (12 caractères lisibles, `genererMotDePasse`). `ModalAddAdmin` supprimé.
- Sans migration, sans Edge. Règles pures testées : `admins.logic.ts`.
- Reste : « dernière connexion » (demande un champ de plus dans `admin-permissions`, non fait) ; `profiles.drive_access` mort (anciens Edge `drive-upload` / `drive-create-folder`), laissé tel quel.
