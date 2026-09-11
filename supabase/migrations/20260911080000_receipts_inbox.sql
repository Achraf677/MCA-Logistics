-- Migration : boîte de réception des tickets scannés par les chauffeurs
-- Contexte   : un chauffeur qui paie un péage, un plein ou une pièce doit
--              pouvoir photographier le ticket sur place. Aujourd'hui il n'a
--              aucun moyen de le transmettre : il le garde dans sa poche, et
--              le justificatif se perd ou arrive trois semaines plus tard.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
--
-- Une table dédiée plutôt qu'une catégorie de plus dans `documents` : ces
-- lignes ont un CYCLE DE VIE propre (à traiter → traité / ignoré) que
-- `documents` ne porte pas, et qu'on ne peut pas simuler sans ajouter un statut
-- à tous les documents du site.
--
-- Le fichier lui-même va dans le bucket `documents` déjà en place, sous le même
-- préfixe `<company_id>/…` — les policies de stockage existantes s'appliquent
-- donc telles quelles, rien à créer de ce côté.

-- UP -------------------------------------------------------------------------

create table if not exists public.receipts_inbox (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id),
  -- Qui a envoyé. On garde la trace même si le compte est supprimé ensuite :
  -- savoir qu'un ticket vient d'un chauffeur parti reste une information utile.
  uploaded_by   uuid references auth.users(id) on delete set null,
  storage_path  text not null,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  -- Mot du chauffeur (« péage A35 », « plein Movano »…). Facultatif.
  note          text,
  statut        text not null default 'a_traiter'
                check (statut in ('a_traiter', 'traite', 'ignore')),
  -- Charge créée à partir de ce ticket, quand il est traité.
  charge_id     uuid references public.charges(id) on delete set null,
  traite_at     timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.receipts_inbox is
  'Tickets et factures photographiés par les chauffeurs, en attente de
   traitement par la comptabilité. Cycle de vie : a_traiter → traite (une
   charge a été créée) ou ignore (doublon, illisible, hors activité).';

-- Index partiel : la question posée en permanence est « qu''est-ce qui reste à
-- traiter ». Les lignes traitées et ignorées s''accumulent sans être relues.
create index if not exists receipts_inbox_a_traiter_idx
  on public.receipts_inbox (company_id, created_at desc)
  where statut = 'a_traiter';

alter table public.receipts_inbox enable row level security;

-- Un chauffeur DÉPOSE dans sa société, et ne relit que ses propres dépôts.
-- Il n'a aucune raison de voir les tickets de ses collègues.
create policy receipts_inbox_insert_own on public.receipts_inbox
  for insert to authenticated
  with check (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and uploaded_by = auth.uid()
  );

create policy receipts_inbox_select on public.receipts_inbox
  for select to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (
      uploaded_by = auth.uid()
      or (select role from public.profiles where id = auth.uid())
         in ('president', 'dg', 'comptable')
    )
  );

-- Traiter ou ignorer est une décision comptable : pas au chauffeur de la
-- prendre, sinon un ticket gênant pourrait disparaître de la liste.
create policy receipts_inbox_update_gestion on public.receipts_inbox
  for update to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid())
        in ('president', 'dg', 'comptable')
  );

create policy receipts_inbox_delete_gestion on public.receipts_inbox
  for delete to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid())
        in ('president', 'dg', 'comptable')
  );

-- DOWN -----------------------------------------------------------------------
-- drop table if exists public.receipts_inbox;
