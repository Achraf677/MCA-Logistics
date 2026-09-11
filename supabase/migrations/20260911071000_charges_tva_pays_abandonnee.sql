-- Migration : abandonne la TVA étrangère
-- Contexte   : `charges.tva_pays` isolait les factures allemandes dans une
--              « poche 8e directive », hors solde CA3, avec son propre encadré
--              dans l'onglet TVA. Compté en base avant de décider, pas
--              supposé : 116 charges, TOUTES en 'FR', aucune en 'DE' — et
--              aucun plein de carburant à 19 %. La fonctionnalité occupait
--              donc un écran entier pour un cas qui ne se produit pas.
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--              appliquer via MCP).
--
-- ADDITIVE — la colonne N'EST PAS supprimée, conformément à la règle du projet
-- (`npm run check:arch` refuse tout DROP hors commentaire). Une première
-- version de cette migration faisait un `drop column` : la CI l'a refusée, à
-- juste titre. Le code applicatif ne lit plus `tva_pays` — c'est ce qui retire
-- la fonctionnalité. La colonne reste en base, inerte, avec le commentaire
-- ci-dessous pour qu'on ne la recâble pas par erreur.
--
-- Supprimer réellement la colonne, si on le décide un jour, sera une décision
-- séparée et explicite : la donnée historique (quelle facture venait de quel
-- pays) serait alors définitivement perdue.

-- UP -------------------------------------------------------------------------

comment on column public.charges.tva_pays is
  'ABANDONNÉE le 11/09/2026 — plus lue par l''application. Servait à isoler la
   TVA étrangère (8e directive) hors du solde CA3 ; aucune charge n''était
   concernée (116 lignes, toutes FR). Ne pas recâbler : le calcul de TVA
   (features/tva/tva.logic.ts) ne trie plus par pays. Conservée uniquement pour
   ne pas détruire l''historique.';

-- DOWN -----------------------------------------------------------------------
-- comment on column public.charges.tva_pays is null;
