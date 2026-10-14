-- Migration : retrait de la journée de colis (décision du 14/10/2026 : « pas demandé »).
-- Neutralise la partie « journée de colis » de 20261012110000_journees_colis_depenses,
-- SANS rien supprimer (règle du dépôt : migrations additives, garde-fou check:arch) :
--   - plus aucune photo `journee_colis` déposable / effaçable par le salarié ;
--   - le salarié ne relit plus le nom de clients « de messagerie » hors de ses courses ;
--   - le droit `equipe.journees` disparaît des comptes.
-- Restent en base, VIDES et sans aucun lecteur (front et Edge) : table journees_colis (+
--   historique, garde, trace), colonnes team_members.tarif_domicile_cts / tarif_relais_cts /
--   clients_messagerie, fonction mes_clients_messagerie. Suppression physique : voir bas
--   de fichier, seulement sur accord explicite.
-- GARDÉ : les dépenses (receipts_inbox), la lecture par le salarié des documents de SA fiche.
-- Vérifié avant : 0 journée, 0 historique, 0 photo, 0 droit, 0 tarif / client saisi.
-- Ordre de mise en prod : APRÈS le merge du front. MCP : UNE instruction par appel.

-- UP -------------------------------------------------------------------------

drop policy if exists documents_delete_journee on public.documents;

drop policy if exists documents_insert_journee on public.documents;

-- Le salarié relit le nom des clients de SES courses seulement (comme avant S1).
alter policy clients_salarie_ses_courses on public.clients
  using (not (select public.est_salarie()) or id in (select client_id from public.deliveries));

delete from public.user_permissions where resource_key = 'equipe.journees';

-- Nettoyage physique (NON appliqué ; sur accord explicite, hors migration) :
-- drop table if exists public.journees_colis_historique;
-- drop table if exists public.journees_colis;
-- drop function if exists public.journees_colis_trace();
-- drop function if exists public.journees_colis_garde();
-- drop function if exists public.mes_clients_messagerie();
-- alter table public.team_members drop column if exists clients_messagerie,
--   drop column if exists tarif_relais_cts, drop column if exists tarif_domicile_cts;

-- DOWN -----------------------------------------------------------------------
-- alter policy clients_salarie_ses_courses on public.clients
--   using (not (select public.est_salarie()) or id in (select client_id from public.deliveries)
--          or (select public.mes_clients_messagerie()) @> array[id]);
-- Rejouer la section 7 de 20261012110000 (policies documents_insert_journee /
-- documents_delete_journee). Le droit equipe.journees se redonne dans Système › Admins.
