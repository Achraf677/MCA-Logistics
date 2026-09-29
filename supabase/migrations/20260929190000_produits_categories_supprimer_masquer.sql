-- UP
-- Paramètres : même fonctionnement pour les produits Carburant & consommables
-- et les catégories de charges — renommer, masquer, supprimer si inutilisé.

-- Produits : un produit DE BASE « supprimé » est une surcharge (il n'existe
-- que dans le code) ; un produit personnalisé se supprime réellement.
alter table public.produits_vehicule
  add column if not exists supprime boolean not null default false;
create policy "produits_vehicule_delete_own" on public.produits_vehicule
  for delete using (company_id = (select company_id from public.profiles where id = auth.uid()));

-- Catégories de charges : masquable (disparaît des listes de choix, reste sur
-- les charges déjà classées).
alter table public.charge_categories
  add column if not exists actif boolean not null default true;

-- DOWN
-- alter table public.charge_categories drop column if exists actif;
-- drop policy if exists "produits_vehicule_delete_own" on public.produits_vehicule;
-- alter table public.produits_vehicule drop column if exists supprime;
