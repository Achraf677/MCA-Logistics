// Edge Function `assistant-chat` — cerveau conversationnel de l'assistant MCA.
// Modèle : mistral-small-latest. 18 outils LECTURE + 8 outils ÉCRITURE + 1 outil RÉDACTION (generer_mail).
// L'Edge NE TOUCHE JAMAIS la base : elle propose des OUTILS à Mistral. Le front exécute les lectures,
// affiche une carte de CONFIRMATION pour les écritures, et délègue la rédaction à brouillons-generate.
// Clé jamais logguée. verify_jwt = true. Retry/backoff sur 429/5xx.
import { jsonResponse, optionsResponse } from '../_shared/cors.ts';
import { ExternalApiError } from '../_shared/http.ts';

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-small-latest';
const MAX_HISTORY = 40;
const MAX_RETRIES = 2;

const SYSTEM_BASE =
  "Tu es l'assistant de MCA Logistics, PME de transport routier léger (< 3,5 t) basée à Strasbourg. " +
  "Tu aides le dirigeant à utiliser son logiciel de gestion (PGI/TMS) et à piloter son activité.\n\n" +
  "Règles :\n" +
  "- Réponds en français, concis, clair, actionnable. Pas de préambule.\n" +
  "- AIDE À L'USAGE : pour expliquer comment utiliser un onglet, appuie-toi sur la CARTE DU SITE ci-dessous.\n" +
  "- DONNÉES RÉELLES : tu disposes d'OUTILS pour lire les vraies données de l'entreprise. Dès qu'on te demande " +
  "un chiffre, un bilan, une liste, un état réel, tu DOIS appeler l'outil approprié pour aller chercher " +
  "l'information à jour. Ne réponds JAMAIS un chiffre de mémoire ou inventé : passe toujours par un outil. " +
  "Si aucun outil ne couvre la demande, dis-le et oriente vers l'onglet.\n" +
  "- Quand un outil renvoie des données, exploite-les fidèlement ; les montants sont en euros. Si un résultat " +
  "est vide, dis-le simplement (ex. 'aucune facture impayée').\n" +
  "- ACTIONS : tu peux proposer certaines actions via des outils dédiés : créer une livraison (create_livraison), " +
  "changer le statut d'une livraison (changer_statut_livraison : facturer, encaisser/marquer payée, annuler…), " +
  "ajouter une charge/dépense (create_charge), créer un client (create_client), modifier un client existant " +
  "(modifier_client, en ne renseignant QUE les champs à changer), créer un fournisseur " +
  "(create_fournisseur), ajouter un véhicule à la flotte (create_vehicule), ajouter un plein de carburant " +
  "(create_plein), déclarer un incident (create_incident). Quand l'utilisateur demande clairement une action, " +
  "appelle l'outil avec les informations fournies. TRÈS IMPORTANT : l'application affichera à l'utilisateur une " +
  "carte de confirmation AVANT d'enregistrer quoi que ce soit. Ne dis JAMAIS qu'une action est déjà faite et ne " +
  "confirme pas toi-même : contente-toi d'appeler l'outil. Si une information essentielle manque, demande-la " +
  "d'abord, n'appelle pas l'outil avec des champs vides.\n" +
  "- DÉPENDANCES : une action peut concerner un client, un véhicule ou un fournisseur qui n'existe pas encore " +
  "en base. Si l'application te signale qu'un client/véhicule/fournisseur est introuvable, NE t'arrête pas là : " +
  "propose spontanément de le créer d'abord avec l'outil adapté (create_client, create_vehicule, " +
  "create_fournisseur), puis propose de refaire l'action initiale. Demande les infos minimales nécessaires " +
  "(ex. pour un véhicule : la plaque et un nom court). Ne laisse jamais l'utilisateur dans une impasse.\n" +
  "- RÉDACTION : pour rédiger un mail, une relance de paiement, une annonce de recrutement ou tout autre texte, " +
  "utilise l'outil generer_mail (ne rédige pas le texte toi-même dans ta réponse ; mets tout le contexte utile " +
  "— destinataire, objet, ton, montants, dates — dans le champ instructions).\n" +
  "- SUPPRESSIONS interdites via l'assistant : si on te demande de supprimer quelque chose, explique que ce " +
  "n'est pas possible depuis l'assistant et qu'il faut le faire à la main dans l'onglet concerné.\n" +
  "- N'invente jamais une fonctionnalité absente de la carte du site.";

const TOOLS = [
  { type: 'function', function: { name: 'get_kpis_mois',
      description: "Indicateurs clés d'un mois : CA HT, nombre de livraisons, facturées, payées. Pour 'mon CA du mois', 'combien de courses ce mois', 'bilan du mois'.",
      parameters: { type: 'object', properties: { mois: { type: 'string', description: 'Mois YYYY-MM. Defaut : mois courant.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_alertes',
      description: "Toutes les alertes et échéances : CT/assurance/révision véhicule, permis et visite médicale chauffeur, entretiens dus, livraisons en retard, factures impayées, incidents ouverts, inspections avec défauts, fins de CDD. Pour 'qu'est-ce qui urge', 'mes échéances', 'quoi faire en priorité'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_impayes',
      description: "Factures émises non payées, avec montant et retard. Pour 'qui me doit de l'argent', 'mes impayés', 'créances'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_tresorerie',
      description: "Solde bancaire actuel (Qonto) et dernières opérations. Pour 'ma trésorerie', 'mon solde', 'mes dernières transactions'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_charges_mois',
      description: "Total des charges d'un mois et répartition par catégorie. Pour 'mes charges', 'mes dépenses du mois'.",
      parameters: { type: 'object', properties: { mois: { type: 'string', description: 'Mois YYYY-MM. Defaut : mois courant.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_tva',
      description: "Bilan TVA d'un mois : collectée, déductible, nette à payer. Pour 'ma TVA', 'combien de TVA je dois'.",
      parameters: { type: 'object', properties: { mois: { type: 'string', description: 'Mois YYYY-MM. Defaut : mois courant.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_client',
      description: "Fiche d'un client par son nom (recherche partielle) : coordonnées, type, CA total, nb livraisons, impayé. Pour 'le compte de X', 'combien me doit X'.",
      parameters: { type: 'object', properties: { nom: { type: 'string', description: 'Nom (ou partie) du client.' } }, required: ['nom'] } } },
  { type: 'function', function: { name: 'get_clients',
      description: "Liste des clients (nom, type, ville). Pour 'mes clients', 'liste des clients'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_fournisseurs',
      description: "Liste des fournisseurs (nom, catégorie). Pour 'mes fournisseurs'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_livraisons',
      description: "Liste des livraisons, filtrable par date et/ou statut. Pour 'les livraisons d'aujourd'hui', 'les courses de demain', 'les livraisons à facturer'.",
      parameters: { type: 'object', properties: {
        date: { type: 'string', description: 'Jour YYYY-MM-DD. Optionnel.' },
        statut: { type: 'string', enum: ['planifiee', 'en_cours', 'livree', 'facturee', 'payee', 'annulee'], description: 'Statut de livraison. Optionnel.' },
      }, required: [] } } },
  { type: 'function', function: { name: 'get_tournees',
      description: "Tournées d'une date (véhicule, chauffeur, nombre d'arrêts, km, statut). Pour 'la tournée de demain', 'mes tournées du jour'.",
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'Jour YYYY-MM-DD. Defaut : jour courant.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_incidents',
      description: "Incidents (accidents, pannes, vols…), filtrables par statut. Par défaut, les incidents non clos. Pour 'des incidents', 'qu'est-ce qui s'est passé'.",
      parameters: { type: 'object', properties: { statut: { type: 'string', enum: ['ouvert', 'en_cours', 'clos'], description: 'Statut. Optionnel.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_inspections',
      description: "Inspections de véhicules (pré/post-trajet, périodiques), filtrables par statut (ok, defauts, refuse). Pour 'des inspections avec défauts', 'dernières inspections'.",
      parameters: { type: 'object', properties: { statut: { type: 'string', enum: ['ok', 'defauts', 'refuse'], description: 'Statut. Optionnel.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_vehicules',
      description: "État de la flotte : véhicules, statut, échéances (CT, assurance, révision). Pour 'mes véhicules', 'ma flotte', 'l'état de mes camions'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_carburant_mois',
      description: "Dépenses de carburant d'un mois (total, nombre de pleins, litres). Pour 'mes dépenses carburant', 'combien d'essence ce mois'.",
      parameters: { type: 'object', properties: { mois: { type: 'string', description: 'Mois YYYY-MM. Defaut : mois courant.' } }, required: [] } } },
  { type: 'function', function: { name: 'get_entretiens',
      description: "Entretiens véhicules à venir et échéances (prochaine date/km). Pour 'prochains entretiens', 'quand la prochaine révision'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_equipe',
      description: "Membres de l'équipe : rôle, contrat, échéances (permis B, visite médicale, fin de contrat). Pour 'mon équipe', 'mes chauffeurs', 'mes salariés'.",
      parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'get_heures',
      description: "Heures travaillées, filtrables par membre et/ou mois. Pour 'les heures de X', 'heures travaillées ce mois'.",
      parameters: { type: 'object', properties: {
        membre: { type: 'string', description: 'Nom (ou partie) du membre. Optionnel.' },
        mois: { type: 'string', description: 'Mois YYYY-MM. Defaut : mois courant.' },
      }, required: [] } } },

  // ── ACTIONS (écriture) : proposées à l'IA, exécutées par le front APRÈS confirmation utilisateur ──
  { type: 'function', function: { name: 'create_livraison',
      description: "Crée une nouvelle livraison/course. L'application affichera une carte de confirmation AVANT d'enregistrer : ne confirme pas toi-même. Demande le client et la date s'ils manquent.",
      parameters: { type: 'object', properties: {
        client: { type: 'string', description: 'Nom du client de la livraison.' },
        date: { type: 'string', description: 'Date de la livraison, format YYYY-MM-DD.' },
        montant_ht_eur: { type: 'number', description: 'Montant HT en euros. Optionnel.' },
        type: { type: 'string', enum: ['medical', 'ecommerce', 'retail', 'particulier'], description: 'Type de livraison. Optionnel.' },
        adresse: { type: 'string', description: 'Adresse de livraison. Optionnel.' },
        ville: { type: 'string', description: 'Ville de livraison. Optionnel.' },
      }, required: ['client', 'date'] } } },
  { type: 'function', function: { name: 'changer_statut_livraison',
      description: "Change le statut d'une livraison existante : la démarrer, la marquer livrée, la facturer, l'encaisser (marquer payée) ou l'annuler. Carte de confirmation avant application : ne confirme pas toi-même. Identifie la livraison par client et date.",
      parameters: { type: 'object', properties: {
        client: { type: 'string', description: 'Nom du client de la livraison concernée.' },
        date: { type: 'string', description: 'Date de la livraison concernée, format YYYY-MM-DD.' },
        action: { type: 'string', enum: ['demarrer', 'livrer', 'facturer', 'encaisser', 'annuler'],
          description: "Action : demarrer (planifiée vers en cours), livrer (vers livrée), facturer (vers facturée), encaisser (vers payée), annuler (vers annulée)." },
      }, required: ['client', 'action'] } } },
  { type: 'function', function: { name: 'create_charge',
      description: "Ajoute une charge / dépense de l'entreprise. Carte de confirmation avant enregistrement : ne confirme pas toi-même. Demande le libellé, le montant et la date s'ils manquent.",
      parameters: { type: 'object', properties: {
        libelle: { type: 'string', description: 'Libellé / description de la charge (ex. plein autoroute, assurance).' },
        montant_ttc_eur: { type: 'number', description: 'Montant TTC en euros.' },
        categorie: { type: 'string', description: "Catégorie de la charge (ex. carburant, assurance, entretien, loyer, téléphone). Optionnel." },
        date: { type: 'string', description: 'Date de la charge, format YYYY-MM-DD.' },
        fournisseur: { type: 'string', description: 'Nom du fournisseur. Optionnel.' },
      }, required: ['libelle', 'montant_ttc_eur', 'date'] } } },
  { type: 'function', function: { name: 'create_client',
      description: "Crée un nouveau client. Carte de confirmation avant enregistrement : ne confirme pas toi-même. Demande au moins le nom.",
      parameters: { type: 'object', properties: {
        nom: { type: 'string', description: 'Nom du client.' },
        type: { type: 'string', enum: ['medical', 'ecommerce', 'retail', 'particulier'], description: 'Type de client. Optionnel.' },
        ville: { type: 'string', description: 'Ville. Optionnel.' },
        email: { type: 'string', description: 'Email. Optionnel.' },
        telephone: { type: 'string', description: 'Téléphone. Optionnel.' },
        delai_paiement_jours: { type: 'number', description: 'Délai de paiement en jours. Optionnel.' },
      }, required: ['nom'] } } },
  { type: 'function', function: { name: 'create_fournisseur',
      description: "Crée un nouveau fournisseur. Carte de confirmation avant enregistrement : ne confirme pas toi-même. Demande au moins le nom.",
      parameters: { type: 'object', properties: {
        nom: { type: 'string', description: 'Nom du fournisseur.' },
        categorie: { type: 'string', description: 'Catégorie (ex. carburant, assurance, télécom, entretien). Optionnel.' },
        email: { type: 'string', description: 'Email. Optionnel.' },
        telephone: { type: 'string', description: 'Téléphone. Optionnel.' },
        adresse: { type: 'string', description: 'Adresse. Optionnel.' },
      }, required: ['nom'] } } },
  { type: 'function', function: { name: 'create_vehicule',
      description: "Ajoute un véhicule à la flotte. Carte de confirmation avant enregistrement : ne confirme pas toi-même. Demande au moins la plaque d'immatriculation.",
      parameters: { type: 'object', properties: {
        plaque: { type: 'string', description: "Plaque d'immatriculation (ex. AB-123-CD)." },
        nom: { type: 'string', description: 'Nom court / libellé du véhicule (ex. Movano blanc). Optionnel : à défaut, la plaque ou la marque+modèle est utilisée.' },
        marque: { type: 'string', description: 'Marque (ex. Opel, Renault). Optionnel.' },
        modele: { type: 'string', description: 'Modèle (ex. Movano, Master). Optionnel.' },
        carburant: { type: 'string', enum: ['diesel', 'essence', 'electrique', 'hybride', 'gpl'], description: 'Type de carburant. Optionnel.' },
      }, required: ['plaque'] } } },
  { type: 'function', function: { name: 'create_plein',
      description: "Ajoute un plein de carburant pour un véhicule. Carte de confirmation avant enregistrement : ne confirme pas toi-même. Demande le véhicule, le montant, les litres et la date s'ils manquent.",
      parameters: { type: 'object', properties: {
        vehicule: { type: 'string', description: 'Véhicule concerné (plaque ou nom).' },
        montant_ttc_eur: { type: 'number', description: 'Montant TTC du plein en euros.' },
        litres: { type: 'number', description: 'Nombre de litres.' },
        date: { type: 'string', description: 'Date du plein, format YYYY-MM-DD.' },
      }, required: ['vehicule', 'montant_ttc_eur', 'litres', 'date'] } } },
  { type: 'function', function: { name: 'create_incident',
      description: "Déclare un incident (accident, panne, vol, retard…). Carte de confirmation avant enregistrement : ne confirme pas toi-même. Demande la description et la date s'ils manquent.",
      parameters: { type: 'object', properties: {
        description: { type: 'string', description: "Description de l'incident." },
        date: { type: 'string', description: "Date de l'incident, format YYYY-MM-DD." },
        vehicule: { type: 'string', description: 'Véhicule concerné (plaque ou nom). Optionnel.' },
        type: { type: 'string', description: 'Type d\'incident (ex. accident, panne, vol, retard). Optionnel.' },
      }, required: ['description', 'date'] } } },
  { type: 'function', function: { name: 'modifier_client',
      description: "Modifie un client EXISTANT (coordonnées, type, délai de paiement, nom). Carte de confirmation AVANT enregistrement : ne confirme pas toi-même. Identifie le client par son nom. Ne renseigne QUE les champs à changer.",
      parameters: { type: 'object', properties: {
        nom: { type: 'string', description: 'Nom (ou partie) du client à modifier.' },
        nouveau_nom: { type: 'string', description: 'Nouveau nom si on renomme. Optionnel.' },
        ville: { type: 'string', description: 'Nouvelle ville. Optionnel.' },
        adresse: { type: 'string', description: 'Nouvelle adresse. Optionnel.' },
        email: { type: 'string', description: 'Nouvel email. Optionnel.' },
        telephone: { type: 'string', description: 'Nouveau téléphone. Optionnel.' },
        delai_paiement_jours: { type: 'number', description: 'Nouveau délai de paiement (jours). Optionnel.' },
        type: { type: 'string', enum: ['medical','ecommerce','retail','particulier'], description: 'Nouveau type. Optionnel.' },
      }, required: ['nom'] } } },

  // ── RÉDACTION : génère un brouillon de texte (pas d'écriture base). Exécuté par le front via brouillons-generate ──
  { type: 'function', function: { name: 'generer_mail',
      description: "Génère un brouillon de courrier prêt à copier : relance de paiement, email client, annonce de recrutement, ou texte libre. À utiliser dès que l'utilisateur demande d'écrire/rédiger un mail, une relance, une annonce ou un message. Ne rédige pas le texte toi-même : appelle cet outil. Le brouillon sera affiché à l'utilisateur.",
      parameters: { type: 'object', properties: {
        type: { type: 'string', enum: ['relance', 'email', 'annonce', 'libre'],
          description: "Type de brouillon : relance (relance de paiement), email (email client), annonce (annonce de recrutement), libre (autre). Défaut : libre." },
        instructions: { type: 'string', description: "Tout le contexte pour rédiger : destinataire, objet, ton, montants, dates, points à mentionner. Reprends les détails fournis par l'utilisateur." },
      }, required: ['instructions'] } } },
];

interface OutMsg { role: string; content: string; name?: string; tool_call_id?: string; tool_calls?: unknown; }

function sanitizeMessages(raw: unknown): OutMsg[] {
  if (!Array.isArray(raw)) return [];
  const out: OutMsg[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const role = r.role;
    if (role === 'user' || role === 'assistant') {
      const msg: OutMsg = { role, content: typeof r.content === 'string' ? r.content : '' };
      if (role === 'assistant' && Array.isArray(r.tool_calls) && r.tool_calls.length) msg.tool_calls = r.tool_calls;
      out.push(msg);
    } else if (role === 'tool') {
      out.push({
        role: 'tool',
        name: typeof r.name === 'string' ? r.name : '',
        tool_call_id: typeof r.tool_call_id === 'string' ? r.tool_call_id : '',
        content: typeof r.content === 'string' ? r.content : '',
      });
    }
  }
  return out.slice(-MAX_HISTORY);
}

function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) { try { return JSON.parse(raw); } catch { return {}; } }
  return {};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MistralResult { choices?: Array<{ message?: { role?: string; content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> } }>; }

async function callMistral(apiKey: string, payload: unknown): Promise<MistralResult> {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(MISTRAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES) { await sleep(1200 * 2 ** attempt); attempt++; continue; }
      throw new ExternalApiError(`Mistral unreachable: ${(e as Error).message}`);
    }
    clearTimeout(timer);

    if (res.ok) return (await res.json()) as MistralResult;

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const ra = parseFloat(res.headers.get('retry-after') ?? '');
      const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 8000) : 1200 * 2 ** attempt;
      await res.body?.cancel();
      await sleep(waitMs);
      attempt++;
      continue;
    }

    const text = await res.text();
    throw new ExternalApiError(`Mistral ${res.status}`, res.status, text);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return optionsResponse();

  const apiKey = Deno.env.get('MISTRAL_API_KEY');
  if (!apiKey) return jsonResponse({ ok: false, error: 'missing MISTRAL_API_KEY' }, 500);

  let body: { messages?: unknown; knowledge?: unknown; currentTab?: unknown };
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400); }

  const history = sanitizeMessages(body.messages);
  if (history.length === 0) return jsonResponse({ ok: false, error: 'messages required' }, 400);

  const knowledge = typeof body.knowledge === 'string' ? body.knowledge.slice(0, 20000) : '';
  const currentTab = typeof body.currentTab === 'string' ? body.currentTab.slice(0, 80) : '';

  let system = SYSTEM_BASE;
  if (knowledge) system += `\n\n# CARTE DU SITE\n${knowledge}`;
  if (currentTab) system += `\n\n# CONTEXTE\nL'utilisateur consulte actuellement l'onglet : ${currentTab}.`;

  const messages = [{ role: 'system', content: system }, ...history];

  try {
    const data = await callMistral(apiKey, {
      model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.3, max_tokens: 1024,
    });

    const msg = data.choices?.[0]?.message;
    const toolCalls = msg?.tool_calls;

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const parsed = toolCalls.map((tc) => ({ id: tc.id ?? '', name: tc.function?.name ?? '', arguments: safeParseArgs(tc.function?.arguments) }));
      return jsonResponse({ ok: true, data: { type: 'tool_calls', tool_calls: parsed, assistant_message: msg } });
    }

    return jsonResponse({ ok: true, data: { type: 'message', content: msg?.content ?? '' } });
  } catch (err) {
    if (err instanceof ExternalApiError) {
      const rateLimited = err.status === 429;
      return jsonResponse({ ok: false, error: rateLimited ? 'rate_limited' : err.message, rate_limited: rateLimited });
    }
    return jsonResponse({ ok: false, error: (err as Error).message });
  }
});
