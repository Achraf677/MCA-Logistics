-- DOWN — retire la colonne extra_lines.
-- Perte de données : les lignes supplémentaires stockées sont supprimées.
alter table public.deliveries
  drop column if exists extra_lines;
