import { useState, useEffect, useRef } from 'react'

const SHORTCUTS = [0, 5.5, 10, 19, 20]

interface TvaRateInputProps {
  value: number
  onChange: (rate: number) => void
  disabled?: boolean
}

const inputBase = [
  'w-full h-9 px-3 pr-8 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)]',
  'text-[var(--text)] text-[var(--fs-body)] focus:outline-none focus:border-[var(--brand)]',
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
].join(' ')

export function TvaRateInput({ value, onChange, disabled = false }: TvaRateInputProps) {
  const [raw, setRaw] = useState(String(value))
  const lastExt = useRef(value)

  // Sync display quand le parent réinitialise la valeur (ex. ouverture d'un autre enregistrement)
  useEffect(() => {
    if (lastExt.current !== value) {
      lastExt.current = value
      setRaw(String(value))
    }
  }, [value])

  const tryCommit = (s: string) => {
    const n = parseFloat(s.replace(',', '.'))
    if (!isNaN(n) && n >= 0 && n <= 100) {
      lastExt.current = n
      onChange(n)
    }
  }

  const pick = (r: number) => {
    lastExt.current = r
    setRaw(String(r))
    onChange(r)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Saisie libre */}
      <div className="relative">
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={raw}
          disabled={disabled}
          onChange={e => { setRaw(e.target.value); tryCommit(e.target.value) }}
          onBlur={e => {
            const n = parseFloat(e.target.value.replace(',', '.'))
            if (!isNaN(n) && n >= 0 && n <= 100) {
              lastExt.current = n
              onChange(n)
              setRaw(String(n))
            } else {
              setRaw(String(value))
            }
          }}
          className={inputBase}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-disabled)] text-[var(--fs-xs)] pointer-events-none select-none">
          %
        </span>
      </div>
      {/* Raccourcis courants */}
      {!disabled && (
        <div className="flex gap-1 flex-wrap">
          {SHORTCUTS.map(r => {
            const active = Math.abs(value - r) < 0.01
            return (
              <button
                key={r}
                type="button"
                onClick={() => pick(r)}
                className={[
                  'px-2 py-0.5 rounded text-[var(--fs-xs)] font-mono transition-colors',
                  active
                    ? 'bg-[var(--brand)] text-white'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--brand)] hover:text-[var(--brand)]',
                ].join(' ')}
              >
                {r === 5.5 ? '5,5' : r}%
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
