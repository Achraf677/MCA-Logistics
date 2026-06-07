-- DOWN : retire le défaut sur montant_ht_cts (redevient NOT NULL sans défaut).
alter table public.deliveries
  alter column montant_ht_cts drop default;
