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
