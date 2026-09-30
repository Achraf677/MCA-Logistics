-- UP
-- Lettre de voiture : un numéro LV ne peut appartenir qu'à UNE livraison de la
-- société. Le numéro est calculé côté front (max + 1 sur l'année) : sans cette
-- garde, deux générations simultanées pouvaient attribuer le même LV-AAAA-N.
-- En cas de collision, l'insertion renvoie 23505 et le front recalcule puis
-- réessaie une fois (livraisons.queries.ts#attribuerNumeroLv).
-- Index partiel : les livraisons sans lettre de voiture (lv_numero null) ne
-- sont pas concernées. Purement additif.
--
-- Pré-requis : aucun doublon existant, sinon la création échoue. Vérifier
-- avant application :
--   select company_id, lv_numero, count(*) from public.deliveries
--   where lv_numero is not null group by 1, 2 having count(*) > 1;
create unique index if not exists deliveries_company_lv_numero_uniq
  on public.deliveries (company_id, lv_numero)
  where lv_numero is not null;

-- DOWN
-- drop index if exists public.deliveries_company_lv_numero_uniq;
