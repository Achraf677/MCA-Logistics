# 08 — Équipe (Membres, À valider, Journées, Rapports, Heures)

## 3 Écran (refonte du 24/10/2026, onglet Membres)
- Tuiles cliquables : membres actifs · masse salariale mois / an · à régulariser (filtre permis / visite).
- `BarreRecherche` (nom, rôle) + `ListeDeroulante` (rôle, contrat) + `PastilleFiltre` (actifs) + « Tout réinitialiser ».
- Lignes : `AvatarInitiales`, pastille d'échéance (permis / visite), aptitude, chevron ; cartes sur mobile.
- Fiche membre : rôle et contrat en `ListeDeroulante`. Onglets À valider / Journées / Rapports : filtres salarié, client, statut en `ListeDeroulante` (recherche intégrée dès 7 choix).

## 8 Reste
- Fiche membre (428 lignes) : blocs et validation progressive à relire ; accès au site (`AccesSite`) ; onglet Heures (LIC papier, à décider : retirer ?).

## Fiche membre (refonte du 24/10/2026)
- Tiroir large, en-tête (avatar, poste, contact, badges Actif / contrat / aptitude), 4 onglets en pastille : **Fiche · Activité · Documents · Accès**. L'ancien onglet « Validités » est fondu dans la fiche (bloc « Conduite et validités », chauffeurs seulement, avec voyant par date).
- Fiche en blocs : Identité (nom*, téléphone, e-mail, adresse, contact d'urgence) · Poste et contrat (rôle, fonction, contrat, salaire, entrée / sortie, coefficient ; IDCC 16 non saisi) · Conduite et validités · Messagerie (payé au colis) · Notes. Barre d'actions collée en bas ; désactivation avec date de sortie.
- Migration `20261024100000_team_members_adresse_urgence_notes` (adresse, `contact_urgence_nom`, `contact_urgence_tel`, `notes`) appliquée ; Mes courses liste ses colonnes : le salarié ne les voit pas dans l'appli.
- Accès au site : blocs Compte de connexion (badge actif / coupé), Mot de passe, Connexion ; création par bascule « mot de passe / invitation ».

## Suppressions (24/10/2026)
- Onglets À valider, Journées, Rapports, Heures supprimés (fichiers, alerte `journees-a-valider`, catalogue de droits, `features/heures`, `shared/lib/journeesColis.queries.ts`). Restent en code (utilisés ailleurs) : `shared/lib/journeesColis.ts` (livraisons : colis des journées, Mes courses) à nettoyer avec Mes courses.
- Fiche membre : plus de bloc Messagerie, de Notes, d'onglet Documents (le futur onglet Documents global les remplace).
