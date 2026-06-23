-- Migration : price_per_liter_cts (centimes) → price_per_liter_milli (millièmes d'euro).
-- Raison : 1,739 €/L stocké en centimes = 174 → affiché 1,740. En millièmes = 1739 → 1,739 ✓.
-- Conversion existant : * 10 (174 cts → 1740 milli). La 3e décimale perdue avant migration ne
-- peut pas être récupérée ; les nouvelles saisies seront fidèles.

-- ── UP ────────────────────────────────────────────────────────────────────────

alter table public.fuel_logs
  rename column price_per_liter_cts to price_per_liter_milli;

update public.fuel_logs
  set price_per_liter_milli = price_per_liter_milli * 10;

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- update public.fuel_logs set price_per_liter_milli = price_per_liter_milli / 10;
-- alter table public.fuel_logs rename column price_per_liter_milli to price_per_liter_cts;
