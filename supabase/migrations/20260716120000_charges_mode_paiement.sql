-- Migration : charges.mode_paiement (+ note de frais)
-- Objectif   : distinguer les charges payées PAR Qonto (comportement actuel)
--              des charges payées HORS Qonto (note de frais, cash, jetons
--              prépayés, autre). Les charges hors Qonto n'auront jamais de
--              mouvement bancaire à rapprocher — elles doivent sortir du
--              compteur "à rapprocher" (src/shared/lib/aRapprocher.ts).
-- Application : npx supabase db push (NE PAS appliquer manuellement).
-- Additive. Rétrocompat : DEFAULT 'qonto' → toutes les charges existantes
-- gardent le comportement historique.

alter table public.charges
  add column if not exists mode_paiement text not null default 'qonto'
  check (mode_paiement in ('qonto','note_de_frais','especes','prepaye','autre'));

comment on column public.charges.mode_paiement is
  'Canal de paiement de la charge. "qonto" (défaut) = attendra un mouvement Qonto à rapprocher.
   Les autres valeurs sortent la charge du compteur "à rapprocher" (note de frais avancée par
   un tiers, cash, carnet de jetons prépayés, autre canal hors Qonto).';

-- Qui a avancé l'argent pour une note de frais (facultatif, seulement pertinent
-- si mode_paiement = 'note_de_frais'). Nullable, cascade SET NULL au moment du
-- delete d'un team_member pour ne pas perdre la charge.
alter table public.charges
  add column if not exists avance_par uuid null references public.team_members(id) on delete set null;

comment on column public.charges.avance_par is
  'team_member qui a avancé la charge (note de frais). NULL si non applicable.';

-- Date de remboursement effectif (NULL = pas encore remboursé → badge "à rembourser").
alter table public.charges
  add column if not exists rembourse_le date null;

comment on column public.charges.rembourse_le is
  'Date de remboursement effectif de la note de frais. NULL = non remboursé.';

create index if not exists idx_charges_avance_par on public.charges(avance_par);

-- ─────────────────────────────────────────────────────────────────────────────
-- DOWN (à exécuter à la main en cas de rollback — jamais via db push) :
--
--   drop index if exists public.idx_charges_avance_par;
--   alter table public.charges drop column if exists rembourse_le;
--   alter table public.charges drop column if exists avance_par;
--   alter table public.charges drop column if exists mode_paiement;
--
-- Perte de données : les valeurs saisies dans les 3 colonnes sont perdues.
