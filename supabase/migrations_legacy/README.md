# Migrations archivées (obsolètes)

Ces fichiers avaient des timestamps artificiels (12:00:00 / 13:00:00 / 14:00:00) qui NE correspondent
PAS aux migrations réellement appliquées en base (lesquelles ont d'autres timestamps, déjà tracées
dans supabase_migrations.schema_migrations côté distant).

Ils sont conservés pour mémoire mais NE doivent PAS être rejoués.

La source de vérité du schéma est `supabase/schema.sql` (dump complet du distant) + la base de production.
Les migrations sont désormais appliquées via l'outil Supabase (apply_migration), pas via `db push`.
