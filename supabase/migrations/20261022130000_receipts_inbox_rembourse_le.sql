-- UP : date à laquelle la note de frais (dépense payée de la poche du salarié) a été remboursée.
-- Posée par le bureau (policy receipts_inbox_update_gestion), lue par le salarié (« Remboursée le … »).
alter table receipts_inbox add column if not exists rembourse_le date;

-- DOWN (commentaire) :
-- alter table receipts_inbox drop column if exists rembourse_le;
