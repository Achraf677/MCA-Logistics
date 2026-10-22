-- Zones de Brumath d'après « Tournée Brumath et villages 23.xlsx » (22/10/2026) : 161 rues, zones 1 à 7 (7 = fin).
-- `zone` = la zone quand la rue n'est que dans une zone ; `zones` = toutes ses zones (rue coupée par le fichier :
-- `zone` reste null, la zone lue sur la feuille fait foi). La RPC n'apprend plus une zone pour une rue déjà dans le fichier.
alter table referentiel_rues add column if not exists zones text[];
-- (données chargées par UPDATE depuis le fichier ; fonction appliquer_zones_tournee mise à jour : « and r.zones is null » à l'apprentissage)
-- DOWN
-- alter table referentiel_rues drop column zones;
