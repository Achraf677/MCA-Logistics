-- Migration : lecture d'une feuille de route EN ARRIÈRE-PLAN (côté serveur).
-- Avant : la lecture page par page tournait dans le navigateur ; changer d'onglet ou quitter le site
--   la coupait. Maintenant : le salarié (ou le bureau) envoie les photos, l'Edge `scanner-feuille-route`
--   les lit une à une SANS le navigateur ; l'écran suit l'avancement et, au retour, retrouve le scan
--   (en cours ou prêt). Ce ne sont PAS des tournées : la tournée n'est créée qu'au clic « Créer la
--   tournée » (le scan passe alors à `termine`, les images sont effacées).
-- Droits : comme `tournees_colis` (salarié : SES scans ; bureau : droit `planning.tournees`).
-- L'Edge écrit les résultats avec la clé de service (aucune écriture de résultat côté navigateur).
-- Additive et réversible (DOWN en bas). Application MCP : UNE instruction par appel.

-- UP -------------------------------------------------------------------------

create table if not exists public.scans_feuille_route (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  date date not null,
  client_id uuid references public.clients(id) on delete set null,
  statut text not null default 'en_cours' check (statut in ('en_cours', 'pret', 'erreur', 'termine', 'annule')),
  erreur text,
  tournee_id uuid references public.tournees_colis(id) on delete set null,
  battement timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scans_feuille_route_member_idx on public.scans_feuille_route (member_id, statut);

create table if not exists public.scans_feuille_route_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans_feuille_route(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  numero integer not null check (numero >= 1),
  etat text not null default 'attente' check (etat in ('attente', 'lecture', 'ok', 'erreur')),
  image text,
  erreur text,
  nb integer,
  page_lue jsonb,
  entete jsonb,
  arrets jsonb,
  commune_fin text,
  updated_at timestamptz not null default now(),
  unique (scan_id, numero)
);

alter table public.scans_feuille_route enable row level security;

alter table public.scans_feuille_route_pages enable row level security;

create policy scans_feuille_route_all on public.scans_feuille_route for all to authenticated
  using (company_id = (select public.current_company_id()) and (
    (select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
    or member_id = (select public.ma_fiche_equipe())))
  with check (company_id = (select public.current_company_id())
    and member_id in (select tm.id from public.team_members tm where tm.company_id = (select public.current_company_id()))
    and (client_id is null or client_id in (select k.id from public.clients k where k.company_id = (select public.current_company_id())))
    and ((select public.is_president()) or (select public.has_permission('planning.tournees', 'update'))
      or member_id = (select public.ma_fiche_equipe())));

create policy scans_feuille_route_pages_all on public.scans_feuille_route_pages for all to authenticated
  using (company_id = (select public.current_company_id())
    and scan_id in (select s.id from public.scans_feuille_route s))
  with check (company_id = (select public.current_company_id())
    and scan_id in (select s.id from public.scans_feuille_route s));

-- DOWN (à garder en commentaire) ----------------------------------------------
-- drop table if exists public.scans_feuille_route_pages;
-- drop table if exists public.scans_feuille_route;
