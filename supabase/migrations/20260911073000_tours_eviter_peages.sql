-- Migration : option « éviter les péages » par tournée
-- Contexte   : demande de l'utilisateur, réglage par tournée et non global.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
-- Additive, NOT NULL DEFAULT false : aucune tournée existante n'est
-- réinterprétée.
--
-- CE QUE CE RÉGLAGE FAIT, ET CE QU'IL NE FAIT PAS :
--   - Il est transmis aux liens de navigation (Google Maps `avoid=tolls`,
--     Waze `avoid_tolls=true`), tous deux documentés. C'est là que ça compte :
--     c'est l'application du chauffeur qui choisit la route réelle.
--   - Il n'influence PAS l'ordre des arrêts calculé par l'optimisation. Ce
--     calcul passe par l'endpoint /optimization d'OpenRouteService, qui repose
--     sur Vroom : son schéma n'expose aucune option d'évitement (seul le
--     `profile` du véhicule est paramétrable). Vérifié dans la documentation
--     Vroom le 11/09/2026. Ne pas promettre le contraire dans l'interface.

-- UP -------------------------------------------------------------------------

alter table public.tours
  add column if not exists eviter_peages boolean not null default false;

comment on column public.tours.eviter_peages is
  'true = les liens de navigation de cette tournée demandent d''éviter les
   péages (Google Maps avoid=tolls, Waze avoid_tolls=true). N''affecte PAS
   l''optimisation de l''ordre des arrêts : le moteur Vroom utilisé par
   OpenRouteService n''offre aucune option d''évitement.';

-- DOWN -----------------------------------------------------------------------
-- alter table public.tours drop column if exists eviter_peages;
