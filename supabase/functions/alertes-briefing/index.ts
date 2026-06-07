// Edge Function `alertes-briefing`
// Reçoit la liste d'alertes DÉJÀ CALCULÉE par le moteur de détection (couche 1, côté client) et
// renvoie un briefing quotidien priorisé en langage naturel via Mistral.
// RGPD : ne lit/n'écrit AUCUNE table ; seules les alertes fournies sont transmises à Mistral (UE, DPA signé).
// Si aucune alerte, ne contacte pas Mistral. La clé Mistral n'est jamais logguée.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { ExternalApiError } from '../_shared/http.ts';
import { generateText } from '../_shared/mistral.ts';
const SEVERITY_ORDER = {
  critique: 0,
  urgent: 1,
  warning: 2,
  info: 3
};
const SYSTEM_PROMPT = "Tu es l'assistant de direction d'une petite société de transport routier (véhicules < 3,5 t). " + 'À partir de la liste d\'alertes fournie, et UNIQUEMENT de cette liste, rédige un briefing quotidien court pour le dirigeant. ' + 'Structure imposée, exactement ces deux sections :\n' + "⚡ À FAIRE AUJOURD'HUI\n" + '- 2 à 5 actions prioritaires maximum, les critiques et urgentes d\'abord, chacune concrète et commençant par un verbe d\'action (Prendre RDV, Relancer, Clôturer, Planifier…).\n' + '📊 VUE D\'ENSEMBLE\n' + '- une courte synthèse, une puce par pôle CONCERNÉ uniquement (Flotte, RH, Facturation, Opérations).\n' + 'Règles : concis et factuel, en français. N\'invente AUCUN nom, montant, date ou détail absent des alertes. ' + 'Ne minimise jamais une échéance dépassée. Pas de préambule, pas de formule de politesse, pas de conclusion bavarde. Utilise des puces.';
function echeanceLabel(daysLeft) {
  if (daysLeft == null) return '';
  if (daysLeft < 0) return ` — en retard de ${-daysLeft} j`;
  if (daysLeft === 0) return " — échéance aujourd'hui";
  return ` — dans ${daysLeft} j`;
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return optionsResponse();
  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({
    ok: false,
    error: 'missing MISTRAL_API_KEY'
  }, 500);
  let body;
  try {
    body = await req.json();
  } catch  {
    return jsonResponse({
      ok: false,
      error: 'invalid JSON body'
    }, 400);
  }
  const rawAlerts = Array.isArray(body.alerts) ? body.alerts : [];
  const alerts = rawAlerts.filter((a)=>!!a && typeof a === 'object').map((a)=>({
      severity: typeof a.severity === 'string' ? a.severity : 'info',
      category: typeof a.category === 'string' ? a.category : 'autre',
      title: typeof a.title === 'string' ? a.title : '',
      detail: typeof a.detail === 'string' ? a.detail : '',
      daysLeft: typeof a.daysLeft === 'number' ? a.daysLeft : null
    })).filter((a)=>a.title);
  const today = typeof body.today === 'string' && body.today ? body.today : new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris'
  }).format(new Date());
  if (alerts.length === 0) {
    return jsonResponse({
      ok: true,
      data: {
        briefing: "✅ Aucune alerte en cours. Rien à traiter aujourd'hui.",
        count: 0
      }
    });
  }
  alerts.sort((a, b)=>(SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  const lines = alerts.map((a)=>`[${a.severity.toUpperCase()}] (${a.category}) ${a.title}${a.detail ? ' — ' + a.detail : ''}${echeanceLabel(a.daysLeft)}`).join('\n');
  const userPrompt = `Date du jour : ${today}\nNombre d'alertes : ${alerts.length}\n\nAlertes (triées par priorité) :\n${lines}`;
  try {
    const briefing = await generateText(apiKey, SYSTEM_PROMPT, userPrompt);
    return jsonResponse({
      ok: true,
      data: {
        briefing,
        count: alerts.length
      }
    });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      return jsonResponse({
        ok: false,
        error: err.message,
        status: err.status,
        body: err.responseBody
      }, 502);
    }
    return jsonResponse({
      ok: false,
      error: err.message
    }, 500);
  }
});
