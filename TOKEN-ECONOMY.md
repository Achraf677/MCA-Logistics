# TOKEN-ECONOMY.md — Économiser un MAX de tokens (workflow MCA)

> Règle mère : **le coût suit la taille du contexte, pas la longueur d'un message.**
> Chaque message renvoie TOUT l'historique en entrée. Un fil de 2 h coûte, au 201ᵉ message,
> autant que les 200 premiers réunis. Donc : garder le contexte court = économiser un max.

---

## A. Dans Claude Code (le plus gros poste)

1. **`/clear` entre deux tâches sans rapport.** Du contexte périmé se repaie à chaque message suivant. (Déjà notre règle entre étapes — la tenir strictement.)
2. **`/compact` au milieu d'une tâche longue**, sans attendre la limite. Vise ~40-50 % de contexte. Tu peux préciser quoi garder : `/compact garde le but, les fichiers changés, les commandes lancées, les erreurs`.
3. **Le bon modèle :** Sonnet par défaut (suffit pour coder), Opus seulement pour une vraie décision d'architecture, Haiku pour un sous-agent trivial. `/model` pour changer.
4. **Référencer les fichiers par chemin, ne jamais les coller.** « Lis `src/features/x/x.logic.ts` » coûte ~10 tokens ; coller le fichier en coûte des milliers, à chaque message tant qu'il reste dans le contexte.
5. **Une étape = uniquement ses fichiers.** Lister précisément quoi lire (on le fait déjà). Ne pas laisser Claude Code « explorer » tout le repo : ça remplit le contexte pour rien.
6. **Planifier avant de coder** sur une tâche complexe : lui faire écrire un court plan, valider, puis coder. Évite les tokens gaspillés en code mal orienté.
7. **`CLAUDE.md` lean.** Il est relu à chaque session : le garder court, et pointer vers les specs par lien plutôt que tout y recopier. (Le nôtre est déjà concis.)
8. **Commit + push souvent.** Permet de `/clear` sans peur : l'état vit sur GitHub, pas dans le contexte.

## B. Dans le chat de pilotage (claude.ai — ici)

9. **Ne pas faire un seul fil géant.** Ce fil-ci est déjà très long : chaque nouveau message le repaie en entier. **Ouvrir un nouveau chat par phase** (ex. « Phase intégrations »). La continuité est assurée par le **skill `mca-site`** + **`CLAUDE.md`**, pas par l'historique du chat.
10. **Coller le minimum.** Le retour de Claude Code : garder les hash, le critère d'arrêt, le bout de code à vérifier — pas le mur de logs.
11. **Demander une vérif ciblée**, pas « relis tout ». Quand je vais chercher sur GitHub, je ne lis que les fichiers de l'étape.
12. **Quand un fil devient lourd : me demander un « état des lieux » court** à copier dans un nouveau chat, puis repartir propre.

## C. Sous-agents Claude Code — utile mais à doser

- Un sous-agent tourne dans **son propre contexte** et **rend un résumé propre** : idéal pour décharger une lecture lourde (audit, recherche) sans polluer la session principale.
- ⚠️ **Mais** un workflow saturé de sous-agents peut consommer ~**7× plus de tokens** au total (chacun a son contexte). Donc :
  - ✅ Sous-agent pour : exploration/lecture massive isolée, vérifications répétitives.
  - ❌ Pas de sous-agent pour : une tâche couplée au reste, un calcul trivial, un budget serré (le mono-thread est moins cher).
- Sous-agent réutilisable = fichier `.claude/agents/<nom>.md`, déclenché via `/<nom>` ou `/agents`.

---

## Quick do / don't

| ✅ Faire | ❌ Éviter |
|---|---|
| `/clear` entre étapes | un fil de 3 h jamais nettoyé |
| référencer par chemin | coller des fichiers entiers |
| Sonnet par défaut | Opus pour tout |
| nouveau chat par phase | un seul méga-chat claude.ai |
| lister les fichiers de l'étape | « explore le repo » |
| commit + push puis `/clear` | clear avant d'avoir push |

## Ordre d'impact (du plus rentable au moins)
1. `/clear` + push fréquent (Claude Code)
2. Nouveau chat par phase (claude.ai)
3. Référencer au lieu de coller
4. Modèle adapté (Sonnet/Haiku)
5. `/compact` + plan avant code
6. Sous-agents (ciblés seulement)
