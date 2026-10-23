// Envoi d'un mail avec pièce jointe par l'API Gmail, depuis le compte Google connecté (même canal que `send-client-email`).
export interface PieceJointe { filename: string; mime: string; base64: string }

export async function tokenGoogle(refreshToken: string): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error('google_refresh_failed');
  return j.access_token as string;
}

export function enBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Lignes de 76 caractères (RFC 2045) : certains lecteurs de mails ignorent une pièce jointe en une seule ligne. */
const coupe76 = (b64: string) => b64.replace(/(.{76})/g, '$1\r\n');

const utf8 = (s: string) => btoa(unescape(encodeURIComponent(s)));

/** Message MIME multipart/mixed, encodé base64url pour Gmail. */
export function construireMime(to: string, sujet: string, corps: string, pieces: PieceJointe[]): string {
  const limite = `mca_${crypto.randomUUID().replace(/-/g, '')}`;
  const nom = (n: string) => n.replace(/[^\w.\- ]+/g, '_');
  const parts = [
    `To: ${to}`, `Subject: =?UTF-8?B?${utf8(sujet)}?=`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${limite}"`, '',
    `--${limite}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', utf8(corps),
  ];
  for (const p of pieces) {
    parts.push(`--${limite}`, `Content-Type: ${p.mime}; name="${nom(p.filename)}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${nom(p.filename)}"`, '', coupe76(p.base64));
  }
  parts.push(`--${limite}--`, '');
  return utf8(parts.join('\r\n')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function envoyerMail(accessToken: string, raw: string): Promise<Response> {
  return await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
}
