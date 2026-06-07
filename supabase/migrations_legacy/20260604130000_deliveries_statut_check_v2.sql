-- UP : remplace deliveries_statut_check par les 6 statuts v2.
-- Ancienne contrainte : ('brouillon','validee','facturee','payee','annulee')
-- Résidus en base    : uniquement 'payee' (2 lignes) — inclus dans les v2.
-- Aucune ligne existante n'est cassée par cette migration.
alter table public.deliveries
  drop constraint if exists deliveries_statut_check;

alter table public.deliveries
  add constraint deliveries_statut_check
  check (statut in (
    'planifiee',
    'en_cours',
    'livree',
    'facturee',
    'payee',
    'annulee'
  ));
