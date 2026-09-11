import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../app/providers'
import { Button } from '../../shared/ui/Button'
import { useToast } from '../../shared/ui/useToast'

/**
 * Rapatriement des justificatifs restés dans Google Drive vers Supabase.
 *
 * Panneau TRANSITOIRE : il ne s'affiche que tant qu'il reste des documents à
 * migrer, et disparaît de lui-même une fois le compteur à zéro. Aucun nettoyage
 * manuel à prévoir.
 *
 * La copie se fait par lots côté Edge Function : Drive est lent, et tout faire
 * en un seul appel dépasserait le temps d'exécution autorisé.
 */
const TAILLE_LOT = 10

interface Reponse {
  ok?: boolean
  error?: string
  message?: string
  migres?: number
  noms?: string[]
  echecs?: Array<{ nom: string; raison: string }>
  restants?: number
}

/**
 * Extrait la vraie raison d'un echec de fonction Edge.
 *
 * supabase-js expose la reponse HTTP dans `error.context` pour un
 * `FunctionsHttpError`. On y lit `message` puis `error` — les deux champs que
 * renvoie la fonction — et on ne retombe sur le message generique que si le
 * corps est reellement vide ou illisible.
 */
async function raisonLisible(error: unknown): Promise<string> {
  const contexte = (error as { context?: unknown }).context
  if (contexte instanceof Response) {
    try {
      const corps = await contexte.clone().json()
      const raison = corps?.message ?? corps?.error
      if (typeof raison === 'string' && raison.trim()) return raison
    } catch { /* corps non-JSON : on garde le message generique */ }
  }
  return (error as Error).message
}

export function MigrationDrive() {
  const { toast } = useToast()
  const [restants, setRestants] = useState<number | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [echecs, setEchecs] = useState<Array<{ nom: string; raison: string }>>([])

  const compter = useCallback(async () => {
    const { count } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .is('storage_path', null)
      .not('drive_file_id', 'is', null)
    setRestants(count ?? 0)
  }, [])

  useEffect(() => { void compter() }, [compter])

  async function migrer() {
    setEnCours(true)
    setEchecs([])
    let total = 0
    const rates: Array<{ nom: string; raison: string }> = []

    try {
      // Boucle jusqu'à épuisement. Le garde-fou sur `migres === 0` évite de
      // tourner indéfiniment si tous les documents d'un lot échouent.
      for (;;) {
        const { data, error } = await supabase.functions.invoke('drive-migrate-to-storage', {
          body: { batch: TAILLE_LOT },
        })
        // `functions.invoke` transforme tout code non-2xx en erreur GENERIQUE
        // (« Edge Function returned a non-2xx status code ») et jette le corps
        // de la reponse. Or c'est justement la que se trouve la raison :
        // « jeton Drive revoque », « reserve au president »… L'utilisateur ne
        // voyait donc qu'« erreur », sans rien pour agir. On va rechercher le
        // message dans la reponse avant d'abandonner.
        if (error) throw new Error(await raisonLisible(error))

        const res = data as Reponse
        if (!res?.ok) throw new Error(res?.message ?? res?.error ?? 'Migration impossible')

        total += res.migres ?? 0
        if (res.echecs?.length) rates.push(...res.echecs)
        setRestants(res.restants ?? 0)

        if ((res.restants ?? 0) === 0) break
        if ((res.migres ?? 0) === 0) break
      }

      setEchecs(rates)
      if (rates.length === 0) {
        toast(`${total} fichier${total > 1 ? 's' : ''} rapatrié${total > 1 ? 's' : ''}.`, 'success')
      } else {
        toast(`${total} rapatrié(s), ${rates.length} en échec.`, 'error')
      }
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setEnCours(false)
      void compter()
    }
  }

  if (restants === null || restants === 0) return null

  // Le composant porte desormais sa propre enveloppe titree : quand il rend
  // `null`, plus rien ne subsiste a l'ecran.
  return (
    <div className="glass rounded-[var(--r-xl)] overflow-hidden">
      <div className="px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <span className="text-[var(--fs-xs)] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Anciens justificatifs Google Drive
        </span>
      </div>
      <div className="p-4 flex flex-col gap-3">
      <p className="text-[var(--fs-sm)] text-[var(--text-muted)]">
        {restants} justificatif{restants > 1 ? 's' : ''} {restants > 1 ? 'sont' : 'est'} encore
        stocké{restants > 1 ? 's' : ''} dans Google Drive. La copie vers Supabase ne supprime rien
        côté Google : l'original reste en place.
      </p>

      <div>
        <Button variant="primary" onClick={migrer} disabled={enCours}>
          {enCours ? 'Rapatriement en cours…' : `Rapatrier les ${restants} fichiers`}
        </Button>
      </div>

      {echecs.length > 0 && (
        <div className="flex flex-col gap-1 text-[var(--fs-sm)]">
          <span className="text-[var(--danger)]">Fichiers non rapatriés :</span>
          <ul className="list-disc pl-5 text-[var(--text-muted)]">
            {echecs.map((e, i) => (
              <li key={i}>{e.nom} — {e.raison}</li>
            ))}
          </ul>
        </div>
      )}
      </div>
    </div>
  )
}
