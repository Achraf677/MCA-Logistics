-- Migration : distingue les IMMOBILISATIONS des charges d'exploitation
-- Contexte   : la facture AC Automobiles (achat Opel Movano FG-788-FB,
--              pennylane_id='22915027578880') est un investissement (compte
--              PCG 21x), pas une charge — elle était comptée à tort dans les
--              charges (charges surestimées de 8 600 € TTC, TVA déductible
--              surestimée de 1 433 €). On garde la ligne en base (traçabilité,
--              lien Pennylane, rapprochement Qonto conservé) mais on l'exclut
--              de TOUS les calculs de charges d'exploitation via ce flag.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
-- Additive, nullable évité (NOT NULL DEFAULT false) — aucune charge existante
-- n'est réinterprétée, sauf la ligne ciblée par l'UPDATE ci-dessous (idempotent).

alter table public.charges
  add column if not exists est_immobilisation boolean not null default false;

comment on column public.charges.est_immobilisation is
  'true = investissement (PCG 20x/21x/23x/24x), pas une charge d''exploitation.
   La ligne reste en base (historique Pennylane, rapprochement Qonto) mais est
   exclue de tous les totaux/compteurs de charges (KPI, TVA déductible,
   compteur à rapprocher). Masquée par défaut dans la liste Charges.';

-- Index partiel : la requête courante est "charges NON immobilisation"
-- (l'inverse, quasi tout le temps) — un index sur est_immobilisation=true
-- sert le cas rare "afficher les immobilisations" sans alourdir le cas courant.
create index if not exists idx_charges_est_immobilisation
  on public.charges (company_id)
  where est_immobilisation = true;

-- ── Correction ponctuelle : facture Opel Movano déjà en base ────────────────
-- Idempotent (WHERE sur pennylane_id + company_id) — sans risque à rejouer.
update public.charges
set est_immobilisation = true
where pennylane_id = '22915027578880'
  and company_id = (select id from public.companies where siret like '10289809500017%' limit 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   drop index if exists public.idx_charges_est_immobilisation;
--   alter table public.charges drop column if exists est_immobilisation;
--
-- Perte : le marquage immobilisation (dont la correction Movano) est perdu —
-- la charge Movano redeviendrait comptée comme une charge d'exploitation.
