-- UP
-- « Carburant & liquides » : un plein peut désormais être un LIQUIDE du
-- véhicule (AdBlue, lave-glace, huile…), pas seulement un carburant. Même
-- table, même écran ; seuls les carburants comptent dans les litres et le
-- prix moyen au litre (calcul dans carburant.logic.ts).
alter table public.fuel_logs drop constraint if exists fuel_logs_fuel_type_check;
alter table public.fuel_logs add constraint fuel_logs_fuel_type_check
  check (fuel_type = any (array[
    'diesel', 'essence', 'electric', 'hybrid', 'lpg',
    'adblue', 'lave_glace', 'huile_moteur', 'liquide_refroidissement',
    'liquide_frein', 'autre_liquide'
  ]::text[]));

-- DOWN
-- (échoue tant qu'il reste des lignes « liquide » : les convertir ou les
--  supprimer d'abord)
-- alter table public.fuel_logs drop constraint if exists fuel_logs_fuel_type_check;
-- alter table public.fuel_logs add constraint fuel_logs_fuel_type_check
--   check (fuel_type = any (array['diesel','essence','electric','hybrid','lpg']::text[]));
