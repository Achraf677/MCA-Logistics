-- Migration : deux catégories de tiers, plus aucune autre
-- Contexte   : `clients.type` acceptait medical / ecommerce / retail /
--              particulier / professionnel, et `deliveries.type` les quatre
--              premières — soit deux listes déjà désynchronisées (professionnel
--              existait côté client mais pas côté livraison, migration
--              20260722100000). Les segments sectoriels ne servent à rien ici :
--              ce qui change le traitement d'un tiers, c'est d'être un
--              professionnel (SIREN, TVA, délai de paiement) ou un particulier.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
--
-- Données au moment de l'écriture (comptées en base, pas supposées) :
--   clients    : 14 particulier · 5 professionnel · 4 NULL · 3 ecommerce
--   deliveries : 18 NULL · 9 particulier · 3 ecommerce
-- Résultat réel après application le 11/09/2026 :
--   clients    : 8 professionnel (5 + 3 convertis) · 14 particulier · 4 NULL
--   deliveries : 3 professionnel (convertis) · 9 particulier · 18 NULL
-- Aucune ligne en 'medical' ni 'retail'. La conversion se limite donc en
-- pratique à 3 clients et 3 livraisons, mais les trois valeurs sont traitées
-- pour que la migration reste correcte si elle est rejouée sur une autre base.
--
-- NULL est conservé : « type non renseigné » reste une information honnête, et
-- forcer une valeur inventerait une donnée que personne n'a saisie.

-- UP -------------------------------------------------------------------------
--
-- ORDRE DES TROIS ÉTAPES : il n'est pas négociable, et la première version de
-- cette migration se trompait. Elle convertissait AVANT de retirer les
-- contraintes, en croyant qu'il fallait « nettoyer avant de resserrer ».
-- C'était impossible : l'ancienne contrainte de `deliveries` n'acceptait PAS
-- la valeur 'professionnel' (elle listait medical/ecommerce/retail/particulier
-- — c'est d'ailleurs la désynchronisation que cette migration corrige). Le
-- premier UPDATE échouait donc sur la contrainte qu'il s'apprêtait à
-- remplacer. Erreur constatée à l'application réelle le 11/09/2026.

-- 1) Retirer les deux contraintes d'abord.
alter table public.clients    drop constraint if exists clients_type_check;
alter table public.deliveries drop constraint if exists deliveries_type_check;

-- 2) Convertir, contraintes levées.
update public.clients
   set type = 'professionnel'
 where type in ('medical', 'ecommerce', 'retail');

update public.deliveries
   set type = 'professionnel'
 where type in ('medical', 'ecommerce', 'retail');

-- 3) Poser les deux nouvelles contraintes, sur la même liste, pour qu'elles ne
--    puissent plus diverger.
alter table public.clients
  add constraint clients_type_check
  check (type is null or type in ('particulier', 'professionnel'));

alter table public.deliveries
  add constraint deliveries_type_check
  check (type is null or type in ('particulier', 'professionnel'));

comment on column public.clients.type is
  'Nature du tiers : ''particulier'' ou ''professionnel'' (NULL = non renseigné).
   Un professionnel porte SIREN, TVA intracommunautaire et délai de paiement ;
   ces champs n''ont pas de sens pour un particulier et sont masqués.
   Les anciens segments sectoriels (medical/ecommerce/retail) ont été convertis
   en ''professionnel'' le 11/09/2026 — ne pas les réintroduire.';

comment on column public.deliveries.type is
  'Nature du donneur d''ordre, alignée sur clients.type. Même liste des deux
   côtés : toute évolution doit modifier les DEUX contraintes en même temps,
   sous peine de recréer la désynchronisation corrigée ici.';

-- DOWN -----------------------------------------------------------------------
-- La conversion n'est pas réversible : rien ne distingue plus un ancien
-- 'ecommerce' d'un 'professionnel' d'origine. Le DOWN ne restaure donc que la
-- permissivité des contraintes, pas les anciennes valeurs.
--
-- alter table public.clients drop constraint if exists clients_type_check;
-- alter table public.clients add constraint clients_type_check
--   check (type = any (array['medical','ecommerce','retail','particulier','professionnel']));
-- alter table public.deliveries drop constraint if exists deliveries_type_check;
-- alter table public.deliveries add constraint deliveries_type_check
--   check (type = any (array['medical','ecommerce','retail','particulier']));
