-- Interrupteur d'accès au Drive, par compte. Éteint par défaut.
-- Le président a toujours accès via son rôle (la garde Edge = role='president' OR drive_access).
alter table public.profiles
  add column drive_access boolean not null default false;

comment on column public.profiles.drive_access is 'Autorise ce compte à accéder aux fonctions Drive (fichiers). Accordé/retiré par le président uniquement. Le président a toujours accès via son rôle.';
