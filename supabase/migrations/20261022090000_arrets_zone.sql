-- Zone de la feuille de Brumath (« ZONE 1 » … « ZONE 7 ») : sert de « village » pour l'ordre de passage.
-- null = pas de zone (autres communes, ligne « district inconnu »).
alter table tournees_colis_arrets add column if not exists zone text;
-- DOWN
-- alter table tournees_colis_arrets drop column zone;
