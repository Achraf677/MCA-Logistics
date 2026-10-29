-- Plein manuel : qui a fait le plein (fiche Équipe) + toutes les cartes bancaires possibles. Additive.
alter table public.pleins_carburant drop constraint if exists pleins_carburant_carte_check;
alter table public.pleins_carburant add constraint pleins_carburant_carte_check
  check (carte is null or carte in ('qonto_4103', 'pennylane_4393', 'pennylane_5115', 'pennylane_8784', 'pennylane_8685', 'edenred_9156'));
alter table public.pleins_carburant add column if not exists fait_par uuid references public.team_members(id) on delete set null;

-- DOWN (en commentaire)
-- alter table public.pleins_carburant drop column if exists fait_par;
-- alter table public.pleins_carburant drop constraint if exists pleins_carburant_carte_check;
-- alter table public.pleins_carburant add constraint pleins_carburant_carte_check check (carte is null or carte in ('edenred_9156'));
