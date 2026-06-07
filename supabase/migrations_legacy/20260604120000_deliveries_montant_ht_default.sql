-- UP : donne un DEFAULT 0 à montant_ht_cts pour permettre aux INSERTs v2
-- d'omettre cette colonne legacy sans violer la contrainte NOT NULL.
-- montant_ttc_cts est GENERATED ALWAYS et ne peut jamais être écrite.
-- Les lectures continuent de préférer amount_ht_cts / amount_ttc_cts (colonnes v2).
alter table public.deliveries
  alter column montant_ht_cts set default 0;
