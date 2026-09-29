-- UP
-- Un relevé de carte carburant (Fleet Pro, Carte Total, AS24…) est UNE
-- facture pour PLUSIEURS pleins. L'index unique « 1 charge ↔ 1 plein » rendait
-- ce cas impossible. On le remplace par un index simple : l'anti-doublon est
-- désormais le contrôle de somme fait à l'import (somme des lignes = total de
-- la facture), côté application.
drop index if exists public.fuel_logs_charge_uniq;
create index if not exists fuel_logs_charge_idx
  on public.fuel_logs(charge_id)
  where charge_id is not null;

-- DOWN
-- (échoue tant qu'une facture couvre plusieurs pleins)
-- drop index if exists public.fuel_logs_charge_idx;
-- create unique index if not exists fuel_logs_charge_uniq
--   on public.fuel_logs(charge_id) where charge_id is not null;
