import { useState, useEffect } from 'react'
import { Shell } from '../../app/Shell'
import { useProfile } from '../../app/providers'
import { useSearchParams } from 'react-router-dom'
import { BarreOnglets } from './BarreOnglets'
import { Aujourdhui } from './Aujourdhui'
import { MaTournee } from './MaTournee'
import { useScanOuvert } from './useScanOuvert'
import { MesDepenses } from './MesDepenses'
import { Moi } from './Moi'
import { lireOnglet, type OngletEspace } from './espace.logic'
import { remonterEnHaut } from './EspaceCommun'
import { getMaFicheComplete } from './mescourses.queries'
import type { EtatFiche } from './mescourses.types'

const TITRES: Record<OngletEspace, string> = {
  courses: 'Aujourd’hui', tournee: 'Ma tournée', depenses: 'Mes dépenses', moi: 'Moi',
}

/**
 * Espace salarié — « Mes courses » et ses 4 onglets (navigation en bas) :
 * Aujourd'hui (récap du jour) · Ma tournée (feuille de route de colis scannée) · Dépenses · Moi.
 * « Ma journée » supprimé le 19/10/2026 (pas encore au point).
 * L'onglet vit dans l'URL (`?onglet=`) : un retour arrière, un lien ou un
 * rechargement retombent au même endroit.
 */
export function MesCourses() {
  const { profile } = useProfile()
  const [params, setParams] = useSearchParams()
  const onglet = lireOnglet(params.get('onglet'))
  const changerOnglet = (o: OngletEspace) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (o === 'courses') p.delete('onglet'); else p.set('onglet', o)
      return p
    })
    remonterEnHaut()
  }

  // Fiche Équipe du compte (Ma tournée, Moi) : lue une fois pour les onglets.
  const [fiche, setFiche] = useState<EtatFiche>({ chargee: false, data: null, erreur: null })
  useEffect(() => {
    if (!profile) return
    let annule = false
    getMaFicheComplete(profile.id).then(({ data, error }) => {
      if (!annule) setFiche({ chargee: true, data, erreur: error ? error.message : null })
    })
    return () => { annule = true }
  }, [profile])

  const scanOuvert = useScanOuvert(fiche.data?.id ?? null)

  return (
    <Shell pageTitle={TITRES[onglet]}>
      <div className="mx-auto w-full max-w-[40rem]">
        {onglet === 'courses' && <Aujourdhui fiche={fiche} scan={scanOuvert} onOuvrirTournee={() => changerOnglet('tournee')} />}
        {onglet === 'tournee' && <MaTournee fiche={fiche} />}
        {onglet === 'depenses' && <MesDepenses />}
        {onglet === 'moi' && <Moi fiche={fiche} />}
      </div>
      <BarreOnglets actif={onglet} onChange={changerOnglet} pastilles={{ tournee: !!scanOuvert && scanOuvert.statut !== 'en_cours' }} />
    </Shell>
  )
}
