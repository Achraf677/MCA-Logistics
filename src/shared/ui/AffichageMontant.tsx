import { useCallback, useState } from 'react'
import { ListeDeroulante } from './ListeDeroulante'

/** Montants affichés en HT (référence de Flotte) ou en TTC (pour retrouver le prix payé). */
export type AffichageMontant = 'ht' | 'ttc'

const CLE = 'mca.affichageMontant'

function lire(): AffichageMontant {
  try { return localStorage.getItem(CLE) === 'ttc' ? 'ttc' : 'ht' } catch { return 'ht' }
}

/** Choix HT / TTC, mémorisé sur cet appareil et partagé par Carburant et Entretiens. */
export function useAffichageMontant(): [AffichageMontant, (m: AffichageMontant) => void] {
  const [mode, setMode] = useState<AffichageMontant>(lire)
  const choisir = useCallback((m: AffichageMontant) => {
    setMode(m)
    try { localStorage.setItem(CLE, m) } catch { /* stockage indisponible : le choix reste pour cette visite */ }
  }, [])
  return [mode, choisir]
}

/** Liste « HT / TTC » posée à gauche de « Nouveau ». */
export function SelecteurHtTtc({ mode, onChange }: { mode: AffichageMontant; onChange: (m: AffichageMontant) => void }) {
  return (
    <div className="w-24">
      <ListeDeroulante valeur={mode} ariaLabel="Afficher les montants en HT ou en TTC" recherche={false}
        onChange={v => onChange(v === 'ttc' ? 'ttc' : 'ht')}
        options={[{ valeur: 'ht', libelle: 'HT' }, { valeur: 'ttc', libelle: 'TTC' }]} />
    </div>
  )
}
