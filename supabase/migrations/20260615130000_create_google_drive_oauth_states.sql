-- ARCHIVE : déjà appliquée en prod. Ne pas relancer via db push.
create table public.google_drive_oauth_states (
  state       text primary key,
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '15 minutes')
);
alter table public.google_drive_oauth_states enable row level security;
