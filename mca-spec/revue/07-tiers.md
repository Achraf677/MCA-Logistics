# 07 — Tiers (Clients, Fournisseurs)

## 1 Rôle
- Clients : qui commande et paie, encours, retard. Fournisseurs : chez qui on dépense (12 mois), dernière facture.

## 3 Écran (refonte du 24/10/2026)
- Tuiles cliquables (`ChiffreCarte`) = filtres : Clients (actifs · pros · particuliers · encours · en retard) ; Fournisseurs (actifs · carburant · entretien · dépensé 12 mois). Elles comptent sur l'ensemble (`tous`), pas sur la liste filtrée.
- Barre `BarreRecherche` (raccourci « / », compteur) + `ListeDeroulante` (type / catégorie) + `PastilleFiltre` (Actifs uniquement, Avec encours) + « Tout réinitialiser ».
- Lignes : `AvatarInitiales`, nom + contact en sous-titre, badges, chevron ; cartes sur mobile.
- Fiches (tiroirs) : tous les `<select>` natifs passés en `ListeDeroulante` (type, pays, délai, tarif, prestation, chauffeur / véhicule habituels, catégorie fournisseur).

## 6 Fichiers
- `features/clients/{Clients,DrawerClient}.tsx`, `features/fournisseurs/Fournisseurs.tsx`, `shared/ui/{AvatarInitiales,PastilleFiltre,ListeDeroulante,BarreRecherche,ChiffreCarte}.tsx`.

## 8 Reste
- Fiche client : bloc « Facturation » et « Exécution » à relire (validation progressive, comme la fiche livraison) ; fusion des ~20 fiches clients « particuliers » jetables (à décider) ; client à 60 j à repasser à 30 j.
