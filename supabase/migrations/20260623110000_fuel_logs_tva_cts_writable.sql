-- Migration : rend fuel_logs.tva_cts inscriptible
-- La colonne était GENERATED ALWAYS AS (round(total_cts*tva_rate/120)) —
-- le /120 est codé en dur pour 20 %, ce qui donne un résultat faux à 19 % (DE).
-- On la remplace par un integer nullable ordinaire écrit par l'application.

-- ── UP ────────────────────────────────────────────────────────────────────────

-- 1. Supprimer la colonne générée
alter table public.fuel_logs drop column if exists tva_cts;

-- 2. Recréer en integer nullable simple
alter table public.fuel_logs add column tva_cts integer;

-- 3. Backfill avec la formule correcte (taux libre, pas /120 fixe)
--    20 % → /120 comme avant ; 19 % → /119 ; toute autre valeur → exact
update public.fuel_logs
   set tva_cts = round(total_cts::numeric * tva_rate / (100 + tva_rate))
 where tva_rate is not null
   and tva_rate > 0;

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- alter table public.fuel_logs drop column if exists tva_cts;
-- alter table public.fuel_logs
--   add column tva_cts integer generated always as (round(total_cts * tva_rate / 120)) stored;
