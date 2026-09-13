-- Migration : l'ordre des ARRÊTS (et non des courses) + les contacts terrain
--
-- Contexte : deux manques signalés par les chauffeurs, qui tiennent au même
--            malentendu de modèle — une course a été traitée jusqu'ici comme
--            UN point sur la route, alors qu'elle en compte DEUX.
--
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--               appliquer via MCP).
--
-- 1. `pickup_order` — L'ORDRE RÉEL DE LA JOURNÉE
--
-- `stop_order` ordonnait les COURSES. Or une journée ne s'enchaîne pas course
-- par course : on va chercher chez le client 1, puis chez le client 2, et on
-- ne livre le client 1 qu'au troisième arrêt. Avec une seule colonne d'ordre,
-- cette journée-là est inexprimable — le retrait et la livraison d'une même
-- course sont forcément collés.
--
-- `pickup_order` et `stop_order` indexent désormais LA MÊME séquence : celle
-- des arrêts de la journée. L'exemple ci-dessus s'écrit
--   course 1 : pickup_order = 1, stop_order = 3
--   course 2 : pickup_order = 2, stop_order = 4
--
-- Pourquoi pas une table `delivery_stops` : elle dirait la même chose au prix
-- d'une jointure sur tous les écrans, d'une migration des données existantes
-- et d'une seconde source de vérité pour les adresses, qui resteraient de
-- toute façon sur `deliveries`. Deux entiers suffisent.
--
-- 2. `expediteur_tel` / `destinataire_tel` — QUI APPELER, ET QUAND
--
-- L'écran chauffeur n'avait qu'un numéro : celui du client FACTURÉ. Ce n'est
-- ni celui qui remet la marchandise, ni celui qui la reçoit — et sur un
-- déménagement de particulier, c'est même rarement l'un des deux. Le chauffeur
-- appelait donc le donneur d'ordre pour demander le code de l'immeuble.
--
-- Deux colonnes, pas une table de contacts : ce sont deux numéros attachés à
-- UNE course, ils changent à chaque course, et rien ne les réutilise ailleurs.

-- UP -------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists pickup_order    integer,
  add column if not exists expediteur_tel  text,
  add column if not exists destinataire_tel text;

comment on column public.deliveries.pickup_order is
  'Position de l''ARRÊT DE RETRAIT dans la séquence de la journée.
   Indexe la MÊME séquence que `stop_order`, qui porte la position de l''arrêt
   de LIVRAISON : une journée « je charge chez A, je charge chez B, je livre A,
   je livre B » s''écrit A(pickup 1, stop 3) et B(pickup 2, stop 4).
   null = arrêt de retrait jamais ordonné à la main ; il passe alors après
   ceux qui le sont, jamais avant.';

comment on column public.deliveries.expediteur_tel is
  'Téléphone de qui REMET la marchandise, au point de retrait.
   Distinct du téléphone du client facturé (`clients.phone`) : sur un
   déménagement de particulier, le donneur d''ordre n''est souvent ni
   l''expéditeur ni le destinataire. L''écran chauffeur compose CE numéro tant
   que la course n''est pas chargée.';

comment on column public.deliveries.destinataire_tel is
  'Téléphone de qui REÇOIT la marchandise. L''écran chauffeur compose ce
   numéro une fois la course chargée, c''est-à-dire pendant le trajet où il
   sert réellement — pour prévenir d''un retard ou demander un code d''accès.';

-- Index partiel : la question posée est toujours « les arrêts de retrait de
-- cette journée, dans l''ordre », jamais « toutes les courses par
-- pickup_order ».
create index if not exists deliveries_pickup_order_idx
  on public.deliveries (driver_id, date, pickup_order)
  where pickup_order is not null;

-- DOWN -----------------------------------------------------------------------
-- alter table public.deliveries
--   drop column if exists pickup_order,
--   drop column if exists expediteur_tel,
--   drop column if exists destinataire_tel;
