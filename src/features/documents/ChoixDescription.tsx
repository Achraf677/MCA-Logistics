import { useState } from 'react'
import { Car, Wand2, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { typeDe } from '../../shared/lib/conventionDocuments'
import type { MessageDescription } from './decrire.logic'

/** Ce que la phrase n'a pas su dire : un bouton par type proche, ou un bouton par véhicule possible. */
export function BoutonsChoix({ message, onType, onVehicule }: {
  message: MessageDescription
  onType: (cle: string) => void
  onVehicule: (plaque: string) => void
}) {
  const bouton = 'rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors'
  return (
    <div role="alert" className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--warning)]">
      <span>{message.texte}</span>
      {message.suggestions.map(c => <button key={c} type="button" onClick={() => onType(c)} className={bouton}>{typeDe(c)?.libelle ?? c}</button>)}
      {message.vehicules.map(v => (
        <button key={v.plaque} type="button" onClick={() => onVehicule(v.plaque)} className={`${bouton} inline-flex items-center gap-1`}><Car size={12} />{v.libelle}</button>
      ))}
    </div>
  )
}

/** Choix imposés par les boutons : le type, ou la plaque du véhicule. */
export interface Imposes { type?: string; vehicule?: string }

/**
 * Barre « Décris ces n documents » : UNE phrase pour toute la sélection (« ce sont les photos d'inspection de notre véhicule Ford »).
 * `onAppliquer` renvoie un message quand la phrase ne suffit pas (type inconnu, plusieurs véhicules) : les boutons de choix le règlent.
 */
export function DescriptionGroupee({ nb, onAppliquer, onAnnuler, libelle = 'Appliquer', desactive = false }: {
  nb: number
  onAppliquer: (texte: string, imposes: Imposes) => MessageDescription | null | Promise<MessageDescription | null>
  onAnnuler: () => void
  libelle?: string
  desactive?: boolean
}) {
  const [texte, setTexte] = useState('')
  const [message, setMessage] = useState<MessageDescription | null>(null)
  /** Choix déjà faits avec les boutons (type, véhicule) : gardés tant que la phrase n'est pas appliquée. */
  const [choisis, setChoisis] = useState<Imposes>({})
  const appliquer = async (nouveaux: Imposes = {}) => {
    const t = texte.trim()
    if (!t || desactive) return
    const imposes = { ...choisis, ...nouveaux }
    const m = await onAppliquer(t, imposes)
    setMessage(m)
    setChoisis(m ? imposes : {})
    if (!m) setTexte('')
  }
  return (
    <form onSubmit={e => { e.preventDefault(); void appliquer() }} className="flex flex-col gap-1.5 flex-1 min-w-[16rem]">
      <div className="flex items-center gap-2">
        <input value={texte} onChange={e => { setTexte(e.target.value); setMessage(null); setChoisis({}) }} aria-label={`Décris ces ${nb} documents`}
          placeholder={`Décris ces ${nb} documents : « photos d'inspection de notre véhicule Ford »`} className="field flex-1 min-w-0" />
        <Button type="submit" variant="primary" className="min-h-10 shrink-0" disabled={!texte.trim() || desactive}><Wand2 size={15} /> {libelle}</Button>
        <button type="button" onClick={onAnnuler} aria-label="Tout désélectionner" title="Tout désélectionner" className="shrink-0 size-9 inline-flex items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]"><X size={16} /></button>
      </div>
      {message && <BoutonsChoix message={message} onType={type => void appliquer({ type })} onVehicule={vehicule => void appliquer({ vehicule })} />}
    </form>
  )
}
