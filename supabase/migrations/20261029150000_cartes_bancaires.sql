-- Cartes bancaires gérées dans Système : liste modifiable, actives à partir / jusqu'à une date. Additive.
-- `receipts_inbox.carte` et `pleins_carburant.carte` pointent désormais vers `cartes_bancaires.code`
-- (on delete restrict : une carte déjà utilisée ne peut pas être supprimée, seulement rendue inactive).
create table if not exists public.cartes_bancaires (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null unique,
  nom text not null,
  fin text not null,
  type text not null check (type in ('societe', 'carburant')),
  actif_a_partir_du date,
  inactif_a_partir_du date,
  created_at timestamptz not null default now(),
  constraint cartes_bancaires_dates_check check (actif_a_partir_du is null or inactif_a_partir_du is null or inactif_a_partir_du > actif_a_partir_du)
);
alter table public.cartes_bancaires enable row level security;
-- Lecture : toute la société (le salarié choisit sa carte). Écriture : président ou droit Système › Paramètres.
create policy cartes_bancaires_select on public.cartes_bancaires for select to authenticated
  using (company_id = (select current_company_id()));
create policy cartes_bancaires_insert on public.cartes_bancaires for insert to authenticated
  with check (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'update')));
create policy cartes_bancaires_update on public.cartes_bancaires for update to authenticated
  using (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'update')));
create policy cartes_bancaires_delete on public.cartes_bancaires for delete to authenticated
  using (company_id = (select current_company_id()) and (is_president() or has_permission('systeme.parametres', 'update')));

insert into public.cartes_bancaires (company_id, code, nom, fin, type)
select c.id, v.code, v.nom, v.fin, v.type
from public.companies c
cross join (values
  ('qonto_4103', 'QONTO', '4103', 'societe'),
  ('pennylane_4393', 'PENNYLANE', '4393', 'societe'),
  ('pennylane_5115', 'PENNYLANE', '5115', 'societe'),
  ('pennylane_8784', 'PENNYLANE', '8784', 'societe'),
  ('pennylane_8685', 'PENNYLANE', '8685', 'societe'),
  ('edenred_9156', 'EDENRED', '9156', 'carburant')
) as v(code, nom, fin, type)
on conflict (code) do nothing;

alter table public.receipts_inbox drop constraint if exists receipts_inbox_carte_check;
alter table public.pleins_carburant drop constraint if exists pleins_carburant_carte_check;
alter table public.receipts_inbox add constraint receipts_inbox_carte_fk
  foreign key (carte) references public.cartes_bancaires(code) on update cascade on delete restrict;
alter table public.pleins_carburant add constraint pleins_carburant_carte_fk
  foreign key (carte) references public.cartes_bancaires(code) on update cascade on delete restrict;

-- DOWN (en commentaire)
-- alter table public.pleins_carburant drop constraint if exists pleins_carburant_carte_fk;
-- alter table public.receipts_inbox drop constraint if exists receipts_inbox_carte_fk;
-- drop table if exists public.cartes_bancaires;
-- (puis remettre les check d'origine sur `carte` si besoin)
