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

const ASSISTANT_TOOLS: Record<string, (args: any) => Promise<unknown>> = {
  // Vague A — finance / tiers / alertes
  get_kpis_mois:    (args) => getKpisMois(str(args?.mois)),
  get_alertes:      () => getAlertes(),
  get_impayes:      () => getImpayes(),
  get_tresorerie:   () => getTresorerie(),
  get_charges_mois: (args) => getChargesMois(str(args?.mois)),
  get_tva:          (args) => getTva(str(args?.mois)),
  get_client:       (args) => getClient(str(args?.nom) ?? ''),
  get_clients:      () => getClientsList(),
  get_fournisseurs: () => getFournisseursList(),
  // Vague B — opérations / flotte / équipe
  get_livraisons:    (args) => getLivraisons(str(args?.date), str(args?.statut)),
  get_tournees:      (args) => getTournees(str(args?.date)),
  get_incidents:     (args) => getIncidentsList(str(args?.statut)),
  get_inspections:   (args) => getInspectionsList(str(args?.statut)),
  get_vehicules:     () => getVehicules(),
  get_carburant_mois:(args) => getCarburantMois(str(args?.mois)),
  get_entretiens:    () => getEntretiens(),
  get_equipe:        () => getEquipe(),
  get_heures:        (args) => getHeures(str(args?.membre), str(args?.mois)),
}

// ── Boucle de tour (function calling) ─────────────────────────────────────────

interface ToolCall { id: string; name: string; arguments: unknown }

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

/**
 * Joue un tour d'assistant avec function calling.
 * `displayHistory` = messages d'AFFICHAGE (user/assistant texte) uniquement ;
 * les messages tool_calls/tool vivent dans la boucle d'un tour et ne sont pas persistés.
 */
export async function runAssistantTurn(
  displayHistory: AssistantMessage[],
  currentTab?: string,
): Promise<string> {
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
      if (res?.rate_limited) return RATE_LIMIT_MESSAGE
      throw new Error(res?.error ?? 'Assistant indisponible')
    }

    if (res.data?.type === 'message') {
      return res.data.content ?? ''
    }

    if (res.data?.type === 'tool_calls') {
      // Repush le message brut de l'IA TEL QUEL, puis le résultat de chaque outil.
      mistralMessages.push(res.data.assistant_message)
      for (const tc of res.data.tool_calls ?? []) {
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

  return "Je n'ai pas réussi à aboutir, reformule ta question."
}
