import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, ExternalLink, File, FileImage, FileText, Folder, FolderCheck, FolderPen, HardDrive, Pencil, Wand2, X } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import type { ClasseHistorique } from '../../shared/lib/conventionDocuments'
import { tailleLisible } from './documents.logic'
import type { Referents } from './decrire.logic'
import { RenommageDossier } from './RenommageDossier'
import { RenommageFichier } from './RenommageFichier'
import { DOSSIER_DRIVE, lireFichierDrive, parcourirDrive, renommerDansDrive, type ContenuDrive, type FichierDrive } from './documents.queries'

interface Etape { id: string; nom: string }

const jourFr = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')

function IconeFichier({ mime }: { mime: string }) {
  const Icone = mime === DOSSIER_DRIVE ? Folder : mime.startsWith('image/') ? FileImage : mime === 'application/pdf' || mime.startsWith('application/vnd.google-apps.') ? FileText : File
  return (
    <span className={`size-10 shrink-0 rounded-[var(--r-md)] grid place-items-center ${mime === DOSSIER_DRIVE ? 'bg-[var(--brand)]/12 text-[var(--brand)]' : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'}`}>
      <Icone size={18} />
    </span>
  )
}

/**
 * Bibliothèque : le Drive de la société (un seul compte Google, branché dans Paramètres). On navigue dans les dossiers,
 * on cherche par nom dans tout le Drive, on ouvre dans l'appli, on renomme. Les documents confirmés y sont rangés par
 * l'onglet « À confirmer » (<dossier de rangement>/<Dossier>/<Année>).
 */
export function BibliothequeDocuments({ peutEcrire, estPresident, referents, classes, toast }: {
  peutEcrire: boolean
  estPresident: boolean
  /** Clients, fournisseurs, salariés, plaques : « Dis-moi ce que c'est » reconnaît le tiers avec. */
  referents: Referents
  /** Documents déjà rangés : les habitudes de l'utilisateur. */
  classes: readonly ClasseHistorique[]
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [pile, setPile] = useState<Etape[]>([{ id: 'root', nom: 'Mon Drive' }])
  // Résultat du dernier chargement, daté de la demande qui l'a produit : `chargement` = la demande actuelle n'a pas encore répondu.
  const [etat, setEtat] = useState<{ cle: string; contenu: ContenuDrive | null; erreur: string | null }>({ cle: '', contenu: null, erreur: null })
  const [q, setQ] = useState('')
  const [recherche, setRecherche] = useState('')
  const [edition, setEdition] = useState<{ id: string; nom: string } | null>(null)
  const [ouvrant, setOuvrant] = useState<string | null>(null)
  /** Fichier dont le panneau « Renommer avec l'IA » est ouvert, et panneau « Renommer le dossier ». */
  const [renommageIA, setRenommageIA] = useState<string | null>(null)
  const [dossierOuvert, setDossierOuvert] = useState(false)
  const demande = useRef(0)

  const courant = pile[pile.length - 1]

  // Recherche différée : on n'interroge le Drive qu'une fois la frappe terminée.
  useEffect(() => {
    const t = setTimeout(() => setRecherche(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const cle = `${courant.id}|${recherche}`
  const charger = useCallback(async () => {
    const n = ++demande.current
    const { contenu: c, erreur: e } = await parcourirDrive({ dossierId: courant.id, recherche })
    if (n === demande.current) setEtat({ cle: `${courant.id}|${recherche}`, contenu: c, erreur: e })
  }, [courant.id, recherche])

  useEffect(() => { void charger() }, [charger])
  const { contenu, erreur } = etat
  const chargement = etat.cle !== cle

  const entrer = (f: FichierDrive) => { setQ(''); setRecherche(''); setRenommageIA(null); setDossierOuvert(false); setPile(p => [...p, { id: f.id, nom: f.name }]) }
  const allerA = (i: number) => { setQ(''); setRecherche(''); setRenommageIA(null); setDossierOuvert(false); setPile(p => p.slice(0, i + 1)) }

  const ouvrir = async (f: FichierDrive) => {
    setOuvrant(f.id)
    const lu = await lireFichierDrive(f)
    setOuvrant(null)
    if (lu) { ouvrirDocument(lu.url, { titre: f.name, type: lu.type }); return }
    if (f.webViewLink) window.open(f.webViewLink, '_blank', 'noopener')
    else toast('Ce format ne s\'ouvre pas ici', 'error')
  }

  const enregistrerNom = async () => {
    if (!edition) return
    const nom = edition.nom.trim()
    if (!nom) { toast('Le nom ne peut pas être vide', 'error'); return }
    const echec = await renommerDansDrive(edition.id, nom)
    setEdition(null)
    if (echec) { toast(echec, 'error'); return }
    toast('Renommé dans le Drive')
    await charger()
  }

  /** Renomme dans le Drive APRÈS avoir changé le nom à l'écran : un échec remet l'ancien nom (jamais de rechargement de la liste). */
  const renommerOptimiste = async (items: Array<{ id: string; ancien: string; nouveau: string }>): Promise<string[]> => {
    const noms = new Map(items.map(i => [i.id, i.nouveau]))
    const patcher = (qui: Map<string, string>) => setEtat(e => ({ ...e, contenu: e.contenu && { ...e.contenu, files: e.contenu.files.map(f => (qui.has(f.id) ? { ...f, name: qui.get(f.id)! } : f)) } }))
    patcher(noms)
    const echecs: string[] = []
    const restants = [...items]
    await Promise.all(Array.from({ length: Math.min(4, restants.length) }, async () => {
      for (let i = restants.shift(); i; i = restants.shift()) {
        const echec = await renommerDansDrive(i.id, i.nouveau)
        if (echec) echecs.push(i.id)
      }
    }))
    if (echecs.length > 0) patcher(new Map(items.filter(i => echecs.includes(i.id)).map(i => [i.id, i.ancien])))
    return echecs
  }

  const renommerFichierIA = async (f: FichierDrive, nom: string) => {
    setRenommageIA(null)
    const echecs = await renommerOptimiste([{ id: f.id, ancien: f.name, nouveau: nom }])
    if (echecs.length > 0) toast('Renommage impossible : l\'ancien nom est remis', 'error')
    else toast('Renommé dans le Drive')
  }

  const definirRacine = async () => {
    const { erreur: e } = await parcourirDrive({ dossierId: courant.id, definirRacine: true })
    if (e) { toast(e, 'error'); return }
    toast(`« ${courant.nom} » est le dossier de rangement`)
    await charger()
  }

  if (erreur === 'non_connecte') {
    return (
      <EmptyState icon={<HardDrive size={40} />} title="Le Drive n'est pas connecté"
        description="Connecte le compte Google de la société (contact@mcalogistics.fr) dans Paramètres › Google. Un seul accès pour tout le site."
        action={{ label: 'Ouvrir Paramètres', onClick: () => { window.location.href = '/systeme?tab=parametres' } }} />
    )
  }

  const dossiers = contenu?.folders ?? []
  const fichiers = contenu?.files ?? []
  const estRacine = !!contenu && contenu.racine_id === courant.id
  const lignes: FichierDrive[] = [...dossiers, ...fichiers]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <BarreRecherche value={q} onChange={setQ} placeholder="Chercher dans tout le Drive : nom du fichier…" ariaLabel="Rechercher dans le Drive"
          raccourci className="flex-1 min-w-[14rem] max-w-xl" compteur={recherche ? `${lignes.length} résultat${lignes.length > 1 ? 's' : ''}` : undefined} />
        {contenu?.racine_id && courant.id !== contenu.racine_id && (
          <Button variant="secondary" className="min-h-10" onClick={() => { setQ(''); setRecherche(''); setPile([{ id: 'root', nom: 'Mon Drive' }, { id: contenu.racine_id!, nom: 'Dossier de rangement' }]) }}>
            <FolderCheck size={15} /> Dossier de rangement
          </Button>
        )}
        {peutEcrire && courant.id !== 'root' && !recherche && fichiers.length > 0 && (
          <Button variant="secondary" className="min-h-10" onClick={() => { setRenommageIA(null); setDossierOuvert(o => !o) }}>
            <FolderPen size={15} /> Renommer le dossier
          </Button>
        )}
        {estPresident && courant.id !== 'root' && !recherche && (
          <Button variant="secondary" className="min-h-10" disabled={estRacine} onClick={() => void definirRacine()}>
            <FolderCheck size={15} /> {estRacine ? 'Dossier de rangement actuel' : 'Ranger ici les nouveaux documents'}
          </Button>
        )}
      </div>

      {dossierOuvert && !recherche && (
        <RenommageDossier key={courant.id} dossierNom={courant.nom} fichiers={fichiers} onAppliquer={renommerOptimiste} onFermer={() => setDossierOuvert(false)} toast={toast} />
      )}

      {!recherche && (
        <nav aria-label="Chemin" className="flex flex-wrap items-center gap-1 text-sm">
          {pile.map((e, i) => (
            <span key={e.id} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={14} className="text-[var(--text-disabled)]" />}
              <button type="button" disabled={i === pile.length - 1} onClick={() => allerA(i)}
                className={i === pile.length - 1 ? 'font-semibold text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}>
                {e.nom}
              </button>
            </span>
          ))}
        </nav>
      )}

      {chargement ? (
        <div className="flex flex-col gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : erreur ? (
        <p className="text-[var(--danger)] text-sm py-8 text-center">{erreur}</p>
      ) : lignes.length === 0 ? (
        <EmptyState icon={<Folder size={36} />} title={recherche ? 'Aucun résultat' : 'Dossier vide'}
          description={recherche ? 'Aucun fichier du Drive ne porte ce nom.' : 'Rien dans ce dossier.'} />
      ) : (
        <ul className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] divide-y divide-[var(--border)] overflow-hidden">
          {lignes.map(f => {
            const estDossier = f.mimeType === DOSSIER_DRIVE
            return (
              <li key={f.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-card-hover)] transition-colors">
                {edition?.id === f.id ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <IconeFichier mime={f.mimeType} />
                    <input autoFocus className="field flex-1 min-w-0" value={edition.nom} onChange={e => setEdition({ id: f.id, nom: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') void enregistrerNom(); if (e.key === 'Escape') setEdition(null) }} />
                    <BoutonIcone icone={Check} libelle="Enregistrer le nom" taille="sm" onClick={() => void enregistrerNom()} />
                    <BoutonIcone icone={X} libelle="Annuler" taille="sm" onClick={() => setEdition(null)} />
                  </div>
                ) : (
                  <>
                    <button type="button" onClick={() => (estDossier ? entrer(f) : void ouvrir(f))} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <IconeFichier mime={f.mimeType} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-sm text-[var(--text)]">{f.name}</span>
                        <span className="block truncate text-xs text-[var(--text-muted)]">
                          {[estDossier ? 'Dossier' : tailleLisible(f.size ? Number(f.size) : null), jourFr(f.modifiedTime)].filter(Boolean).join(' · ')}
                          {ouvrant === f.id ? ' · ouverture…' : ''}
                        </span>
                      </span>
                    </button>
                    <span className="flex items-center gap-1 shrink-0">
                      {f.webViewLink && <BoutonIcone icone={ExternalLink} libelle="Ouvrir dans Google Drive" taille="sm" onClick={() => window.open(f.webViewLink, '_blank', 'noopener')} />}
                      {peutEcrire && !estDossier && <BoutonIcone icone={Wand2} libelle="Renommer avec l'IA" taille="sm" actif={renommageIA === f.id} onClick={() => setRenommageIA(r => (r === f.id ? null : f.id))} />}
                      {peutEcrire && <BoutonIcone icone={Pencil} libelle="Renommer" taille="sm" onClick={() => setEdition({ id: f.id, nom: f.name })} />}
                    </span>
                  </>
                )}
                {renommageIA === f.id && (
                  <RenommageFichier fichier={f} voisins={fichiers.filter(x => x.id !== f.id).map(x => x.name)} cheminDossier={pile.map(e => e.nom)} referents={referents} classes={classes}
                    onAppliquer={nom => void renommerFichierIA(f, nom)} onFermer={() => setRenommageIA(null)} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
