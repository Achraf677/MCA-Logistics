-- UP
-- Chaque rechargement de page relançait l'OCR sur TOUTE la file d'attente
-- (Carburant + Entretiens) : le garde-fou anti-relecture ne vivait qu'en
-- mémoire React (useRef), remis à zéro à chaque montage du composant. Ce
-- cache persiste le résultat une fois obtenu, pour qu'une charge ne soit
-- jamais relue automatiquement — seul le bouton manuel « Lire le
-- justificatif » peut forcer une nouvelle tentative.
alter table public.charges
  add column if not exists ocr_lecture jsonb;

-- DOWN
-- alter table public.charges drop column if exists ocr_lecture;
