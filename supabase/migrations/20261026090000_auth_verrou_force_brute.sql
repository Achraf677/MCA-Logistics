-- Protection force brute : verrou de compte côté serveur.
-- Branché sur le hook Auth « Password verification attempt » (Dashboard → Authentication → Hooks).
-- Tant que le hook n'est pas activé, la fonction est inerte (rien ne l'appelle).
-- Paliers : 5 échecs = 5 min · 10 = 30 min · 15 et + = 2 h. Les échecs plus vieux que 15 min repartent de zéro.
-- Un compte verrouillé refuse même le BON mot de passe (sinon l'attaquant continue d'essayer).
-- Un e-mail inconnu n'a pas de user_id : la limite par IP de Supabase Auth s'en charge.

create table if not exists public.auth_echecs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  echecs         integer     not null default 0,
  dernier_echec  timestamptz,
  verrou_jusqua  timestamptz
);
alter table public.auth_echecs enable row level security;
-- Aucune policy : seule la fonction (security definer) y touche.

create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := (event->>'user_id')::uuid;
  ok      boolean := coalesce((event->>'valid')::boolean, false);
  ligne   public.auth_echecs%rowtype;
  n       integer;
  minutes integer;
begin
  select * into ligne from public.auth_echecs where user_id = uid for update;

  if found and ligne.verrou_jusqua is not null and ligne.verrou_jusqua > now() then
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'Compte verrouillé pour cause de tentatives répétées. Réessaie dans '
        || greatest(1, ceil(extract(epoch from (ligne.verrou_jusqua - now())) / 60))::int || ' min.'
    );
  end if;

  if ok then
    delete from public.auth_echecs where user_id = uid;
    return jsonb_build_object('decision', 'continue');
  end if;

  n := case
         when found and ligne.dernier_echec > now() - interval '15 minutes' then ligne.echecs + 1
         else 1
       end;
  minutes := case when n >= 15 then 120 when n >= 10 then 30 when n >= 5 then 5 else 0 end;

  insert into public.auth_echecs (user_id, echecs, dernier_echec, verrou_jusqua)
  values (uid, n, now(), case when minutes > 0 then now() + make_interval(mins => minutes) end)
  on conflict (user_id) do update
    set echecs = excluded.echecs,
        dernier_echec = excluded.dernier_echec,
        verrou_jusqua = excluded.verrou_jusqua;

  return jsonb_build_object('decision', 'continue');
end;
$$;

revoke all on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;

-- DOWN
-- drop function if exists public.hook_password_verification_attempt(jsonb);
-- drop table if exists public.auth_echecs;
