-- Fiche livraison unique (revue 03b, lot A) — colonnes ADDITIVES, toutes nullables
-- sauf `urgent` (défaut false). Ce que les Notes portaient à la main devient une case.
--
-- UP
alter table public.deliveries
  add column if not exists prestation text
    check (prestation in ('express', 'messagerie', 'dediee', 'mise_a_dispo', 'forfait')),
  add column if not exists reference_client text,
  add column if not exists urgent boolean not null default false,
  add column if not exists creneau_retrait_debut time,
  add column if not exists creneau_retrait_fin time,
  add column if not exists creneau_livraison_debut time,
  add column if not exists creneau_livraison_fin time,
  add column if not exists volume_m3 numeric(8, 2) check (volume_m3 is null or volume_m3 >= 0),
  add column if not exists duree_min integer check (duree_min is null or duree_min >= 0),
  add column if not exists note_interne text;

comment on column public.deliveries.prestation is 'Type de prestation : décide des champs de la fiche (null = ancienne course, traitée comme express).';
comment on column public.deliveries.reference_client is 'Référence du donneur d''ordre (ODT, n° de commande) — reprise sur la facture.';
comment on column public.deliveries.notes is 'Consignes chauffeur (visibles dans Mes courses).';
comment on column public.deliveries.note_interne is 'Note interne bureau — jamais affichée au chauffeur.';
comment on column public.deliveries.duree_min is 'Durée de trajet estimée (IGN), en minutes.';

-- DOWN
-- alter table public.deliveries
--   drop column if exists prestation, drop column if exists reference_client,
--   drop column if exists urgent,
--   drop column if exists creneau_retrait_debut, drop column if exists creneau_retrait_fin,
--   drop column if exists creneau_livraison_debut, drop column if exists creneau_livraison_fin,
--   drop column if exists volume_m3, drop column if exists duree_min,
--   drop column if exists note_interne;
-- comment on column public.deliveries.notes is null;
