// Accès au Drive de la société (compte Google connecté dans Paramètres, un seul pour tout le site).
// Droit : président, ou compte avec `profiles.drive_access = true` (règle historique des Edge drive-*).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from './cors.ts';

export const DOSSIER_MIME = 'application/vnd.google-apps.folder';
export const NOM_DOSSIER_RACINE = 'MCA Documents';
const API = 'https://www.googleapis.com/drive/v3';

export type AccesDrive =
  | { ok: true; companyId: string; userId: string; token: string; racineId: string | null; service: SupabaseClient }
  | { ok: false; response: Response };

export async function jetonAcces(refreshToken: string): Promise<string> {
  const form = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
  });
  if (!r.ok) throw new Error('refresh_failed');
  const j = await r.json();
  if (!j.access_token) throw new Error('no_access_token');
  return j.access_token as string;
}

export async function accesDrive(req: Request, service: SupabaseClient): Promise<AccesDrive> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return { ok: false, response: jsonResponse({ ok: false, error: 'Session absente — reconnectez-vous.' }, 401) };
  const { data: u } = await service.auth.getUser(jwt);
  if (!u?.user) return { ok: false, response: jsonResponse({ ok: false, error: 'Session invalide — reconnectez-vous.' }, 401) };
  const { data: p } = await service.from('profiles').select('company_id, role, drive_access, active').eq('id', u.user.id).maybeSingle();
  if (!p?.company_id || p.active === false) return { ok: false, response: jsonResponse({ ok: false, error: 'Société introuvable.' }, 403) };
  if (p.role !== 'president' && p.drive_access !== true) return { ok: false, response: jsonResponse({ ok: false, error: 'drive_access_denied' }, 403) };
  const { data: tok } = await service.from('google_drive_tokens').select('refresh_token, root_folder_id').eq('company_id', p.company_id).maybeSingle();
  if (!tok?.refresh_token) return { ok: false, response: jsonResponse({ ok: false, error: 'drive_not_connected' }, 400) };
  try {
    const token = await jetonAcces(tok.refresh_token as string);
    return { ok: true, companyId: String(p.company_id), userId: u.user.id, token, racineId: (tok.root_folder_id as string | null) ?? null, service };
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'token_refresh_failed' }, 502) };
  }
}

const enTete = (token: string) => ({ Authorization: `Bearer ${token}` });
const apostrophes = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Dossier `nom` dans `parentId` : le trouve, sinon le crée. */
export async function dossierDans(token: string, parentId: string, nom: string): Promise<string> {
  const q = encodeURIComponent(`name='${apostrophes(nom)}' and '${parentId}' in parents and mimeType='${DOSSIER_MIME}' and trashed=false`);
  const r = await fetch(`${API}/files?q=${q}&fields=files(id)&pageSize=1`, { headers: enTete(token) });
  if (!r.ok) throw new Error('dossier_lecture');
  const trouve = (await r.json()).files?.[0]?.id as string | undefined;
  if (trouve) return trouve;
  const c = await fetch(`${API}/files?fields=id`, {
    method: 'POST', headers: { ...enTete(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: DOSSIER_MIME, parents: [parentId] }),
  });
  if (!c.ok) throw new Error('dossier_creation');
  return (await c.json()).id as string;
}

/** Dossier racine de rangement : celui choisi dans Paramètres / Documents, sinon « MCA Documents » à la racine du Drive. */
export async function racineRangement(a: Extract<AccesDrive, { ok: true }>): Promise<string> {
  if (a.racineId) return a.racineId;
  const id = await dossierDans(a.token, 'root', NOM_DOSSIER_RACINE);
  await a.service.from('google_drive_tokens').update({ root_folder_id: id, updated_at: new Date().toISOString() }).eq('company_id', a.companyId);
  return id;
}

export async function televerser(token: string, dossierId: string, nom: string, mime: string, octets: Uint8Array): Promise<{ id: string; lien: string | null }> {
  const frontiere = '----mca' + crypto.randomUUID().replace(/-/g, '');
  const pre = `--${frontiere}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nom, parents: [dossierId] })}\r\n--${frontiere}\r\nContent-Type: ${mime || 'application/octet-stream'}\r\n\r\n`;
  const body = new Blob([pre, octets as BlobPart, `\r\n--${frontiere}--`]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST', headers: { ...enTete(token), 'Content-Type': `multipart/related; boundary=${frontiere}` }, body,
  });
  if (!r.ok) throw new Error('upload_failed');
  const j = await r.json();
  return { id: j.id as string, lien: (j.webViewLink as string | undefined) ?? null };
}
