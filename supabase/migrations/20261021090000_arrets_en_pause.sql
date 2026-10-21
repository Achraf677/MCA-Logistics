-- Arrêt de tournée de colis mis en pause par le livreur (relais fermé, client absent, à refaire plus tard).
-- null = pas en pause. N'agit que sur l'affichage : l'arrêt garde sa place dans l'ordre et le trajet.
alter table tournees_colis_arrets add column if not exists en_pause_le timestamptz;
-- DOWN
-- alter table tournees_colis_arrets drop column en_pause_le;
