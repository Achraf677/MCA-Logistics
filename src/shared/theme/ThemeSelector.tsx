import { useState } from 'react'
import { THEMES, applyTheme, getThemeId } from './themes'

export function ThemeSelector() {
  const [active, setActive] = useState(getThemeId())
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {THEMES.map(t => (
        <button key={t.id} type="button"
          onClick={() => { applyTheme(t.id); setActive(t.id) }}
          className={`text-left rounded-[var(--r-lg)] border p-3 transition-all ${active === t.id ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'}`}>
          <div className="h-10 rounded-[var(--r-md)] mb-2" style={{ background: t.swatch }} />
          <div className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{t.name}</div>
          {active === t.id && <div className="text-[var(--fs-xs)] text-[var(--brand)] mt-0.5">Actif</div>}
        </button>
      ))}
    </div>
  )
}
