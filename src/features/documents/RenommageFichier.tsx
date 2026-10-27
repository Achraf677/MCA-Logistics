import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Sparkles, Wand2, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { nomPropose, origineDuDossier, typeDe, type ClasseHistorique, type Origine } from '../../shared/lib/conventionDocuments'
import { analyserDescription, aujourdhuiLocal, suggererTypes, type Referents } from './decrire.logic'
import { proposerRenommages, type FichierDrive, type PropositionRenommage } from './documents.queries'
import { nomValide } from './renommage.logic'

/**
 * Renommer UN fichier déjà dans le Drive : l'IA le lit sur place (rien à retélécharger ni à redéposer) et propose un nom de la convention.
 * Tu corriges le nom, ou tu dis ce que c'est (« permis de conduire Jean Dupont », « le verso ») : le nom suit aussitôt, sans IA.
 */
export function RenommageFichier({ fichier, voisins, cheminDossier, referents, classes, onAppliquer, onFermer }: {
  fichier: FichierDrive
  /** Noms des autres fichiers du dossier (jamais deux noms identiques). */
  voisins: string[]
  /** Noms des dossiers parents (« Mon Drive », « MCA Documents », …) : le dossier dit souvent de qui est le fichier. */
  cheminDossier: string[]
  referents: Referents
  classes: readonly ClasseHistorique[]
  onAppliquer: (nom: string) => void
  onFermer: () => void
}) {
  const [etat, setEtat] = useState<{ cle: string; proposition: PropositionRenommage | null; erreur: string | null }>({ cle: '', proposition: null, erreur: null })
  const [nom, setNom] = useState(fichier.name)
  const [decrit, setDecrit] = useState('')
  const [message, setMessage] = useState<{ texte: string; suggestions: string[] } | null>(null)
  const chargement = etat.cle !== fichier.id

  useEffect(() => {
    let vivant = true
    void proposerRenommages([{ id: fichier.id, nom: fichier.name }]).then(({ resultats, erreur }) => {
      if (!vivant) return
      const p = resultats.find(r => r.id === fichier.id) ?? null
      setEtat({ cle: fichier.id, proposition: p, erreur: erreur ?? (p ? null : 'Pas de réponse de l\'IA') })
      if (p) setNom(p.nouveau)
    })
    return () => { vivant = false }
  }, [fichier.id, fichier.name])

  const pris = useMemo(() => new Set(voisins.map(n => n.toLowerCase())), [voisins])
  const origine = useMemo<Origine>(() => {
    const o = origineDuDossier(cheminDossier)
    return { salarie: o.salarie, vehicule: o.vehicule, client: o.client, deposePar: null }
  }, [cheminDossier])

  const decrire = (typeImpose?: string) => {
    const texte = decrit.trim()
    if (!texte) return
    const r = analyserDescription(texte, referents, aujourdhuiLocal(), { origine, classes, type: typeImpose })
    if (!r) { setMessage({ texte: 'Je ne sais pas encore ce que c\'est. Choisis un type :', suggestions: suggererTypes(texte, classes) }); return }
    const dateDepot = fichier.modifiedTime?.slice(0, 10) ?? aujourdhuiLocal()
    setNom(nomPropose({ date: r.date, dateDepot: typeDe(r.type)?.intemporel ? null : dateDepot, type: r.type, tiers: r.tiers, reference: r.reference, partie: r.partie }, fichier.name, pris))
    setMessage(null)
    setDecrit('')
  }

  const p = etat.proposition
  const change = nomValide(nom) && nom.trim() !== fichier.name
  const doublon = pris.has(nom.trim().toLowerCase()) && nom.trim() !== fichier.name

  return (
    <div className="w-full basis-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 flex flex-col gap-2.5">
      <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <Sparkles size={13} className="text-[var(--brand)]" />
        <span className="truncate min-w-0">{fichier.name}</span>
        {p && <Badge color={p.lu_via === 'nom' ? 'warning' : 'success'}>{p.lu_via === 'image' ? 'Lu sur l\'image' : p.lu_via === 'texte' ? 'Lu dans le texte' : 'D\'après le nom'}</Badge>}
      </p>

      {chargement ? <Skeleton className="h-10" /> : (
        <>
          <input value={nom} onChange={e => setNom(e.target.value)} aria-label="Nouveau nom" className="field font-medium text-[var(--text)]"
            onKeyDown={e => { if (e.key === 'Enter' && change && !doublon) onAppliquer(nom.trim()); if (e.key === 'Escape') onFermer() }} />
          {(etat.erreur || p?.raison) && <p className="text-xs text-[var(--warning)]">{etat.erreur ?? p?.raison}</p>}
          {doublon && <p className="flex items-center gap-1.5 text-xs text-[var(--warning)]"><AlertTriangle size={13} /> Un fichier porte déjà ce nom dans le dossier.</p>}
        </>
      )}

      <form onSubmit={e => { e.preventDefault(); decrire() }} className="flex items-center gap-2">
        <input value={decrit} onChange={e => { setDecrit(e.target.value); setMessage(null) }} aria-label="Dis-moi ce que c'est"
          placeholder="Dis-moi ce que c'est : « permis de conduire Jean Dupont », « le verso »…" className="field flex-1 min-w-0" />
        <Button type="submit" variant="secondary" className="min-h-10 shrink-0" disabled={!decrit.trim()}><Wand2 size={15} /> Renommer</Button>
      </form>
      {message && (
        <div role="alert" className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--warning)]">
          <span>{message.texte}</span>
          {message.suggestions.map(c => (
            <button key={c} type="button" onClick={() => decrire(c)} className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--text)] hover:bg-[var(--bg-card-hover)] transition-colors">
              {typeDe(c)?.libelle ?? c}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" className="min-h-10" disabled={chargement || !change || doublon} onClick={() => onAppliquer(nom.trim())}><Check size={15} /> Appliquer</Button>
        <Button variant="secondary" className="min-h-10" onClick={onFermer}><X size={15} /> Annuler</Button>
      </div>
    </div>
  )
}
