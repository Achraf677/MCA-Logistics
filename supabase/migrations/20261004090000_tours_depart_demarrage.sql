-- Migration : heure de départ et heure de démarrage réelle des tournées (lot T3,
-- revue 04a Tournées).
-- Contexte :
--   - l'optimiseur partait toujours à 08:00 : l'heure de départ du dépôt est
--     désormais choisie à l'écran et gardée sur la tournée (`heure_depart`) ;
--   - « Démarrer » ne laissait aucune trace : l'heure de début des heures du
--     chauffeur était devinée depuis `updated_at`. `started_at` est posé par la
--     BASE au passage en `en_cours` (trigger), pour les deux écrans qui
--     démarrent une tournée (Tournées au bureau, Mes courses au téléphone).
-- Additive : deux colonnes nullables + un trigger. Aucune donnée réécrite.

-- UP -------------------------------------------------------------------------

alter table public.tours
  add column if not exists heure_depart time,
  add column if not exists started_at timestamptz;

comment on column public.tours.heure_depart is
  'Heure de départ du dépôt utilisée par l''optimisation (Edge optimize-tours). null = ancienne tournée (08:00).';
comment on column public.tours.started_at is
  'Horodatage du premier passage en `en_cours` (trigger tours_started_at). Jamais écrit par le front.';

create or replace function public.tours_pose_started_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'en_cours'
     and (tg_op = 'INSERT' or old.status is distinct from 'en_cours')
     and new.started_at is null then
    new.started_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tours_started_at on public.tours;
create trigger tours_started_at
  before insert or update of status on public.tours
  for each row execute function public.tours_pose_started_at();

-- DOWN -----------------------------------------------------------------------
-- drop trigger if exists tours_started_at on public.tours;
-- drop function if exists public.tours_pose_started_at();
-- alter table public.tours drop column if exists started_at;
-- alter table public.tours drop column if exists heure_depart;
