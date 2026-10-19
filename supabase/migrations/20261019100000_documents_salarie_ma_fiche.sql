-- Espace salarié › Moi › Mes documents : le salarié peut déposer un document sur SA fiche Équipe
-- (visible du bureau dans la fiche Équipe, entity_type = 'team_member'). Politiques additives et
-- étroites : sa propre fiche, ses propres envois ; il peut retirer un envoi de moins d'une heure.
-- UP

create policy documents_insert_ma_fiche on public.documents for insert to authenticated
with check (
  (select est_salarie())
  and company_id = (select current_company_id())
  and uploaded_by = (select auth.uid())
  and entity_type = 'team_member'
  and entity_id = (select ma_fiche_equipe())
);

create policy documents_delete_ma_fiche on public.documents for delete to authenticated
using (
  (select est_salarie())
  and company_id = (select current_company_id())
  and uploaded_by = (select auth.uid())
  and entity_type = 'team_member'
  and entity_id = (select ma_fiche_equipe())
  and created_at > now() - interval '1 hour'
);

-- DOWN
-- drop policy documents_insert_ma_fiche on public.documents;
-- drop policy documents_delete_ma_fiche on public.documents;
