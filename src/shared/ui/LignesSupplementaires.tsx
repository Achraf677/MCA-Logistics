import { useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from './Button'
import { TvaRateInput } from './TvaRateInput'
import { formatMoney } from '../lib/money'
import type { DeliveryExtraLine } from '../lib/money'
import { SUPPLEMENTS_USUELS } from '../lib/supplements'
import type { Supplement } from '../lib/supplements'

// Partagé : fiche livraison (`deliveries.extra_lines`) et devis (`quotes.extra_lines`),
// même forme de ligne, même catalogue de suppléments du client.

const inputCls = 'field'
function Input({ value, onChange, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean
}) {
  return (
    <input type="text" value={value} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

// ── Éditeur de lignes supplémentaires ────────────────────────────────────────
// Section repliée par défaut si aucune ligne. Bouton « + Ajouter » toujours
// visible (sauf verrouillage post-facturation). Chaque ligne : label, quantité,
// HT unitaire, taux TVA, croix pour supprimer. Aucun stockage intermédiaire :
// on écrit directement dans le state parent (extraLines), sauvegardé avec la
// livraison via le champ JSONB `extra_lines`.

export function ExtraLinesEditor({
  lines, onChange, defaultTvaRate, tauxForce = null, disabled, catalogue = [],
}: {
  /** Suppléments du client ; sans catalogue, les libellés usuels (prix à saisir). */
  catalogue?: Supplement[]
  lines: DeliveryExtraLine[]
  onChange: Dispatch<SetStateAction<DeliveryExtraLine[]>>
  defaultTvaRate: number
  /** Taux imposé à l'affichage (0 en autoliquidation) : champ TVA figé. */
  tauxForce?: number | null
  disabled: boolean
}) {
  const addLine = () => {
    onChange(prev => [...prev, {
      label: '',
      quantity: 1,
      amount_ht_cts: 0,
      tva_rate: Number.isFinite(defaultTvaRate) ? defaultTvaRate : 20,
    }])
  }
  const updateLine = (i: number, patch: Partial<DeliveryExtraLine>) => {
    onChange(prev => prev.map((l, j) => j === i ? { ...l, ...patch } : l))
  }
  const removeLine = (i: number) => {
    onChange(prev => prev.filter((_, j) => j !== i))
  }
  const ajouter = (s: Supplement) => {
    onChange(prev => [...prev, {
      label: s.label,
      quantity: 1,
      amount_ht_cts: s.prix_ht_cts,
      tva_rate: Number.isFinite(defaultTvaRate) ? defaultTvaRate : 20,
    }])
  }
  const proposes: Supplement[] = catalogue.length > 0
    ? catalogue
    : SUPPLEMENTS_USUELS.map(label => ({ label, prix_ht_cts: 0 }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
          Lignes supplémentaires
        </span>
        {!disabled && (
          <Button variant="ghost" size="compact" onClick={addLine}>
            <Plus size={13} />
            Ajouter une ligne
          </Button>
        )}
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-1.5">
          {proposes.map(s => (
            <button key={s.label} type="button" onClick={() => ajouter(s)}
              title={s.prix_ht_cts ? `${formatMoney(s.prix_ht_cts)} HT` : 'Prix à saisir'}
              className="h-7 px-2.5 rounded-[var(--r-pill)] border border-[var(--border)] text-xs text-[var(--text-muted)]
                hover:border-[var(--brand)] hover:text-[var(--text)] inline-flex items-center gap-1">
              <Plus size={11} /> {s.label}
              {s.prix_ht_cts > 0 && <span className="font-mono">{formatMoney(s.prix_ht_cts)}</span>}
            </button>
          ))}
        </div>
      )}
      {lines.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">
          {catalogue.length > 0
            ? 'Suppléments de ce client : un clic les ajoute à la facture.'
            : 'Suppléments usuels (prix à saisir) — fixez les prix de ce client dans sa fiche.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <ExtraLineRow
              key={i}
              line={line}
              tauxForce={tauxForce}
              disabled={disabled}
              onUpdate={patch => updateLine(i, patch)}
              onRemove={() => removeLine(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ligne extra (édition inline) ────────────────────────────────────────────
// Saisie libre : le HT et la Qté sont conservés en texte local pendant la
// frappe (rawHt/rawQty) pour ne pas être re-formatés à chaque touche. On
// n'écrit dans l'état parent qu'au onBlur, après normalisation (« , » → « . »).
// Bénéfices : on peut taper « 2,01 », les zéros de fin ne disparaissent pas,
// et l'input ne devient jamais rouge pendant la saisie.
//
// La sync inverse (parent → local) n'est pas mise en place volontairement :
// les seuls changements externes à `line` passent par onUpdate ou remove/add
// (via ExtraLinesEditor), et remove/add démontent/remontent la ligne — ce qui
// suffit à réinitialiser les états locaux avec les bonnes valeurs.

function ExtraLineRow({
  line, tauxForce, disabled, onUpdate, onRemove,
}: {
  line: DeliveryExtraLine
  tauxForce: number | null
  disabled: boolean
  onUpdate: (patch: Partial<DeliveryExtraLine>) => void
  onRemove: () => void
}) {
  const [rawHt, setRawHt] = useState<string>(() =>
    line.amount_ht_cts ? (line.amount_ht_cts / 100).toFixed(2).replace('.', ',') : '',
  )
  const [rawQty, setRawQty] = useState<string>(() =>
    String(line.quantity ?? 1),
  )

  // Autorise chiffres + un séparateur optionnel (« , » ou « . ») + chiffres.
  // La regex accepte aussi la chaîne vide et un caractère isolé « , » / « . »
  // pour ne pas bloquer la frappe intermédiaire.
  const DECIMAL_RE = /^[0-9]*[.,]?[0-9]*$/

  const commitHt = () => {
    const s = rawHt.trim().replace(',', '.')
    if (s === '' || s === '.') {
      onUpdate({ amount_ht_cts: 0 })
      setRawHt('')
      return
    }
    const n = parseFloat(s)
    if (!Number.isFinite(n) || n < 0) {
      // Reset visuel à la dernière valeur valide connue si saisie corrompue.
      setRawHt(line.amount_ht_cts ? (line.amount_ht_cts / 100).toFixed(2).replace('.', ',') : '')
      return
    }
    const cts = Math.round(n * 100)
    onUpdate({ amount_ht_cts: cts })
    setRawHt((cts / 100).toFixed(2).replace('.', ','))
  }

  const commitQty = () => {
    const s = rawQty.trim().replace(',', '.')
    if (s === '' || s === '.') {
      onUpdate({ quantity: 1 })
      setRawQty('1')
      return
    }
    const n = parseFloat(s)
    if (!Number.isFinite(n) || n < 1) {
      onUpdate({ quantity: 1 })
      setRawQty('1')
      return
    }
    onUpdate({ quantity: n })
    setRawQty(String(n))
  }

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            value={line.label}
            onChange={v => onUpdate({ label: v })}
            placeholder="Ex. : Attente 30 min"
            disabled={disabled}
          />
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Supprimer la ligne"
            className="p-1.5 rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--danger)]
              hover:bg-[var(--danger)]/10 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Qté">
          <input
            type="text"
            inputMode="decimal"
            value={rawQty}
            onChange={e => {
              const v = e.target.value
              if (DECIMAL_RE.test(v)) setRawQty(v)
            }}
            onBlur={commitQty}
            placeholder="1"
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="HT unit. (€)">
          <input
            type="text"
            inputMode="decimal"
            value={rawHt}
            onChange={e => {
              const v = e.target.value
              if (DECIMAL_RE.test(v)) setRawHt(v)
            }}
            onBlur={commitHt}
            placeholder="0,00"
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label={tauxForce != null ? 'TVA % (autoliq.)' : 'TVA %'}>
          {/* En autoliquidation le taux propre de la ligne est conservé en
              base (si la coche est retirée, il revient) mais la facture part
              à 0 % : on affiche 0, non modifiable. */}
          <TvaRateInput
            value={tauxForce ?? line.tva_rate}
            onChange={r => onUpdate({ tva_rate: r })}
            disabled={disabled || tauxForce != null}
          />
        </Field>
      </div>
    </div>
  )
}
