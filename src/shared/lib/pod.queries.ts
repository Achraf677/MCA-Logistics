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
export async function enregistrerPod(id: string, recipientName: string) {
  return supabase
    .from('deliveries')
    .update({
      pod_recipient_name: recipientName,
      pod_captured_at: new Date().toISOString(),
    })
    .eq('id', id)
}
