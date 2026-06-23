-- Migration : trigger qui dérive tva_rate des montants pour les charges Pennylane.
-- Déclenchement BEFORE INSERT OR UPDATE → écrase tva_rate avant l'écriture.
-- Les charges manuelles (pennylane_id IS NULL) ne sont JAMAIS touchées.
-- Indépendant du déploiement Edge Function.

-- ── UP ────────────────────────────────────────────────────────────────────────

create or replace function public.derive_pennylane_tva_rate()
returns trigger
language plpgsql
as $$
declare
  abs_ht    numeric;
  abs_tva   numeric;
  raw       numeric;
  best      numeric := null;
  best_dist numeric := 9999;
  s         numeric;
  d         numeric;
  standards numeric[] := array[0, 5.5, 10, 19, 20];
begin
  -- Charges manuelles : intouchables.
  if NEW.pennylane_id is null then
    return NEW;
  end if;

  abs_ht  := abs(coalesce(NEW.montant_ht_cts, 0));
  abs_tva := abs(coalesce(NEW.tva_cts, 0));

  -- TVA nulle ou HT nul → exonéré / régime de la marge.
  if abs_ht = 0 or abs_tva = 0 then
    NEW.tva_rate := 0;
    return NEW;
  end if;

  -- Taux brut avec 1 décimale.
  raw := round(abs_tva::numeric / abs_ht * 1000) / 10.0;

  -- Calage sur le standard le plus proche ±1,5.
  foreach s in array standards loop
    d := abs(raw - s);
    if d <= 1.5 and d < best_dist then
      best_dist := d;
      best := s;
    end if;
  end loop;

  -- Hors tolérance → taux brut (jamais null).
  NEW.tva_rate := coalesce(best, raw);
  return NEW;
end;
$$;

-- Trigger BEFORE INSERT OR UPDATE (remplace l'éventuel existant).
drop trigger if exists trg_charges_derive_tva_rate on public.charges;
create trigger trg_charges_derive_tva_rate
  before insert or update on public.charges
  for each row execute function public.derive_pennylane_tva_rate();

-- Backfill : déclenche le trigger sur toutes les charges Pennylane existantes.
update public.charges
   set tva_cts = tva_cts
 where pennylane_id is not null;

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- drop trigger if exists trg_charges_derive_tva_rate on public.charges;
-- drop function if exists public.derive_pennylane_tva_rate();
