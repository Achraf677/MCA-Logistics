-- UP
-- Une ligne de produits_vehicule peut aussi SURCHARGER un produit de base
-- (renommé ou masqué depuis Paramètres) : son code est alors celui du produit
-- de base, et non plus seulement « x_… ».
alter table public.produits_vehicule drop constraint if exists produits_vehicule_code_check;
alter table public.produits_vehicule add constraint produits_vehicule_code_check
  check (code ~ '^x_[a-z0-9_]{1,40}$' or code = any (array[
    'diesel', 'essence', 'electric', 'hybrid', 'lpg',
    'adblue', 'lave_glace', 'huile_moteur', 'liquide_refroidissement',
    'liquide_frein', 'autre_liquide'
  ]::text[]));

-- DOWN
-- delete from public.produits_vehicule where code !~ '^x_';
-- alter table public.produits_vehicule drop constraint if exists produits_vehicule_code_check;
-- alter table public.produits_vehicule add constraint produits_vehicule_code_check
--   check (code ~ '^x_[a-z0-9_]{1,40}$');
