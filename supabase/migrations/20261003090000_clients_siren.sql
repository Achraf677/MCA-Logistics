-- UP
-- Lot U2 (mca-spec/UNIFORMISATION-PENNYLANE.md) — le SIREN (9 chiffres) a sa propre
-- colonne. La synchro Pennylane le rangeait dans `siret` (14 chiffres exigés par la
-- fiche client) : 10 fiches devenaient impossibles à enregistrer.
alter table public.clients
  add column if not exists siren text
    check (siren is null or siren ~ '^\d{9}$');
comment on column public.clients.siren is 'SIREN (9 chiffres). Rempli par la synchro Pennylane (reg_no) ; le SIRET (14) reste dans siret.';

-- Reprise : un « siret » de 9 chiffres est un SIREN mal rangé → déplacé.
update public.clients
   set siren = siret, siret = null
 where siret ~ '^\d{9}$' and siren is null;

-- DOWN
-- update public.clients set siret = siren where siret is null and siren is not null;
-- alter table public.clients drop column if exists siren;
