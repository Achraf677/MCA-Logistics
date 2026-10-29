-- Plein manuel : « Qui a mis le plein » (en plus de « Qui a fait le plein »). Additive.
alter table public.pleins_carburant add column if not exists mis_par uuid references public.team_members(id) on delete set null;

-- DOWN (en commentaire)
-- alter table public.pleins_carburant drop column if exists mis_par;
