-- Migration : marquer les livraisons dont le RETRAIT doit être fait en tournée
-- Contexte   : une tournée ne listait que les adresses de livraison. Or
--              certaines courses imposent d'aller d'abord chercher la
--              marchandise — et pas toutes : quand le colis est déjà au dépôt,
--              un arrêt de retrait n'aurait aucun sens et ferait perdre du
--              temps au chauffeur. Il faut donc pouvoir cocher au cas par cas.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
--
-- Pourquoi une colonne et pas une déduction automatique : la présence d'une
-- `pickup_address` ne dit RIEN de l'endroit où se trouve la marchandise au
-- moment de la tournée. Elle est renseignée sur presque toutes les courses,
-- y compris celles dont le colis est déjà chargé. Seul l'humain le sait.
--
-- Pas de géocodage : `deliveries` n'a pas de pickup_lat/pickup_lng, seule
-- l'adresse de livraison est géocodée. Les liens de navigation vers un retrait
-- passent donc par l'adresse écrite — moins précis, et c'est la seule option
-- sans campagne de géocodage rétroactive.

-- UP -------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists retrait_a_faire boolean not null default false;

comment on column public.deliveries.retrait_a_faire is
  'true = la tournée doit inclure un arrêt à `pickup_address` avant la
   livraison. Coché à la main, jamais déduit : la présence d''une adresse de
   retrait ne dit pas si la marchandise est encore là-bas ou déjà au dépôt.
   N''a aucun effet sur la facturation ni sur la machine à états.';

-- Index partiel : la question posée est « quelles courses de cette tournée
-- demandent un retrait », jamais « lesquelles n''en demandent pas ».
create index if not exists deliveries_retrait_a_faire_idx
  on public.deliveries (tour_id)
  where retrait_a_faire = true;

-- DOWN -----------------------------------------------------------------------
-- alter table public.deliveries drop column if exists retrait_a_faire;
