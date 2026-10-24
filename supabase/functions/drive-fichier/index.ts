// Edge `drive-fichier` — renvoie le contenu d'un fichier du Drive (pour l'ouvrir dans l'appli).
// POST { file_id } → octets (application/octet-stream) ; Google Docs / Sheets exportés en PDF. 25 Mo au plus.
import { jsonResponse, optionsResponse, CORS_HEADERS } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';
import { accesDrive } from '../_shared/googleDrive.ts';

const MAX = 25 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse();
  let fileId = '';
  try { const b = await req.json(); fileId = typeof b?.file_id === 'string' ? b.file_id : ''; } catch { /* vérifié ci-dessous */ }
  if (!/^[\w-]{8,}$/.test(fileId)) return jsonResponse({ ok: false, error: 'file_id requis' }, 400);

  const a = await accesDrive(req, getServiceClient());
  if (!a.ok) return a.response;
  const h = { Authorization: `Bearer ${a.token}` };

  const m = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,size`, { headers: h });
  if (!m.ok) return jsonResponse({ ok: false, error: 'fichier introuvable' }, 404);
  const meta = await m.json() as { mimeType: string; size?: string };
  if (Number(meta.size ?? 0) > MAX) return jsonResponse({ ok: false, error: 'fichier trop lourd pour l\'aperçu' }, 413);

  const natif = meta.mimeType.startsWith('application/vnd.google-apps.');
  const url = natif
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application%2Fpdf`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const r = await fetch(url, { headers: h });
  if (!r.ok) return jsonResponse({ ok: false, error: 'lecture impossible' }, 502);
  return new Response(r.body, { headers: { ...CORS_HEADERS, 'Content-Type': 'application/octet-stream' } });
});
