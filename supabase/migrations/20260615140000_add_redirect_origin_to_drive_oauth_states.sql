-- ARCHIVE : déjà appliquée en prod. Ne pas relancer via db push.
alter table public.google_drive_oauth_states add column redirect_origin text;
