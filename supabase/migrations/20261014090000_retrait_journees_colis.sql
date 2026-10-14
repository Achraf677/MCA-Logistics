-- Migration : retrait de la journée de colis (décision du 14/10/2026 : « pas demandé »).
-- Annule la partie « journée de colis » de 20261012110000_journees_colis_depenses :
--   tarifs domicile / relais et clients de messagerie de la fiche Équipe, table
--   journees_colis + historique, garde, photos `journee_colis`, droit `equipe.journees`.
-- GARDÉ : les dépenses (colonnes et policies de receipts_inbox), la lecture par le salarié
--   des documents de SA fiche, l'effacement de ses fichiers déréférencés.
-- Vérifié avant : 0 journée, 0 historique, 0 photo, 0 droit, 0 tarif / client saisi.
-- Ordre de mise en prod : APRÈS le merge du front (qui ne lit plus ces colonnes).
-- Application MCP : UNE instruction par appel, dans l'ordre.

-- UP -------------------------------------------------------------------------

drop policy if exists documents_delete_journee on public.documents;

drop policy if exists documents_insert_journee on public.documents;

drop table if exists public.journees_colis_historique;

drop table if exists public.journees_colis;

drop function if exists public.journees_colis_trace();

drop function if exists public.journees_colis_garde();

-- Le salarié relit le nom des clients de SES courses seulement (comme avant S1).
alter policy clients_salarie_ses_courses on public.clients
  using (not (select public.est_salarie()) or id in (select client_id from public.deliveries));

drop function if exists public.mes_clients_messagerie();

alter table public.team_members drop column if exists clients_messagerie,
  drop column if exists tarif_relais_cts, drop column if exists tarif_domicile_cts;

delete from public.user_permissions where resource_key = 'equipe.journees';

-- DOWN -----------------------------------------------------------------------
-- Rejouer les sections 1 à 7 de 20261012110000_journees_colis_depenses.sql
-- (colonnes de team_members, mes_clients_messagerie, policy clients, journees_colis,
-- garde, historique, trace, policies documents `journee_colis`).
