-- Migration : détection des factures supprimées côté Pennylane
-- Objectif   : quand une facture fournisseur disparaît de la liste Pennylane
--              (supprimée là-bas), la charge locale est SIGNALÉE — jamais
--              supprimée automatiquement. L'utilisateur décide : supprimer de
--              l'app ou conserver (détachement Pennylane).
-- Application : npx supabase db push (NE PAS appliquer manuellement).
-- Additive, nullable — aucune donnée existante modifiée.

alter table public.charges
  add column if not exists pennylane_deleted_at timestamptz null;

comment on column public.charges.pennylane_deleted_at is
  'Horodatage de détection : la facture (pennylane_id) a disparu de la liste
   Pennylane lors d''un pennylane-sync. NULL = présente (ou jamais synchro).
   Si l''id réapparaît dans un sync ultérieur, la valeur repasse à NULL.
   Aucune suppression automatique — signalement uniquement.';

-- Index partiel pour le compteur "supprimées dans Pennylane" (peu de lignes).
create index if not exists idx_charges_pennylane_deleted
  on public.charges(pennylane_deleted_at)
  where pennylane_deleted_at is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   drop index if exists public.idx_charges_pennylane_deleted;
--   alter table public.charges drop column if exists pennylane_deleted_at;
--
-- Perte : les signalements de suppression détectés (recalculés au prochain sync).
