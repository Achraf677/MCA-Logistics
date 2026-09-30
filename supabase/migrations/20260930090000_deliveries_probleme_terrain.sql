-- UP
-- Revue 01 « Mes courses » : le chauffeur peut signaler un ÉCHEC sur un arrêt
-- (absent, refus, adresse introuvable…). Le STATUT n'est pas touché : la
-- course reste ouverte (planifiee / en_cours), le bureau est alerté et décide
-- (relivraison, retour dépôt, annulation). Machine à états inchangée.
alter table public.deliveries
  add column if not exists probleme_motif text
    check (probleme_motif in ('absent', 'refus', 'adresse_introuvable', 'acces_impossible', 'endommage', 'autre')),
  add column if not exists probleme_note text,
  add column if not exists probleme_le timestamptz;

comment on column public.deliveries.probleme_motif is 'Dernier problème signalé sur le terrain (null = aucun).';
comment on column public.deliveries.probleme_le is 'Horodatage du signalement ; null une fois levé.';

-- DOWN
-- alter table public.deliveries
--   drop column if exists probleme_le,
--   drop column if exists probleme_note,
--   drop column if exists probleme_motif;
