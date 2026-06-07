-- DOWN : restaure la contrainte d'origine (lue au diagnostic du 2026-06-04).
alter table public.deliveries
  drop constraint if exists deliveries_statut_check;

alter table public.deliveries
  add constraint deliveries_statut_check
  check (statut = any (array[
    'brouillon'::text,
    'validee'::text,
    'facturee'::text,
    'payee'::text,
    'annulee'::text
  ]));
