import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, FolderPen, Wand2, X } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { Button } from '../../shared/ui/Button'
import { proposerRenommages, type FichierDrive } from './documents.queries'
import { aAnalyser, aAppliquer, ligneDepuisProposition, lignesEnDouble, lignesVisibles, TAILLE_PAQUET, type LigneRevue } from './renommage.logic'
import { lotsDe } from './documents.logic'

type Phase = 'depart' | 'lecture' | 'revue'

/**
 * Renommer tout un dossier du Drive : l'IA lit les fichiers (100 au plus par passage, par paquets de 5), puis une liste de revue
 * « ancien nom → nouveau nom » : tu décoches, tu corriges, tu appliques en un geste. Rien n'est renommé sans ta validation.
 */
export function RenommageDossier({ dossierNom, fichiers, onAppliquer, onFermer, toast }: {
  dossierNom: string
  /** Fichiers du dossier ouvert (dossiers compris : ils sont ignorés). */
  fichiers: FichierDrive[]
  /** Applique les renommages tout de suite (optimiste) ; renvoie les identifiants qui ont échoué. */
  onAppliquer: (items: Array<{ id: string; ancien: string; nouveau: string }>) => Promise<string[]>
  onFermer: () => void
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const analyse = useMemo(() => aAnalyser(fichiers), [fichiers])
  const [phase, setPhase] = useState<Phase>('depart')
  const [lignes, setLignes] = useState<LigneRevue[]>([])
  const [avance, setAvance] = useState({ fait: 0, total: 0 })
  const [erreur, setErreur] = useState<string | null>(null)
  const [masquer, setMasquer] = useState(true)
  const arret = useRef(false)
  const existants = useMemo(() => fichiers.map(f => f.name), [fichiers])

  const lire = async () => {
    arret.current = false
    setErreur(null)
    setLignes([])
    setPhase('lecture')
    const lots = lotsDe(analyse.envoyes, TAILLE_PAQUET)
    setAvance({ fait: 0, total: analyse.envoyes.length })
    const reserves: string[] = []
    let fait = 0
    for (const lot of lots) {
      if (arret.current) break
      const { resultats, erreur: e } = await proposerRenommages(lot.map(f => ({ id: f.id, nom: f.name })), reserves)
      if (e) { setErreur(e); break }
      const nouvelles = resultats.map(ligneDepuisProposition)
      for (const r of resultats) reserves.push(r.nouveau)
      setLignes(l => [...l, ...nouvelles])
      fait += lot.length
      setAvance({ fait, total: analyse.envoyes.length })
    }
    setPhase('revue')
  }

  const modifier = (id: string, maj: Partial<LigneRevue>) => setLignes(l => l.map(x => (x.id === id ? { ...x, ...maj } : x)))
  const doubles = useMemo(() => lignesEnDouble(lignes, existants), [lignes, existants])
  const retenues = useMemo(() => aAppliquer(lignes, existants), [lignes, existants])
  const visibles = lignesVisibles(lignes, masquer)

  const appliquer = async () => {
    const items = retenues.map(l => ({ id: l.id, ancien: l.ancien, nouveau: l.nouveau.trim() }))
    if (items.length === 0) return
    const instantane = lignes
    const ids = new Set(items.map(i => i.id))
    setLignes(l => l.filter(x => !ids.has(x.id)))
    const echecs = await onAppliquer(items)
    if (echecs.length > 0) setLignes(l => [...l, ...instantane.filter(x => echecs.includes(x.id))])
    const ok = items.length - echecs.length
    if (ok > 0) toast(ok === 1 ? '1 fichier renommé' : `${ok} fichiers renommés`)
    if (echecs.length > 0) toast(`${echecs.length} non renommé${echecs.length > 1 ? 's' : ''} : l'ancien nom est remis`, 'error')
  }

  return (
    <section aria-label="Renommer le dossier" className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <FolderPen size={18} className="text-[var(--brand)] shrink-0" />
        <h3 className="flex-1 min-w-0 truncate font-semibold text-[var(--text)]">Renommer « {dossierNom} »</h3>
        <Button variant="secondary" className="min-h-10" onClick={() => { arret.current = true; onFermer() }}><X size={15} /> Fermer</Button>
      </div>

      {phase === 'depart' && (
        <div className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
          {analyse.envoyes.length === 0 ? (
            <p>Aucun fichier à renommer ici : {analyse.dejaConformes > 0 ? `les ${analyse.dejaConformes} fichiers respectent déjà la convention.` : 'le dossier ne contient pas de fichier.'}</p>
          ) : (
            <>
              <p><strong className="text-[var(--text)]">{analyse.envoyes.length}</strong> fichier{analyse.envoyes.length > 1 ? 's' : ''} à lire par l'IA{analyse.dejaConformes > 0 ? `, ${analyse.dejaConformes} déjà conforme${analyse.dejaConformes > 1 ? 's' : ''} (ignoré${analyse.dejaConformes > 1 ? 's' : ''})` : ''}.
                {analyse.trop > 0 && ` ${analyse.trop} de plus resteront pour un deuxième passage.`}</p>
              <p>Les pièces d'identité, les dossiers Sécurité, Direction et Social et RH ne sont jamais lus par l'IA : leur nom est proposé d'après le nom du fichier. Rien n'est renommé sans ton accord.</p>
              <div><Button variant="primary" className="min-h-10" onClick={() => void lire()}><Wand2 size={15} /> Lire les fichiers</Button></div>
            </>
          )}
        </div>
      )}

      {phase === 'lecture' && (
        <div className="flex flex-col gap-2" role="status">
          <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden"><div className="h-full bg-[var(--brand)] transition-all" style={{ width: `${avance.total ? (avance.fait / avance.total) * 100 : 0}%` }} /></div>
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <span className="flex-1">Lecture : {avance.fait} sur {avance.total}…</span>
            <Button variant="secondary" className="min-h-10" onClick={() => { arret.current = true }}>Arrêter</Button>
          </div>
        </div>
      )}

      {erreur && <p role="alert" className="text-sm text-[var(--danger)]">{erreur}</p>}

      {phase === 'revue' && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2 text-[var(--text-muted)] cursor-pointer">
              <input type="checkbox" checked={masquer} onChange={e => setMasquer(e.target.checked)} /> Masquer ceux déjà conformes
            </label>
            <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text)] underline-offset-2 hover:underline" onClick={() => setLignes(l => l.map(x => ({ ...x, coche: !x.conforme })))}>Tout cocher</button>
            <button type="button" className="text-[var(--text-muted)] hover:text-[var(--text)] underline-offset-2 hover:underline" onClick={() => setLignes(l => l.map(x => ({ ...x, coche: false })))}>Tout décocher</button>
            <span className="flex-1" />
            <Button variant="primary" className="min-h-10" disabled={retenues.length === 0} onClick={() => void appliquer()}><Check size={15} /> Appliquer ({retenues.length})</Button>
          </div>

          {visibles.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{lignes.length === 0 ? 'Rien à proposer.' : 'Tout est conforme ou déjà appliqué.'}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--r-lg)] border border-[var(--border)] overflow-hidden">
              {visibles.map(l => (
                <li key={l.id} className="flex flex-col gap-1 px-3 py-2.5 bg-[var(--bg-elevated)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <input type="checkbox" aria-label={`Renommer ${l.ancien}`} checked={l.coche} onChange={e => modifier(l.id, { coche: e.target.checked })} className="shrink-0" />
                    <span className="text-xs text-[var(--text-muted)] truncate min-w-0 flex-1" title={l.ancien}>{l.ancien}</span>
                    <Badge color={l.luVia === 'nom' ? 'warning' : 'success'}>{l.luVia === 'nom' ? 'Nom seulement' : 'Lu'}</Badge>
                  </div>
                  <input value={l.nouveau} aria-label={`Nouveau nom de ${l.ancien}`} onChange={e => modifier(l.id, { nouveau: e.target.value, coche: true })}
                    className={`field font-medium ${doubles.has(l.id) ? '!border-[var(--warning)]' : ''}`} />
                  {doubles.has(l.id) && <p className="flex items-center gap-1.5 text-xs text-[var(--warning)]"><AlertTriangle size={13} /> Ce nom existe déjà dans le dossier ou en double ici.</p>}
                  {l.raison && <p className="text-xs text-[var(--text-muted)]">{l.raison}</p>}
                </li>
              ))}
            </ul>
          )}
          {analyse.trop > 0 && <p className="text-xs text-[var(--text-muted)]">{analyse.trop} fichier{analyse.trop > 1 ? 's' : ''} non lu{analyse.trop > 1 ? 's' : ''} (au-delà de 100) : relance après avoir appliqué.</p>}
          <div><Button variant="secondary" className="min-h-10" onClick={() => { setPhase('depart'); setLignes([]) }}>Relire le dossier</Button></div>
        </>
      )}
    </section>
  )
}
