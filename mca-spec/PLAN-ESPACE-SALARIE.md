# Plan — Espace salarié (heures, journée messagerie, validation, rapports)

> Demandé le 12/10/2026. Plan de A à Z, établi à partir du code ET de la base (rien modifié).
> Fait foi pour ce chantier ; à mettre à jour à chaque lot (comme une fiche de revue).
> Les points marqués **[À DÉCIDER]** attendent une réponse : rien n'est inventé.

---

## 0. Décisions du 12/10/2026 (font foi sur le reste du plan)
- **Heures : retirées de l'app.** On achète le LIC papier (livret individuel de contrôle).
  Le salarié ne saisit plus début / fin ; plus de contrôle SMIC dans l'app. L'onglet
  Heures du bureau reste tel quel.
- **Tarifs salarié** : un prix au colis **domicile** et un prix au colis **point relais**,
  différents, dans la fiche Équipe du salarié.
- **Client** : le prix client n'a rien à voir avec la paie (D FAST = 1 € HT / colis, sans
  relais). Le relevé client déduit des journées reste une option (lot S4, plus tard).
- **Retours** : non ; à la place **colis en litige + raison** (texte).
- **Deux clients le même jour** : oui, c'est l'admin qui les fixe (le salarié ne choisit pas).
- **Clôture du mois et validation** : l'admin. Une journée validée : le salarié ne peut plus
  ni modifier ni supprimer. L'admin peut corriger, mais avec **double confirmation** et
  **historique des modifications** (qui, quand, avant / après, pourquoi).
- **Tickets de Mohammed** : tantôt carte société, tantôt note de frais : **il choisit** à
  la saisie, dans un vrai espace propre pour lui (lot S3).
- **Faille plus large que prévu** : en plus de `team_members` / `work_hours`, toute la
  finance (charges, trésorerie, transactions Qonto, paiements, fournisseurs…) était lisible
  par n'importe quel compte de la société → fermée pour le salarié en S0.

### Lots révisés
- **S0 — Sécurité + accès** (codé, PR #52) : policies restrictives « pas pour le salarié »
  (migration `20261012090000_salarie_cloisonnement`), onglet « Accès au site » dans la fiche
  Équipe (créer le compte avec mot de passe ou invitation, ou « C'est mon compte »), Edge
  `admin-users` (`team_member_id`, `link_member`).
- **S1 — Journée de colis** : client(s) du jour fixés par l'admin ; colis domicile, relais,
  litige + raison ; photo de l'appareil ; envoi ; validation admin ; verrou ; historique.
- **S2 — Rapports + clôture** : jour / mois / salarié ; € dus (domicile × tarif + relais ×
  tarif) ; export CSV ; clôture du mois.
- **S3 — Espace dépenses** (Mohammed et autres) : ticket → carte société ou note de frais
  → Pennylane.
- **S4 (option)** : relevé client déduit des journées validées.

---

## 1. Ce qui existe aujourd'hui (vérifié le 12/10/2026)

- **Mes courses** (`features/mescourses`, route `/mes-courses`) : écran terrain du chauffeur
  (arrêts, GPS, preuves photo + signature, problème, « Livré », tournée, bouton « Ticket »).
  Un compte `chauffeur` y est envoyé d'office (`PilotageSection.tsx:20`).
- **Heures** (`features/heures`, table `work_hours`) : saisie **bureau uniquement**
  (début, fin, pause, total calculé). Pas de statut, pas de validation.
- **Équipe** (`features/equipe`, table `team_members`) : fiche salarié (contrat, salaire brut,
  permis B, visite médicale). Colonne `profile_id` (lien vers le compte de connexion)
  **jamais remplie par aucun écran**.
- **Tickets** (`receipts_inbox`) : photo + note envoyées depuis Mes courses → boîte « à traiter »
  dans Finance › Charges → le bureau en fait une charge. **Rien ne part vers Pennylane** :
  `pennylane-sync` ne fait que LIRE les factures fournisseurs de Pennylane.
- **Messagerie** : un relevé mensuel saisi à la main (`deliveries`, `prestation = messagerie`,
  `nb_colis`) — aujourd'hui 1 relevé (D FAST TRANSPORT, 392 colis, octobre), sans chauffeur.
- **En base** : 2 comptes (président tous les deux), 0 compte salarié ; 2 fiches équipe
  (Achraf, Mohammed), non reliées à leur compte.

### Ce qui bloque avant tout compte salarié
- **Faille** : `team_members` et `work_hours` sont lisibles par **toute la société**
  (policies `*_select_own` = même société). Un salarié connecté lirait les salaires bruts et
  les heures de tout le monde. **À fermer en premier.**
- **Lien compte ↔ fiche absent** : sans `team_members.profile_id`, un chauffeur ne voit
  aucune course (RLS `deliveries_select_own` passe par sa fiche).

---

## 2. Logique métier (la réalité du terrain)

```
             LE SALARIÉ (téléphone)                         LE BUREAU (PC)
 ┌───────────────────────────────────────┐      ┌──────────────────────────────────────┐
 │ MA JOURNÉE  (une fiche par jour)      │      │ À VALIDER  (Équipe › Validation)      │
 │  • Début / fin / pause                │      │  • photo de l'appareil en grand       │
 │  • Colis livrés à domicile            │ ───► │  • déclaré vs à valider (corrigeable) │
 │  • Colis livrés en point relais       │ envoi│  • Valider  /  Corriger  /  Refuser   │
 │  • (Retours / non livrés) [À DÉCIDER] │      │    (motif obligatoire si refus)       │
 │  • Photo du compteur de l'appareil    │      └───────────────┬──────────────────────┘
 │  • Note                               │ ◄─── refus + motif   │ validé = VERROUILLÉ
 │  Statut : brouillon → envoyée         │   (il corrige,       ▼ (le salarié ne peut plus
 └───────────────────────────────────────┘    renvoie)           ni modifier ni supprimer)
                                                  ┌──────────────────────────────────────┐
                                                  │ RAPPORTS (Équipe › Rapports)          │
                                                  │  jour · mois · par salarié            │
                                                  │  heures · colis domicile · relais     │
                                                  │  € dus au salarié (relais × tarif)    │
                                                  │  contrôle SMIC · export paie (CSV)    │
                                                  └───────────────┬──────────────────────┘
                                                                  │ fin de mois
                                                                  ▼
                                                  ┌──────────────────────────────────────┐
                                                  │ RELEVÉ CLIENT du mois (messagerie)    │
                                                  │  nb_colis = somme des journées        │
                                                  │  VALIDÉES du client → facture         │
                                                  │  Pennylane (circuit actuel, inchangé) │
                                                  └──────────────────────────────────────┘
```

### Règles
1. **Une donnée = une seule saisie** : le salarié déclare ses colis UNE fois par jour ; le
   relevé mensuel du client et la paie en sont **déduits**, plus jamais ressaisis.
2. **Deux nombres, jamais confondus** : ce que le salarié a **déclaré** et ce que le bureau a
   **validé**. Une correction garde les deux (traçabilité en cas de litige).
3. **Verrou** : une journée validée ne peut plus être modifiée ni supprimée par le salarié
   (garanti par la base, pas seulement par l'écran). Seul le bureau (droit
   `equipe.heures/update`) peut la rouvrir, avec une trace (qui, quand, pourquoi).
4. **Clôture du mois** : une fois la paie du mois partie, le mois est clôturé → plus aucune
   modification, même au bureau, sans « rouvrir le mois » explicite. **[À DÉCIDER : qui clôture ?]**
5. **Photo = preuve** : une photo par journée minimum (compteur de l'appareil), horodatée à
   l'envoi ; empreinte du fichier gardée pour repérer une même photo envoyée deux fois.
6. **Point relais payé au colis** : montant dû = colis relais **validés** × tarif du salarié
   (saisi UNE fois dans sa fiche Équipe). **[À DÉCIDER : tarif ; colis domicile payés aussi
   au colis ou inclus dans le salaire ?]**
7. **Contrôle SMIC** (rémunération à la pièce) : le total payé doit couvrir au moins le SMIC
   des heures faites → le rapport le signale en rouge si ce n'est pas le cas.
8. **Heures** : décompte quotidien début / fin / pause par salarié (obligation de l'employeur
   quand les horaires ne sont pas collectifs). Transport < 3,5 t : le **livret individuel de
   contrôle (LIC)** peut rester obligatoire pour les roulants — **[À VÉRIFIER avec
   l'expert-comptable : le relevé du site remplace-t-il le LIC ?]**
9. **Oubli** : le bureau peut saisir la journée à la place du salarié (source « bureau »).

---

## 3. Données (base)

### Tables touchées / créées
- `team_members` (+) : `tarif_relais_cts` (prix payé au salarié par colis relais),
  `tarif_domicile_cts` (si payé au colis **[À DÉCIDER]**). Lien `profile_id` enfin rempli.
- `work_hours` (+) : `statut` (`brouillon | envoyee | validee | refusee`), `source`
  (`salarie | bureau | tournee`), `valide_par`, `valide_le`, `motif_refus`.
  Les lignes existantes passent en `validee` / `bureau` (déjà saisies par le bureau).
- **`journees_colis`** (nouvelle) : `company_id`, `member_id`, `date`, `client_id`
  (donneur d'ordre, ex. D FAST), `colis_domicile`, `colis_relais`, `colis_retour`,
  `*_valide` (mêmes champs côté bureau), `photo_ids` (documents Storage), `note`, `statut`,
  `source`, `valide_par`, `valide_le`, `motif_refus`, `releve_id` (relevé client qui l'a
  comptée). Unique (`member_id`, `date`, `client_id`).
- **`periodes_cloturees`** (nouvelle, lot S4) : mois clôturés par société.

### Droits (RLS)
- Salarié : lit / écrit **ses** lignes (`member_id` = sa fiche) ; modifie / supprime
  seulement en `brouillon`, `envoyee` ou `refusee`. Trigger `verrou_apres_validation` : refus
  de toute modification d'une ligne `validee` sauf droit `equipe.heures/update`.
- Bureau : tout, selon `equipe.heures` (view / update).
- `team_members` : le salarié ne lit que **sa** fiche (sans le salaire des autres) ; le
  bureau selon `equipe.membres/view`.

### Lecteurs à adapter (interconnexions)
- `heures` (onglet) : affiche le statut, n'additionne que le validé dans les totaux.
- `tournees` (« Terminer » propose les heures) : écrit en `source = tournee`, `validee`.
- `mescourses` : nouvel onglet « Ma journée ».
- `alertes` : « N journées à valider ».
- Relevé messagerie (`deliveries`) : généré depuis `journees_colis` validées (lot S4).
- `CARTE-INTERCONNEXIONS.md` : à mettre à jour à chaque lot.

---

## 4. Écrans

### Salarié (téléphone) — dans Mes courses, 3 onglets en bas
- **Courses** : l'écran actuel.
- **Ma journée** :
  - « Je commence » (heure du moment, modifiable) · « J'ai fini » · pause ;
  - client du jour (pré-rempli : son client habituel) ;
  - colis domicile · colis point relais · (retours) — gros boutons + / − ;
  - « Photo de l'appareil » (caméra directe) ;
  - « Envoyer au bureau » → statut affiché (envoyée / validée avec cadenas / refusée + motif).
- **Mon mois** : jours du mois avec statut, total heures, total colis relais, montant relais
  (validé et en attente séparés), mes documents (permis, visite médicale), mes tickets.

### Bureau (PC) — section Équipe
- **Validation** (nouvel onglet, badge = nombre à valider) : une carte par journée envoyée,
  photo en grand, déclaré à côté du champ « validé » pré-rempli ; Valider / Corriger /
  Refuser ; « Valider tout ce qui est conforme » pour la sélection.
- **Rapports** : période (jour / mois), salarié, client ; heures, colis domicile, relais,
  retours, € dus, contrôle SMIC ; export CSV pour la paie ; « Générer le relevé client du
  mois » (lot S4).
- **Équipe › fiche** : « Créer l'accès au site » (invitation e-mail, rôle chauffeur, lien
  fiche ↔ compte) + tarifs au colis.

---

## 5. Lots (dans l'ordre)

| Lot | Contenu | Migration | Edge |
|---|---|---|---|
| **S0 — Sécurité + accès** | Fermer la lecture de `team_members` / `work_hours` ; « Créer l'accès » depuis la fiche Équipe (rôle chauffeur + `profile_id`) | oui (policies) | `admin-users` |
| **S1 — Heures salarié** | « Ma journée » heures ; statuts ; verrou en base ; Validation (heures) | oui (`work_hours` +) | — |
| **S2 — Journée messagerie** | Colis domicile / relais / retours + photo ; Validation (colis) ; tarifs dans la fiche | oui (`journees_colis`, `team_members` +) | — |
| **S3 — Rapports + paie** | Jour / mois / salarié ; € relais ; contrôle SMIC ; export CSV ; « Mon mois » | — | — |
| **S4 — Relevé client + clôture** | Relevé mensuel généré depuis les journées validées ; clôture du mois | oui (`periodes_cloturees`, `releve_id`) | — |
| **S5 — Ticket → Pennylane** | Voir § 6 (après vérification) | peut-être | nouvelle (`pennylane-ticket`) |

Chaque lot : tests, PR, preview, « merge » ; migrations / Edge appliquées par Claude (§ 9 de CLAUDE.md).

---

## 6. Ticket envoyé directement à Pennylane (question du 12/10/2026)

- **Possible : oui, techniquement.** L'API Pennylane permet de déposer un fichier
  (`/file_attachments`) puis de créer une facture fournisseur à partir de ce fichier
  (import de facture fournisseur). Le site a déjà la lecture des justificatifs par IA
  (`lire-facture`) pour pré-remplir fournisseur, date, montants.
- **« Par le compte de Mohammed » : pas tel quel.** Le site parle à Pennylane avec **un seul
  jeton API de la société** (`PENNYLANE_API_TOKEN`) : chez Pennylane, le dépôt apparaît
  « via l'API », pas « par Mohammed ». On peut en revanche :
  - noter « saisi par Mohammed » (et « payé par Mohammed ») dans le libellé / la note ;
  - limiter le bouton « Envoyer à Pennylane » au compte de Mohammed (droit dédié).
- **[À DÉCIDER] — c'est la vraie question comptable :**
  - payé avec la **carte de la société** → facture fournisseur normale ;
  - payé **de sa poche** → c'est une **note de frais** (remboursement à Mohammed ou compte
    courant d'associé), à traiter autrement chez Pennylane.
- **[À VÉRIFIER]** avant de coder : le champ exact de l'API pour l'import et les droits du
  jeton actuel (lecture seule aujourd'hui côté fournisseurs).
- Anti-doublon obligatoire : la charge créée garde l'id Pennylane, sinon `pennylane-sync` la
  réimporterait une seconde fois.

---

## 7. Questions ouvertes (à trancher avant S1 / S2)
1. Tarif payé au salarié par colis **point relais** ? Et les colis **domicile** : au colis
   aussi (tarif ?) ou dans le salaire ?
2. Le client (D FAST) paie-t-il le **même prix** pour un colis relais et un colis domicile ?
3. Compter les **retours / non livrés** ?
4. Un salarié peut-il travailler pour **deux clients** le même jour ?
5. **Clôture du mois** : qui la fait, et quand (avant l'envoi au cabinet de paie) ?
6. Ticket Mohammed : carte société ou note de frais ?
7. LIC (livret individuel de contrôle) : à confirmer avec l'expert-comptable.

## 8. À tester (à compléter par lot)
- Salarié : voit sa fiche seulement ; ne lit ni les salaires ni les heures des autres.
- Journée envoyée puis validée : le salarié ne peut plus ni modifier ni supprimer (même par
  appel direct à la base).
- Correction bureau : déclaré et validé tous les deux visibles.
- Rapport mensuel = somme des journées validées ; relevé client = même total.
- Contrôle SMIC en rouge si le montant au colis ne couvre pas les heures.
