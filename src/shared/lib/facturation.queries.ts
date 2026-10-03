// Facturation d'une ou plusieurs courses via l'Edge `pennylane-invoice`.
// Partagée par Livraisons et Devis (« Facturer directement », lot U4) : une seule
// façon de facturer, donc les mêmes règles partout (échéance plafonnée, verrou,
// référence obligatoire, autoliquidation, suivi du paiement).
import { supabase } from '../../app/providers'
import { lireErreurEdge } from './erreurEdge'
import type { NatureEchec } from './erreurEdge'

//
// Trois issues possibles quand on appelle `pennylane-invoice` :
//   1. Succès : l'Edge a créé la facture ET passé les courses à `facturee`.
//   2. Refus MÉTIER (4xx, ou Pennylane qui refuse la facture) : rien n'a été
//      émis. Le statut ne bouge PAS (la course reste `livree`), la cause est
//      renvoyée telle quelle à l'écran (l'Edge l'a aussi écrite dans
//      `sync_error` pour une course seule). Il faut corriger, puis refacturer.
//   3. Échec TECHNIQUE (réseau, délai, 5xx) : on ne sait pas trancher. Repli
//      `sync_pending = true` + `sync_error` = cause, le statut reste `livree` ;
//      le bouton « Resynchroniser » de la liste relancera l'appel.
// Cas particulier : `enregistrement_echoue` — la facture EXISTE chez Pennylane
// mais l'Edge n'a pas pu l'écrire en base. On l'écrit d'ici ; surtout pas de
// `sync_pending`, sinon le rattrapage la refacturerait (double facture).

export type ResultatFacturation =
  | { ok: true; data: Record<string, unknown> | null }
  | { ok: false; message: string; nature: NatureEchec }

async function appelerFacturation(
  body: Record<string, unknown>,
  ids: string[],
): Promise<ResultatFacturation> {
  let data: unknown
  let error: unknown
  try {
    const r = await supabase.functions.invoke('pennylane-invoice', { body })
    data = r.data
    error = r.error
  } catch (e) {
    data = null
    error = e
  }

  const echec = await lireErreurEdge(data, error)
  if (!echec) {
    const d = data as { data?: Record<string, unknown> } | null
    return { ok: true, data: d?.data ?? null }
  }

  if (echec.code === 'enregistrement_echoue' && echec.corps?.pennylane_invoice_id) {
    const c = echec.corps
    const now = new Date().toISOString()
    const { error: upErr } = await supabase.from('deliveries').update({
      pennylane_invoice_id: String(c.pennylane_invoice_id),
      pennylane_invoice_number: (c.pennylane_invoice_number as string | null) ?? null,
      invoice_group_id: (c.invoice_group_id as string | null) ?? null,
      statut: 'facturee',
      invoiced_at: now,
      pennylane_synced_at: now,
      sync_pending: false,
      sync_error: null,
    }).in('id', ids)
    if (!upErr) return { ok: true, data: c }
    return {
      ok: false,
      nature: 'metier',
      message: `Facture Pennylane ${String(c.pennylane_invoice_number ?? c.pennylane_invoice_id)} créée `
        + 'mais non enregistrée ici. NE PAS refacturer : noter ce numéro et prévenir le support.',
    }
  }

  return { ok: false, message: echec.message, nature: echec.nature }
}

/** Facture UNE course (livree → facturee via l'Edge). */
export async function facturerCourse(id: string): Promise<ResultatFacturation> {
  const r = await appelerFacturation({ delivery_id: id }, [id])
  if (!r.ok && r.nature === 'technique') {
    // Repli : l'état reste `livree`, la course est marquée à resynchroniser.
    await supabase.from('deliveries')
      .update({ sync_pending: true, sync_error: `Facturation non aboutie : ${r.message}` })
      .eq('id', id)
      .is('pennylane_invoice_id', null)
    return { ...r, message: `Pennylane injoignable — facturation en attente, à resynchroniser. (${r.message})` }
  }
  return r
}

/**
 * Facture PLUSIEURS courses du même client sur UNE facture (liste Livraisons).
 * Aucun repli `sync_pending` ici : le rattrapage re-facture course par course,
 * il éclaterait la facture groupée en N factures. L'échec est renvoyé tel quel.
 */
export async function facturerGroupe(ids: string[]): Promise<ResultatFacturation> {
  if (ids.length === 0) return { ok: false, message: 'Aucune course sélectionnée.', nature: 'metier' }
  if (ids.length === 1) return facturerCourse(ids[0])
  return appelerFacturation({ delivery_ids: ids }, ids)
}

