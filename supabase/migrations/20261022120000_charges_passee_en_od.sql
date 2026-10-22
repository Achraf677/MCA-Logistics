-- UP : une charge « passée en OD » (avoir ou autre écriture diverse saisie directement en compta) n'a pas
-- de facture fournisseur chez Pennylane : ce n'est pas un écart, elle ne déclenche plus l'alerte
-- « n'existe que dans le site ».
alter table charges add column if not exists passee_en_od boolean not null default false;

-- Données : l'avoir E.LECLERC (retour mastic) a été passé en OD chez le comptable.
update charges set passee_en_od = true where id = 'c8669789-9982-4281-a4e8-829b1b3f07f8' and pennylane_id is null;

-- DOWN (commentaire) :
-- alter table charges drop column if exists passee_en_od;
