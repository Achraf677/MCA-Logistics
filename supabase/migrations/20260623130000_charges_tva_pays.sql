-- Migration : ajoute tva_pays (FR/DE) dérivé du taux sur toutes les charges.
-- DE = 19 % (8e directive, compte 467) ; tout le reste = FR (CA3).
-- Recrée la fonction du trigger existant (même nom, même trigger).

-- ── UP ────────────────────────────────────────────────────────────────────────

alter table public.charges add column if not exists tva_pays text;

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
  -- ── 1. Taux TVA (Pennylane uniquement, dérivé des montants) ──────────────
  if NEW.pennylane_id is not null then
    abs_ht  := abs(coalesce(NEW.montant_ht_cts, 0));
    abs_tva := abs(coalesce(NEW.tva_cts, 0));

    if abs_ht = 0 or abs_tva = 0 then
      NEW.tva_rate := 0;
    else
      raw := round(abs_tva::numeric / abs_ht * 1000) / 10.0;

      foreach s in array standards loop
        d := abs(raw - s);
        if d <= 1.5 and d < best_dist then
          best_dist := d;
          best := s;
        end if;
      end loop;

      NEW.tva_rate := coalesce(best, raw);
    end if;
  end if;

  -- ── 2. Pays TVA (toutes charges, taux final) ─────────────────────────────
  NEW.tva_pays := case when NEW.tva_rate = 19 then 'DE' else 'FR' end;

  return NEW;
end;
$$;

-- Trigger déjà en place depuis la migration précédente — pas besoin de le recréer.
-- Si absent (env. fresh), on le recrée pour robustesse.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_charges_derive_tva_rate'
      and tgrelid = 'public.charges'::regclass
  ) then
    execute $t$
      create trigger trg_charges_derive_tva_rate
        before insert or update on public.charges
        for each row execute function public.derive_pennylane_tva_rate()
    $t$;
  end if;
end;
$$;

-- Backfill toutes les charges (manuelles + Pennylane) pour déclencher le trigger.
update public.charges set tva_cts = tva_cts;

-- ── DOWN (rollback) ───────────────────────────────────────────────────────────
-- alter table public.charges drop column if exists tva_pays;
-- (restaurer la version précédente de derive_pennylane_tva_rate si besoin)
