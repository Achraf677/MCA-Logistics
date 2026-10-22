import { useState, useEffect } from 'react'

const TAUX_USUELS = [0, 5.5, 10, 20]

interface TvaRateInputProps {
  value: number
  onChange: (rate: number) => void
  disabled?: boolean
}

const libelle = (r: number) => `${String(r).replace('.', ',')} %`

/**
 * Taux de TVA : une liste (0 / 5,5 / 10 / 20 %). Un taux atypique déjà saisi
 * (ancienne course, devis) reste proposé tel quel plutôt que d'être écrasé.
 */
export function TvaRateInput({ value, onChange, disabled = false }: TvaRateInputProps) {
  const [courant, setCourant] = useState(value)
  useEffect(() => { setCourant(value) }, [value])
  const options = TAUX_USUELS.some(r => Math.abs(r - courant) < 0.01)
    ? TAUX_USUELS
    : [...TAUX_USUELS, courant].sort((a, b) => a - b)
  return (
    <select
      value={String(courant)}
      disabled={disabled}
      onChange={e => { const r = parseFloat(e.target.value); setCourant(r); onChange(r) }}
      className="field"
      aria-label="Taux de TVA"
    >
      {options.map(r => <option key={r} value={String(r)}>{libelle(r)}</option>)}
    </select>
  )
}
