-- ARCHIVE : déjà appliquée en prod. Ne pas relancer via db push.
create table public.google_drive_tokens (
  company_id      uuid primary key references public.companies(id) on delete cascade,
  refresh_token   text not null,
  root_folder_id  text,
  connected_email text,
  scope           text,
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.google_drive_tokens enable row level security;
