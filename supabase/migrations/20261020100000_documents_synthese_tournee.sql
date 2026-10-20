-- Photos de la synthèse de fin de tournée (documents.entity_type = 'tournee_colis').
-- Le salarié ajoute les photos de SA tournée (avant ou après la clôture) et retire les siennes tant qu'elle
-- n'est pas clôturée. Lecture : déjà couverte (ses propres envois ; bureau = documents_select_company).
create policy documents_insert_tournee_colis on documents for insert with check (
  company_id = (select current_company_id()) and uploaded_by = (select auth.uid()) and entity_type = 'tournee_colis'
  and entity_id in (select t.id from tournees_colis t where t.member_id = (select ma_fiche_equipe())));
create policy documents_delete_tournee_colis on documents for delete using (
  company_id = (select current_company_id()) and uploaded_by = (select auth.uid()) and entity_type = 'tournee_colis'
  and entity_id in (select t.id from tournees_colis t where t.member_id = (select ma_fiche_equipe()) and t.statut <> 'cloturee'));
-- DOWN
-- drop policy documents_delete_tournee_colis on documents;
-- drop policy documents_insert_tournee_colis on documents;
