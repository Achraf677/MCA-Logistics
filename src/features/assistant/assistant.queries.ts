import { supabase } from '../../app/providers'
import { SITE_KNOWLEDGE } from './assistant.knowledge'
import type { AssistantMessage } from './AssistantContext'
import {
  getKpisMois, getAlertes, getImpayes, getTresorerie, getChargesMois,
  getTva, getClient, getClientsList, getFournisseursList,
  getLivraisons, getTournees, getIncidentsList, getInspectionsList,
  getVehicules, getCarburantMois, getEntretiens, getEquipe, getHeures,
} from './assistant.tools'

// ── Registre d'outils front (exécutés localement, résultat renvoyé à l'IA) ─────
// Chaque outil réutilise la query/logique de l'onglet correspondant (cf. assistant.tools.ts).

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const ASSISTANT_TOOLS: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  // Vague A — finance / tiers / alertes
  get_kpis_mois:    (args) => getKpisMois(str(args.mois)),
  get_alertes:      () => getAlertes(),
  get_impayes:      () => getImpayes(),
  get_tresorerie:   () => getTresorerie(),
  get_charges_mois: (args) => getChargesMois(str(args.mois)),
  get_tva:          (args) => getTva(str(args.mois)),
  get_client:       (args) => getClient(str(args.nom) ?? ''),
  get_clients:      () => getClientsList(),
  get_fournisseurs: () => getFournisseursList(),
  // Vague B — opérations / flotte / équipe
  get_livraisons:    (args) => getLivraisons(str(args.date), str(args.statut)),
  get_tournees:      (args) => getTournees(str(args.date)),
  get_incidents:     (args) => getIncidentsList(str(args.statut)),
  get_inspections:   (args) => getInspectionsList(str(args.statut)),
  get_vehicules:     () => getVehicules(),
  get_carburant_mois:(args) => getCarburantMois(str(args.mois)),
  get_entretiens:    () => getEntretiens(),
  get_equipe:        () => getEquipe(),
  get_heures:        (args) => getHeures(str(args.membre), str(args.mois)),
}

// Outils d'ÉCRITURE : jamais exécutés automatiquement. Quand l'IA en demande un,
// la boucle s'arrête et renvoie une proposition d'action (carte de confirmation UI).
const WRITE_TOOLS = new Set<string>([
  'create_livraison', 'changer_statut_livraison',
  'create_charge', 'create_client', 'create_plein', 'create_incident',
  'create_fournisseur', 'create_vehicule', 'modifier_client', 'modifier_livraison',
])

// ── Queries LOCALES à l'assistant pour modifier_client (étanchéité : aucune
// dépendance à features/clients). Périmètre société courante assuré par la RLS.

export interface AssistantClientMatch {
  id: string
  name: string
  city: string | null
  address: string | null
  email: string | null
  phone: string | null
  type: string | null
  payment_terms: number | null
}

/** Recherche partielle de clients par nom (insensible à la casse, société courante via RLS). */
export async function findClientsByName(nom: string): Promise<AssistantClientMatch[]> {
  const q = (nom ?? '').trim().replace(/[(),]/g, '')
  if (!q) return []
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, city, address, email, phone, type, payment_terms')
    .ilike('name', `%${q}%`)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as AssistantClientMatch[]
}

/** Update partiel d'un client (uniquement les colonnes fournies dans `patch`). */
export async function updateClient(id: string, patch: Record<string, unknown>) {
  return supabase.from('clients').update(patch).eq('id', id)
}

/** Update partiel d'une livraison (uniquement les colonnes fournies dans `patch`). */
export async function updateDelivery(id: string, patch: Record<string, unknown>) {
  return supabase.from('deliveries').update(patch).eq('id', id)
}

// Outils de RÉDACTION : produisent un brouillon de texte (aucune écriture base,
// pas de carte de confirmation). La boucle s'arrête et délègue au front.
const GENERATION_TOOLS = new Set<string>(['generer_mail'])

// ── Boucle de tour (function calling) ─────────────────────────────────────────

interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }

type AssistantData =
  | { type: 'message'; content?: string }
  | { type: 'tool_calls'; tool_calls?: ToolCall[]; assistant_message?: unknown }

interface AssistantResponse {
  ok?: boolean
  error?: string
  rate_limited?: boolean
  data?: AssistantData
}

const RATE_LIMIT_MESSAGE =
  "⏳ L'assistant reçoit trop de demandes à la fois. Patiente quelques secondes et réessaie."

const SMOOTHING_MS = 350
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Tente de lire le corps JSON d'une erreur HTTP de Function. */
async function readFunctionErrorMessage(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).json()
      return body?.data?.message ?? body?.message ?? body?.error ?? null
    } catch {
      // corps illisible
    }
  }
  return null
}

const MAX_ITERATIONS = 5

/** Résultat d'un tour : texte, proposition d'action d'écriture, ou brouillon à générer. */
export type AssistantTurnResult =
  | { kind: 'text'; text: string }
  | { kind: 'action'; tool: string; args: unknown }
  | { kind: 'draft'; tool: string; args: unknown }

/**
 * Joue un tour d'assistant avec function calling.
 * `displayHistory` = messages d'AFFICHAGE (user/assistant texte) uniquement ;
 * les messages tool_calls/tool vivent dans la boucle d'un tour et ne sont pas persistés.
 * Un outil d'ÉCRITURE n'est jamais exécuté ici : la boucle s'arrête et renvoie
 * { kind:'action', … } (le tool_call d'écriture n'est PAS poussé dans l'historique).
 */
export async function runAssistantTurn(
  displayHistory: AssistantMessage[],
  currentTab?: string,
): Promise<AssistantTurnResult> {
  const mistralMessages: unknown[] = displayHistory.map(m => ({ role: m.role, content: m.text }))

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { data, error } = await supabase.functions.invoke('assistant-chat', {
      body: { messages: mistralMessages, knowledge: SITE_KNOWLEDGE, currentTab },
    })

    if (error) {
      const msg = await readFunctionErrorMessage(error)
      throw new Error(msg ?? error.message)
    }

    const res = data as AssistantResponse
    if (!res?.ok) {
      // L'Edge renvoie les erreurs en HTTP 200 ; le rate-limit n'est pas une vraie erreur.
      if (res?.rate_limited) return { kind: 'text', text: RATE_LIMIT_MESSAGE }
      throw new Error(res?.error ?? 'Assistant indisponible')
    }

    if (res.data?.type === 'message') {
      return { kind: 'text', text: res.data.content ?? '' }
    }

    if (res.data?.type === 'tool_calls') {
      const calls = res.data.tool_calls ?? []

      // Outil d'écriture : on n'exécute rien, on ne persiste pas le tool_call,
      // on renvoie une proposition d'action à confirmer côté UI.
      const writeCall = calls.find(tc => WRITE_TOOLS.has(tc.name))
      if (writeCall) {
        return { kind: 'action', tool: writeCall.name, args: writeCall.arguments }
      }

      // Outil de rédaction : on arrête la boucle, on ne persiste pas le tool_call,
      // et on délègue la génération du brouillon au front.
      const genCall = calls.find(tc => GENERATION_TOOLS.has(tc.name))
      if (genCall) {
        return { kind: 'draft', tool: genCall.name, args: genCall.arguments }
      }

      // Outils de lecture : repush le message brut de l'IA TEL QUEL, puis les résultats.
      mistralMessages.push(res.data.assistant_message)
      for (const tc of calls) {
        let result: unknown
        try {
          const tool = ASSISTANT_TOOLS[tc.name]
          result = tool ? await tool(tc.arguments) : { error: 'outil inconnu' }
        } catch (e) {
          result = { error: (e as Error).message }
        }
        mistralMessages.push({
          role: 'tool',
          name: tc.name,
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        })
      }
      // Lissage entre deux itérations pour ménager le rate-limit de l'Edge.
      await sleep(SMOOTHING_MS)
      continue
    }

    throw new Error('Réponse assistant inattendue')
  }

  return { kind: 'text', text: "Je n'ai pas réussi à aboutir, reformule ta question." }
}
