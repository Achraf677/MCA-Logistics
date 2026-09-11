-- Migration : supprime la TVA étrangère
-- Contexte   : `charges.tva_pays` isolait les factures allemandes dans une
--              « poche 8e directive », hors solde CA3, avec son propre encadré
--              dans l'onglet TVA. Compté en base avant suppression, pas
--              supposé : 116 charges, TOUTES en 'FR', aucune en 'DE' — et
--              aucun plein de carburant à 19 %. La fonctionnalité occupait
--              donc un écran entier pour un cas qui ne se produit pas.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
--
-- Destructive : la colonne est supprimée. Sans donnée à perdre ici (aucune
-- valeur ≠ 'FR'), mais le DOWN ne peut restaurer que la colonne, pas son
-- contenu. Vérifier le compte ci-dessous avant de rejouer sur une autre base :
--   select tva_pays, count(*) from public.charges group by tva_pays;

-- UP -------------------------------------------------------------------------

alter table public.charges drop column if exists tva_pays;

-- DOWN -----------------------------------------------------------------------
-- alter table public.charges add column if not exists tva_pays text default 'FR';
