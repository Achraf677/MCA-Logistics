# ONGLET — 20 · BROUILLONS IA

_Assistant de rédaction. Onglet **Système**. Aide l'utilisateur à rédiger des textes pros
(relances, emails, annonces) à partir d'une saisie libre, via Gemini. Lecture seule, zéro écriture base._

## ① Rôle
Fournir un assistant de rédaction : l'utilisateur tape une demande en langage naturel, choisit un
type de texte, et reçoit un brouillon prêt à copier. Aucune persistance : on génère, on copie, fin.

## ② Parti pris
- **Provider Gemini** (`gemini-2.5-flash`) via Edge Function `brouillons-generate`. Le front
  n'appelle QUE `supabase.functions.invoke`. Clé `GEMINI_API_KEY` côté serveur uniquement.
- **Saisie libre + types prédéfinis** : un sélecteur (Relance impayé / Email client / Annonce
  recrutement / Libre) oriente le `systemPrompt` ; le corps reste ce que tape l'utilisateur.
- **Lecture seule** : aucune écriture en base, aucune table. Pas de Drawer.
- L'IA ne doit jamais inventer noms/montants : consigne explicite dans le `systemPrompt`.

## ③ Données
Aucune table. Aucune requête base. L'onglet ne lit ni n'écrit Postgres.

## ④ RGPD (v1 — non négociable)
- **Saisie libre uniquement.** AUCUNE donnée de la base (clients, montants, livraisons…) n'est
  injectée dans les prompts. C'est l'utilisateur qui rédige son texte.
- Note visible dans l'UI : « N'écris pas de données client sensibles ici (IA gratuite) ».
- La clé API ne transite jamais par le navigateur ni les logs (header `x-goog-api-key` côté Edge).

## ⑤ Secrets
| Clé | Usage |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio — auth de l'appel `generateContent` |

## ⑥ Actions / commandes
- Sélectionner un type → tape la demande → **Générer** → résultat affiché → **Copier**.
- `supabase functions deploy brouillons-generate` ; `supabase secrets set GEMINI_API_KEY=…`.

## ⑦ Logique
- `brouillons.logic.ts` : libellés des types (fonctions pures, sans DB ni DOM).
- Edge `brouillons-generate` : choisit le `systemPrompt` selon `type`, appelle
  `generateText(key, systemPrompt, prompt)`, renvoie `{ ok:true, data:{ text } }`.

## ⑧ États & cas limites
- `prompt` vide → 400 (front : bouton désactivé).
- `GEMINI_API_KEY` absente → 500 `{ ok:false, error:'missing GEMINI_API_KEY' }`.
- API Gemini en erreur/timeout → 502 (toast côté front).
- Réponse vide → texte vide ; le front affiche ce qui revient sans crash.

## ⑨ Dépendances
- **Consomme** : `_shared/{cors,http}.ts`, `_shared/gemini.ts`, secret `GEMINI_API_KEY`.
- **Partagé** : aucun couplage avec d'autres features.
- **Nourrit** : rien (outil autonome).
