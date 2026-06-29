-- Backfill : recalcule price_per_liter_milli depuis total_cts ÷ liters.
-- La migration 20260623170000 avait fait ×10 sur les centimes arrondis (ex. 174×10=1740).
-- Ce recalcul donne le vrai millième : round(total_cts × 10.0 / liters)
-- Ex. total=2000 cts, liters=11.50 → round(20000/11.50) = 1739 ✓

-- ── UP ────────────────────────────────────────────────────────────────────────

update public.fuel_logs
  set price_per_liter_milli = round(total_cts * 10.0 / liters)
  where liters > 0;

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- (non réversible de façon fiable — l'arrondi original est perdu)
