-- UP : fiche salarié — adresse, contact d'urgence, notes internes (bureau). Le salarié ne les lit pas : Mes courses liste ses colonnes.
alter table public.team_members add column if not exists adresse text, add column if not exists contact_urgence_nom text, add column if not exists contact_urgence_tel text, add column if not exists notes text;
-- DOWN (commentaire) : alter table public.team_members drop column if exists adresse, drop column if exists contact_urgence_nom, drop column if exists contact_urgence_tel, drop column if exists notes;
