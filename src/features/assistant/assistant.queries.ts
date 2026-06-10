import { supabase } from '../../app/providers'
import { effectiveHtCts, centimesToEuros } from '../../shared/lib/money'
import { SITE_KNOWLEDGE } from './assistant.knowledge'
import type { AssistantMessage } from './AssistantContext'

// ── Outil de lecture : KPIs du mois ───────────────────────────────────────────
// Réutilise la MÊME définition du CA HT que les onglets Statistiques et Rentabilité :
//   deliveries.amount_ht_cts (via effectiveHtCts), statut != 'annulee', filtre sur `date`.
// Voir statistiques.logic.ts (caMensuel/annualTotals) et rentabilite.logic.ts (monthlyRows).
// RLS appliquée par le client authentifié — aucun company_id en dur.

export interface KpisMois {
  mois: string          // 'YYYY-MM'
  ca_ht_eur: number     // euros (nombre)
  nb_livraisons: number // hors annulées
  nb_facturees: number
  nb_payees: number
}

function monthBounds(mois?: string): { label: string; start: string; end: string } {
  let y: number, m: number
  if (mois && /^\d{4}-\d{2}$/.test(mois)) {
    y = Number(mois.slice(0, 4))
    m = Number(mois.slice(5, 7)) - 1
  } else {
    const now = new Date()
    y = now.getFullYear()
    m = now.getMonth()
  }
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    label: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: iso(new Date(y, m, 1)),
    end: iso(new Date(y, m + 1, 0)), // dernier jour du mois
  }
}

export async function getKpisMois(mois?: string): Promise<KpisMois> {
  const { label, start, end } = monthBounds(mois)

  // Même projection que les onglets : seule `amount_ht_cts` est lue (pas montant_ht_cts),
  // pour un CA strictement identique à l'affichage de Statistiques/Rentabilité.
  const { data, error } = await supabase
    .from('deliveries')
    .select('amount_ht_cts, statut')
    .gte('date', start)
    .lte('date', end)
    .neq('statut', 'annulee')

  if (error) throw new Error(error.message)
  const rows = data ?? []

  const caCts = rows.reduce((s, d) => s + effectiveHtCts(d), 0)

  return {
    mois: label,
    ca_ht_eur: centimesToEuros(caCts),
    nb_livraisons: rows.length,
    nb_facturees: rows.filter(d => d.statut === 'facturee').length,
    nb_payees: rows.filter(d => d.statut === 'payee').length,
  }
}

// ── Registre d'outils front (exécutés localement, résultat renvoyé à l'IA) ─────

const ASSISTANT_TOOLS: Record<string, (args: any) => Promise<unknown>> = {
  get_kpis_mois: (args) => getKpisMois(typeof args?.mois === 'string' ? args.mois : undefined),
}

// ── Boucle de tour (function calling) ─────────────────────────────────────────

interface ToolCall { id: string; name: string; arguments: unknown }

type AssistantData =
  | { type: 'message'; content?: string }
  | { type: 'tool_calls'; tool_calls?: ToolCall[]; assistant_message?: unknown }

interface AssistantResponse {
  ok?: boolean
  error?: string
  data?: AssistantData
}

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
    if (!res?.ok) throw new Error(res?.error ?? 'Assistant indisponible')

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
      continue
    }

    throw new Error('Réponse assistant inattendue')
  }

  return "Je n'ai pas réussi à aboutir, reformule ta question."
}
