# Dépenses véhicule — plan d'uniformisation (validé le 29/09/2026)

> Source de vérité du chantier « Carburant & consommables » + « Entretien & équipement ».
> Principe : **même forme partout, contenu adapté à la famille.**

## 1. Socle commun : la ligne de dépense
Chaque achat = une ou plusieurs lignes, toutes avec : date · article · famille (déduite de
l'article) · fournisseur · destination · quantité + unité · TTC / TVA / HT (centimes) ·
facture liée · note. Une facture peut donner N lignes ; **somme des lignes = total facture**.

## 2. Les 4 familles
| Champ | ⛽ Carburant | 🧴 Consommables | 🔧 Entretien & réparations | 📦 Équipement & fournitures |
|---|---|---|---|---|
| Destination | Véhicule | Véhicule ou Stock | Véhicule | Véhicule ou Stock |
| Chauffeur | obligatoire | facultatif | — | — |
| Quantité | litres (obl.) | facultative (L / bidon) | facultative | obligatoire (pièces) |
| Prix unitaire | €/L (obl.) | facultatif | — | facultatif |
| Kilométrage | recommandé (conso) | facultatif | obligatoire (échéances) | — |
| Prochaine échéance | — | — | automatique (date / km) | — |
| Garage / prestataire | — | — | obligatoire | — |
| Stockable | non | oui | non | oui |

Calculs propres : ⛽ conso L/100 + prix moyen/L · 🧴 coût/mois/véhicule · 🔧 échéances + historique ·
📦 inventaire (qui a quoi).

**Décisions (29/09) :** pas de destination « Société » ni de répartition au prorata des km
(pas de données fiables) ; équipement → véhicule ou stock ; consommables → chauffeur facultatif ;
**aucune notion d'immobilisation ici** (reste en comptabilité / Pennylane) ; lavage = 🔧.

## 3. Fiche unique à 4 blocs (même ordre partout)
En-tête facture liée → 1 · QUOI (article → badge famille, date, fournisseur) → 2 · POUR QUI
(destination, chauffeur si ⛽/🧴) → 3 · COMBIEN (quantité, unité, P.U., TTC, TVA, % déductible)
→ 4 · SPÉCIFIQUE (⛽ km · 🔧 km + garage + échéance) → pied (Enregistrer / Annuler / Supprimer).

## 4. File « À traiter » unique
Toutes les factures véhicule Pennylane non traitées (hors supprimées), famille pressentie par l'IA,
bouton unique « Traiter », « Pas une dépense véhicule » pour sortir caution / frais. Lecture IA
automatique à l'arrivée depuis Pennylane.

## 5. Écran « Traiter » = import de relevé généralisé
Tableau 1 ligne par article (colonnes adaptées à la famille), frais décochés, contrôle de somme,
création groupée rattachée à la facture. Un ticket simple = même écran, 1 ligne.

## 6. Stock
Entrée = achat destination Stock (valorisé au prix d'achat). Sortie = « Utiliser du stock »
(article, quantité, véhicule, date) valorisée au PMP. Écran Stock (quantité, valeur, alerte stock
bas par article). Aucune écriture comptable : outil de gestion uniquement.

## 7. Écrans (Flotte)
| Onglet | Familles | 4 cartes |
|---|---|---|
| Carburant & consommables | ⛽ 🧴 | Total TTC · Litres · Prix moyen/L · Conso L/100 |
| Entretien & équipement | 🔧 📦 | Total TTC · Interventions · Échéances à venir · Équipement du mois |
| Stock | stockables | Valeur · Articles en alerte · Entrées · Sorties du mois |
| Coûts véhicules | toutes | Coût total · Coût/km · Véhicule le plus cher · Évolution |

Même ordre dans chaque onglet : cartes → file « À traiter » → filtres (dates, véhicule,
famille/article en liste déroulante, à rapprocher) → tableau (Date · Article + badge · Destination ·
Quantité · TTC · Facture + 1 colonne spécifique en dernier).

## 8. Paramètres → « Articles & familles »
Par article : famille, unité par défaut, stockable, périodicité (🔧), seuil stock bas.
Renommer / masquer / supprimer si inutilisé (fonctionnement existant).

## 9. Correspondance comptable (indicative, Pennylane fait foi)
⛽ 6061 · 🧴 6061/6068 (à confirmer comptable) · 🔧 6155 · 📦 6063.

## 10. Classement
Libellé d'abord (gratuit) → lecture IA de la facture → correction en un clic.
Règle : fait rouler → ⛽ · s'ajoute et s'use → 🧴 · répare/maintient → 🔧 · objet qui reste → 📦.

## 11. Données
Une table unifiée de lignes remplace à terme fuel_logs + vehicle_maintenances ; reprise sans perte
(pleins → ⛽, AdBlue/lave-glace → 🧴, entretiens → 🔧) ; anciens écrans rebranchés progressivement.

## 12. Feuille de route
0 merge PR #29 ✅ · 1 Articles & familles (Paramètres) · 2 table unifiée + reprise + fiche 4 blocs ·
3 file + « Traiter » généralisé + lecture auto Pennylane · 4 échéances 🔧 + alertes · 5 stock ·
6 tableau « Coûts véhicules » + export.
