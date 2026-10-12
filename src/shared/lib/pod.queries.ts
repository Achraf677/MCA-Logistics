import { supabase } from '../../app/providers'

/**
 * Enregistrement de la preuve de livraison (POD).
 *
 * Vit dans `shared/` parce que DEUX ecrans l'ecrivent desormais : le tiroir
 * Livraisons cote bureau, et l'ecran « Mes courses » du chauffeur sur le
 * terrain. Les features etant etanches, le seul endroit ou les deux peuvent
 * puiser la meme ecriture est ici. Le jour ou la preuve gagne un champ, il
 * est ajoute une fois et les deux ecrans suivent.
 *
 * La photo, elle, n'est PAS ecrite par cette fonction : c'est un document
 * ordinaire, depose via `documents.queries.uploadDocument` avec la categorie
 * « POD ». Les deux ecrans font donc la meme chose dans le meme ordre —
 * d'abord la photo, ensuite l'horodatage.
 */
export async function enregistrerPod(id: string, recipientName: string | null) {
  const { data, error } = await supabase
    .from('deliveries')
    .update({
      // Une preuve peut exister sans nom (photo, signature) : on horodate
      // quand meme, mais on n'efface pas un nom deja saisi par un vide.
      ...(recipientName?.trim() ? { pod_recipient_name: recipientName.trim() } : {}),
      pod_captured_at: new Date().toISOString(),
    })
    .eq('id', id)
    // Sans `.select`, une ecriture refusee par la RLS « reussit » sans rien
    // ecrire (0 ligne, aucune erreur). On relit l'id pour le savoir.
    .select('id')
  if (error) return { error }
  if (!data || data.length === 0) return { error: erreurAucuneLigne() }
  return { error: null }
}

/**
 * Erreur rendue quand la base n'a modifie AUCUNE ligne : la RLS a filtre la
 * ligne sans lever d'erreur. Code reconnaissable (`0_LIGNE`) pour qu'un ecran
 * puisse la traduire a sa facon.
 */
export const MESSAGE_ECRITURE_REFUSEE =
  "Enregistrement refusé : ton compte n'a pas encore ce droit, préviens le bureau."

export function erreurAucuneLigne(): { name: string; message: string; code: string } {
  return { name: 'EcritureRefusee', message: MESSAGE_ECRITURE_REFUSEE, code: '0_LIGNE' }
}
