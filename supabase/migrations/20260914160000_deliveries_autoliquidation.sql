-- Migration : facturation en AUTOLIQUIDATION
--
-- Contexte : MCA livre en Allemagne (Karlsruhe, entre autres). Une prestation
--            de transport rendue à un preneur assujetti établi dans un autre
--            État membre n'est pas soumise à la TVA française : la taxe est due
--            par le preneur (art. 259-1 du CGI), et la facture doit porter la
--            mention « Autoliquidation ». Rien dans l'application ne permettait
--            d'exprimer ce régime.
--
-- Application : npx supabase db push (NE PAS appliquer manuellement, NE PAS
--               appliquer via MCP).
--
-- POURQUOI UNE COLONNE ET PAS « tva_rate = 0 » :
-- un taux à zéro et une autoliquidation produisent le même montant et n'ont
-- rien à voir. Le premier est une opération taxable au taux zéro, le second
-- une opération non soumise à la TVA française avec report de la taxe sur le
-- preneur — mention légale obligatoire sur la facture, ligne distincte en
-- déclaration, et code de TVA différent chez Pennylane. Les confondre ferait
-- une facture non conforme que rien à l'écran ne distinguerait d'une facture
-- normale.
--
-- Le régime suppose un preneur assujetti : `clients.tva_intra` doit être
-- renseigné. L'écran le vérifie et le dit, mais ne bloque pas — la
-- responsabilité du régime appartient à celui qui facture, pas au logiciel.

-- UP -------------------------------------------------------------------------

alter table public.deliveries
  add column if not exists autoliquidation boolean not null default false;

comment on column public.deliveries.autoliquidation is
  'Facture émise en AUTOLIQUIDATION : TVA non facturée, due par le preneur
   (art. 259-1 du CGI pour une prestation intracommunautaire B2B).
   À distinguer d''un taux de TVA à 0 % : ce n''est pas le même régime, pas la
   même mention légale, pas la même ligne en déclaration et pas le même code
   de TVA chez Pennylane. Quand true, `tva_rate` et `tva_cts` valent 0 et la
   facture porte la mention « Autoliquidation ».';

-- DOWN -----------------------------------------------------------------------
-- alter table public.deliveries drop column if exists autoliquidation;
