-- Migration : ventilation d'UNE facture en sous-lignes catégorisées
-- Objectif   : permettre de DÉCOMPOSER une charge unique (ex : 30 € Éléphant
--              Bleu = 10 € AdBlue + 20 € lave-glace) sans passer par une cible
--              Qonto/fuel/entretien — cas distinct du rapprochement existant
--              ("N charges → 1 cible"). On réutilise charge_allocations :
--              target_table/target_id deviennent NULL pour ces lignes
--              "ventilation pure" (charge_id + amount_cts + category_id + note
--              suffisent). `note` sert de libellé libre pour la sous-ligne.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
-- Additive : relâche une contrainte NOT NULL, ne supprime ni ne modifie aucune
-- donnée existante. Les allocations déjà en base (rapprochement 1-1 backfillé,
-- ventilations sur cible) restent valides (target_table/target_id renseignés).

alter table public.charge_allocations
  alter column target_table drop not null;

alter table public.charge_allocations
  alter column target_id drop not null;

comment on column public.charge_allocations.target_table is
  'Nom de la table cible (référence "polymorphe" via CHECK), ou NULL pour une
   ventilation "pure" (décomposition d''une charge en sous-lignes catégorisées,
   sans cible Qonto/fuel/entretien). target_id est l''uuid de la ligne cible
   correspondante, également NULL dans ce cas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   -- Il faut d'abord garantir qu'aucune ligne n'a target_table/target_id NULL
--   -- (sinon le SET NOT NULL échoue) :
--   -- delete from public.charge_allocations where target_table is null;
--   alter table public.charge_allocations alter column target_id set not null;
--   alter table public.charge_allocations alter column target_table set not null;
--
-- Perte : toutes les ventilations "pures" (sans cible) devront être supprimées
-- avant rollback — leurs sous-lignes seraient sinon rejetées par la contrainte.
