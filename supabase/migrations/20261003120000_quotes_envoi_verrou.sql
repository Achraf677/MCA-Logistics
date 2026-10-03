-- UP
-- Lot U4 (mca-spec/UNIFORMISATION-PENNYLANE.md) — envoi du devis à Pennylane :
--  - envoi_verrou : posé atomiquement par l'Edge pennylane-quote pendant l'envoi.
--    Un double clic ne crée plus 2 devis chez Pennylane (verrou de 5 min max).
--  - sync_error : dernier refus de Pennylane à l'envoi, affiché sur le devis,
--    effacé au succès (même rôle que deliveries.sync_error).
alter table public.quotes add column if not exists envoi_verrou timestamptz;
alter table public.quotes add column if not exists sync_error text;
comment on column public.quotes.envoi_verrou is 'Envoi Pennylane en cours (pennylane-quote) ; null sinon. Expire après 5 min.';
comment on column public.quotes.sync_error is 'Dernier refus Pennylane à l''envoi du devis ; null après un envoi réussi.';

-- DOWN
-- alter table public.quotes drop column if exists sync_error;
-- alter table public.quotes drop column if exists envoi_verrou;
