-- Migration : l'étape CHARGEMENT dans le parcours du chauffeur
-- Contexte   : le chauffeur n'avait que deux gestes — « Démarrer », « Livré ».
--              Or une course se déroule en trois temps : rouler jusqu'au point
--              de retrait, charger, puis rouler jusqu'au destinataire. Sans
--              marquer le chargement, impossible de savoir vers quelle adresse
--              le bouton « Naviguer » doit pointer, ni de faire signer
--              l'expéditeur au bon moment.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
--
-- POURQUOI UNE COLONNE ET PAS UN STATUT : `deliveries.statut` est contraint à
-- six valeurs et pilote la facturation (livree → facturee → payee). Y glisser
-- un « chargee » obligerait à modifier la contrainte, la machine à états, et
-- tous les écrans qui filtrent dessus — pour une information qui ne concerne
-- QUE le terrain et n'a aucun effet comptable. Un horodatage à part dit la
-- même chose sans rien déstabiliser.
--
-- Les signatures, elles, existent déjà : `lv_signatures` (jsonb) porte
-- expediteur / transporteur / destinataire, chacune avec son PNG, son
-- horodatage et sa géoloc. Rien à ajouter de ce côté — l'écran chauffeur
-- réutilise exactement le même format que la lettre de voiture du bureau.

-- UP -------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists charge_le timestamptz;

comment on column public.deliveries.charge_le is
  'Horodatage du CHARGEMENT au point de retrait, posé depuis l''écran chauffeur.
   null = pas encore chargé : « Naviguer » pointe alors vers `pickup_address`.
   Non null = en route vers le destinataire, « Naviguer » pointe vers
   `delivery_address`. N''a AUCUN effet sur `statut`, la facturation ou la
   machine à états : c''est une information de terrain, pas comptable.';

-- Index partiel : la question posée est « qu''est-ce qui est parti mais pas
-- encore livré », jamais l''inverse.
create index if not exists deliveries_charge_le_idx
  on public.deliveries (driver_id, date)
  where charge_le is not null;

-- DOWN -----------------------------------------------------------------------
-- alter table public.deliveries drop column if exists charge_le;
