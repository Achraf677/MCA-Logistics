-- Migration : ajout de la colonne `extra_lines` sur `deliveries`
-- Objectif   : permettre de rattacher N lignes supplémentaires (attente,
--              retour à vide, forfait, etc.) à une livraison — toutes
--              regroupées sur la même facture Pennylane, un seul numéro.
-- Application : npx supabase db push (NE PAS appliquer manuellement).
-- Additive et nullable via DEFAULT '[]' : lignes existantes → tableau vide.

alter table public.deliveries
  add column if not exists extra_lines jsonb not null default '[]'::jsonb;

comment on column public.deliveries.extra_lines is
  'Tableau JSON de lignes supplémentaires facturables. Chaque objet :
   { label:text, quantity:number, amount_ht_cts:integer, tva_rate:number }.
   Toutes les lignes vont sur la même facture Pennylane que la ligne principale.';
