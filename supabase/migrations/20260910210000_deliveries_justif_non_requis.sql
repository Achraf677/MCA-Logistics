-- Migration : permet d'écarter une livraison de l'alerte "sans justificatif"
-- Contexte   : l'alerte se déclenche pour toute livraison livrée/facturée/payée
--              dépourvue de POD, de document lié et de lettre de voiture. Or
--              certaines courses n'appellent légitimement aucun justificatif
--              (course pour un particulier réglée sur place, dépannage interne,
--              refacturation d'un confrère…). Sans échappatoire, l'alerte reste
--              allumée indéfiniment et finit par être ignorée en bloc — ce qui
--              lui fait rater les vrais oublis.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
-- Additive, NOT NULL DEFAULT false : aucune livraison existante n'est
-- réinterprétée, l'alerte se comporte exactement comme avant pour tout le stock.

-- UP -------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists justif_non_requis boolean not null default false;

comment on column public.deliveries.justif_non_requis is
  'true = cette livraison n''appelle aucun justificatif ; elle est écartée de
   l''alerte "livraison sans justificatif". Décision explicite de l''utilisateur,
   pas une valeur calculée : ne jamais la positionner automatiquement, sinon
   l''alerte perd tout intérêt. N''a aucun effet sur la facturation ni sur la
   machine à états.';

-- Index partiel : le cas courant est "justificatif requis" (quasi toutes les
-- lignes). On indexe donc uniquement les exceptions, qui restent peu nombreuses.
create index if not exists deliveries_justif_non_requis_idx
  on public.deliveries (justif_non_requis)
  where justif_non_requis = true;

-- DOWN -----------------------------------------------------------------------
-- drop index if exists public.deliveries_justif_non_requis_idx;
-- alter table public.deliveries drop column if exists justif_non_requis;
