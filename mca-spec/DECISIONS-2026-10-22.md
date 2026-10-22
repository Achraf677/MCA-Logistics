# Décisions du 22/10/2026 (refonte par onglet)

## Validées par l'utilisateur
- Zoom : 16 px max, 12 px min. Écran de travail : 1920×1080 à 125 %.
- Pilotage : CA du mois en « héro » rouge, À facturer or, À encaisser bleu. Période du graphique : on garde la roue. Thème : rouge/noir seulement. Charte appliquée à TOUS les onglets. `LineChart.tsx` supprimé (confirmé inutilisé).
- Mes courses : retiré du menu pour tout compte non-salarié (admin, DG, comptable, président). Le président aura sa propre interface chauffeur (à créer).
- Suppression d'une tournée de colis non clôturée : autorisée même avec arrêts traités, double confirmation, fonction serveur autorisée (touche aux droits : accord donné).
- Localisation : démarrage auto si permission déjà accordée + interrupteur dans Moi.
- Dépenses : liste par mois, total du mois = toutes les dépenses, avec filtre.
- Feuilles de route : conservées à vie, visibles salarié ET bureau.
- Toutes les photos : gardées en qualité d'origine, jamais perdues (voir archivage ci-dessous).
- Lettre de voiture : supprimée (CMR papier). Modèles : onglet supprimé. Bandeau « pour la lettre de voiture » : supprimé. Signatures chauffeur : retirées de Mes courses.
- Anciennes données : tout reste en base. Nouvel onglet « Archives » (tri / renommage par IA) à concevoir plus tard.
- Lecture IA (Mistral → Claude) : EN SUSPENS.

## À proposer / à faire
- Archivage photos : original conservé tel quel (octet pour octet), copie web pour l'affichage, archive compressée sans perte réversible.

## Réponses du 22/10/2026 (suite)
- Livraisons : statut devis « expiré » gardé tel quel ; tuiles « Courses » + « CA HT » fusionnées ; Preuves & documents = une page.
- Planning : retrait express COMPLET (B) ; plus de bandeau express dans Mes courses (l'express passe par Tournées) ; pas d'heure de début, pas de km réels (enlever), pas de pointage dépôt ; résumé « Tournées de colis » de la vue Jour = beau résumé cliquable ; export CSV.
- Équipe : tarifs domicile/relais retirés ; `get_heures` retiré de l'assistant ; salaire brut masqué en liste.
- Tiers/Système : Devis reste dans Livraisons ; Clients : masquer particuliers jetables + sans livraison récente ; Paramètres : Apparence + Compte fusionnés ; Admins : salariés séparés des administrateurs ; tailles de texte corrigées écran par écran (mobile + PC).
- Finance : rapprochement Qonto par ligne retiré ; tuile « À encaisser » RETIRÉE (Dashboard) ; vérif paiements Pennylane : on teste, on redemande l'avis plus tard ; ventilation = TVA par ligne + complète + automatique par IA (lit tickets/factures, demande validation) ; Charges : mois courant ouvert ; Justificatifs : même droit que Charges, « Validé » distinct, « Remboursé » vu du salarié, ancien ticket corrigé un par un, validation sans montant refusée ; transfert Pennylane (cartes ET notes de frais) → « Factures fournisseur » à traiter + commentaire depuis l'app : à étudier EN DÉTAIL TOUT À LA FIN (API, pas d'adresse e-mail de dépôt).
- Flotte : tables Inspections et Incidents SUPPRIMÉES (à recréer plus tard selon la réalité) ; entretiens existants = TOUS en TTC → l'IA reprend ticket par ticket, l'utilisateur vérifie et valide (comme carburant / consommables) ; ticket mixte ventilé par le président seul ; TVA repas 100 % déductible, saisie identique à Pennylane ; tout en HT (prix au litre, conso) sauf trésorerie ; Véhicules : réparer l'Export (CSV utile, à améliorer).
- IA (lecture des lignes de facture, complétion, validation) : à travailler et proposer.
