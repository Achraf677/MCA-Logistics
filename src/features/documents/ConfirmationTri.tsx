import { useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCheck, FolderTree, Sparkles, Undo2 } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { getDownloadUrl } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { TYPES_DOCUMENT, cheminDefaut, nomPropose } from '../../shared/lib/documentsTri'
import { montantSaisiEnCts } from '../../shared/lib/depenses'
import { cheminAvecAnnee, cheminEnTexte, texteEnChemin } from './documents.logic'
import { rangerDansDrive, remettreDansInbox } from './documents.queries'
import { MiniatureDoc } from './MiniatureDoc'

interface Edition {
  type: string
  date: string
  tiers: string
  montant: string
  reference: string
  nom: string
  /** Le nom a été tapé à la main : on ne le recalcule plus. */
  nomManuel: boolean
  /** Dossier du Drive, écrit « Achats / Carburant / 2026 ». */
  chemin: string
  /** Le chemin a été modifié à la main : il ne suit plus le type / la date. */
  cheminManuel: boolean
}

const SEUIL_DOUTE = 0.7
/** Documents envoyés au Drive par requête. */
const PAQUET = 8

const montantTexte = (cts: number | null | undefined) => (cts != null ? (cts / 100).toFixed(2).replace('.', ',') : '')

function editionInitiale(d: DocumentRow): Edition {
  const p = d.proposition
  return {
    type: p?.type ?? '', date: p?.date ?? '', tiers: p?.tiers ?? '', montant: montantTexte(p?.montant_ttc_cts), reference: p?.reference ?? '',
    nom: p?.nom ?? d.file_name, nomManuel: false,
    chemin: cheminEnTexte(p?.chemin?.length ? p.chemin : cheminDefaut({ type: p?.type, date: p?.date, vehicule: p?.vehicule })), cheminManuel: false,
  }
}

/** À confirmer : l'IA a proposé un nom rangé et des champs ; tu corriges si besoin, tu confirmes (ou tu rejettes). */
export function ConfirmationTri({ docs, classes, miniatures, peutEcrire, driveOk, patch, toast }: {
  docs: DocumentRow[]
  classes: DocumentRow[]
  miniatures: Record<string, string>
  peutEcrire: boolean
  /** Compte Google connecté avec le scope Drive : sans lui, rien ne peut être rangé. */
  driveOk: boolean
  /** Met à jour des documents dans la liste de l'onglet, sans recharger. */
  patch: (ids: string[], maj: Partial<DocumentRow>) => void
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [editions, setEditions] = useState<Record<string, Edition>>({})
  const [envoi, setEnvoi] = useState(0)

  const edition = (d: DocumentRow): Edition => editions[d.id] ?? editionInitiale(d)
  const nomsPris = useMemo(() => new Set(classes.map(c => c.file_name.toLowerCase())), [classes])

  const modifier = (d: DocumentRow, maj: Partial<Edition>) => {
    const e = { ...edition(d), ...maj }
    // Tant que le nom n'a pas été tapé à la main, il suit le type / la date / le tiers / le montant / la référence.
    if (!e.nomManuel && !('nom' in maj)) {
      const montant = montantSaisiEnCts(e.montant)
      e.nom = nomPropose({
        date: e.date || null, type: e.type || null, tiers: e.tiers || null, reference: e.reference || null,
        montant_ttc_cts: montant != null && !Number.isNaN(montant) ? montant : null,
      }, d.file_name, nomsPris)
    }
    // Tant que le chemin n'a pas été tapé à la main, il suit le type (dossier par défaut) puis la date (dossier d'année).
    if (!e.cheminManuel && !('chemin' in maj)) {
      if ('type' in maj) e.chemin = cheminEnTexte(cheminDefaut({ type: e.type || null, date: e.date || null, vehicule: d.proposition?.vehicule }))
      else if ('date' in maj) e.chemin = cheminEnTexte(cheminAvecAnnee(texteEnChemin(e.chemin), e.date || null))
    }
    setEditions(p => ({ ...p, [d.id]: e }))
  }

  const classement = (d: DocumentRow) => {
    const e = edition(d)
    const m = montantSaisiEnCts(e.montant)
    return {
      nom: e.nom.trim(), chemin: texteEnChemin(e.chemin), type: e.type || null, date: e.date || null, tiers: e.tiers.trim() || null, reference: e.reference.trim() || null,
      montant_ttc_cts: m != null && !Number.isNaN(m) ? m : null, resume: d.proposition?.resume ?? null,
    }
  }
  const pret = (d: DocumentRow) => { const e = edition(d); return driveOk && e.nom.trim() !== '' && e.type !== '' && texteEnChemin(e.chemin).length > 0 }

  /**
   * Range un lot : les cartes disparaissent TOUT DE SUITE (le document passe « classé » dans la liste), l'envoi vers le Drive se fait en
   * arrière-plan par paquets de 8 (une requête par paquet). Un document qui échoue revient dans À confirmer, tes corrections gardées.
   */
  const envoyer = async (lot: DocumentRow[]) => {
    if (lot.length === 0) return
    const items = lot.map(d => ({ id: d.id, classement: classement(d) }))
    const avant = new Map(lot.map(d => [d.id, d]))
    for (const it of items) patch([it.id], { statut_tri: 'classe', file_name: it.classement.nom, proposition: null })
    setEnvoi(n => n + lot.length)
    let ok = 0
    let premierEchec: string | null = null
    for (let i = 0; i < items.length; i += PAQUET) {
      const resultats = await rangerDansDrive(items.slice(i, i + PAQUET))
      for (const r of resultats) {
        if (r.ok) { ok++; continue }
        premierEchec ??= r.raison ?? 'Envoi impossible'
        const d = avant.get(r.id)
        if (d) patch([r.id], { statut_tri: 'propose', file_name: d.file_name, proposition: d.proposition })
      }
    }
    setEnvoi(n => n - lot.length)
    if (premierEchec) toast(`${lot.length - ok} non rangé${lot.length - ok > 1 ? 's' : ''} : ${premierEchec}`, 'error')
    if (ok > 0) toast(ok === 1 ? 'Document rangé dans le Drive' : `${ok} documents rangés dans le Drive`)
  }

  const confirmer = (d: DocumentRow) => { void envoyer([d]) }

  const rejeter = async (d: DocumentRow) => {
    patch([d.id], { statut_tri: 'a_trier', proposition: null })
    const { error } = await remettreDansInbox(d.id)
    if (error) { patch([d.id], { statut_tri: 'propose', proposition: d.proposition }); toast(error.message, 'error'); return }
    toast('Remis dans l\'Inbox')
  }

  const toutConfirmer = () => {
    const aFaire = docs.filter(pret)
    if (docs.length > aFaire.length) toast(`${docs.length - aFaire.length} à compléter (type ou dossier manquant)`, 'error')
    void envoyer(aFaire)
  }

  const ouvrir = async (d: DocumentRow) => {
    const url = await getDownloadUrl(d)
    if (url) ouvrirDocument(url, { titre: d.file_name, type: d.mime_type?.startsWith('image/') ? 'image' : undefined })
  }

  if (docs.length === 0) {
    return <EmptyState icon={<Sparkles size={40} />} title="Rien à confirmer" description="Lance le tri depuis l'Inbox : les propositions de l'IA arrivent ici." />
  }

  const prets = docs.filter(pret).length

  return (
    <div className="flex flex-col gap-3">
      {envoi > 0 && (
        <p role="status" className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="size-2 rounded-full bg-[var(--brand)] animate-pulse" /> Envoi vers le Drive : {envoi} document{envoi > 1 ? 's' : ''}… tu peux continuer.
        </p>
      )}
      {!driveOk && (
        <p className="rounded-[var(--r-xl)] border border-[var(--warning)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text)]">
          Le Drive n'est pas branché : rien ne peut être rangé. Connecte le compte Google de la société dans Paramètres › Google (coche bien « Drive »).
        </p>
      )}
      {peutEcrire && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
          <Sparkles size={18} className="text-[var(--brand)] shrink-0" />
          <p className="flex-1 min-w-[12rem] text-sm text-[var(--text-muted)]">
            L'IA a lu <strong className="text-[var(--text)]">{docs.length}</strong> document{docs.length > 1 ? 's' : ''}. Vérifie le nom et le type, corrige si besoin : rien n'est rangé sans ta confirmation.
          </p>
          <Button variant="primary" className="min-h-10" disabled={prets === 0} onClick={toutConfirmer}>
            <CheckCheck size={15} /> Tout confirmer ({prets})
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {docs.map(d => {
          const e = edition(d)
          const c = d.proposition?.confiance
          const douteux = (k: 'type' | 'date' | 'tiers' | 'montant') => (c ? c[k] < SEUIL_DOUTE : true)
          const bord = (k: 'type' | 'date' | 'tiers' | 'montant', vide: boolean) => (vide || douteux(k) ? '!border-[var(--warning)]' : '')
          return (
            <li key={d.id} className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--bg-card)] p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <button type="button" onClick={() => void ouvrir(d)} aria-label="Ouvrir le document" className="shrink-0">
                  <MiniatureDoc mime={d.mime_type} url={d.storage_path ? miniatures[d.storage_path] : undefined} taille="lg" />
                </button>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <p className="flex items-center gap-2 text-xs text-[var(--text-muted)] min-w-0">
                    <span className="truncate">{d.file_name}</span>
                    <ArrowRight size={12} className="shrink-0" />
                    <Badge color={d.proposition?.lu_via === 'tournee' ? 'warning' : d.proposition?.lu_via === 'texte' ? 'info' : 'success'}>{d.proposition?.lu_via === 'tournee' ? 'Rangé d\'après la tournée' : d.proposition?.lu_via === 'texte' ? 'Lu dans le texte' : 'Lu sur l\'image'}</Badge>
                  </p>
                  <input value={e.nom} aria-label="Nom proposé" disabled={!peutEcrire}
                    onChange={ev => modifier(d, { nom: ev.target.value, nomManuel: true })}
                    className="field font-medium text-[var(--text)]" />
                  {d.proposition?.resume && <p className="text-xs text-[var(--text-muted)] line-clamp-2">{d.proposition.resume}</p>}
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                <ListeDeroulante valeur={e.type} onChange={v => modifier(d, { type: v })} ariaLabel="Type de document" placeholder="Type…" recherche={false}
                  invalide={e.type === ''} disabled={!peutEcrire}
                  options={TYPES_DOCUMENT.map(t => ({ valeur: t.cle, libelle: t.libelle, detail: t.dossier }))} />
                <input type="date" value={e.date} onChange={ev => modifier(d, { date: ev.target.value })} aria-label="Date du document" disabled={!peutEcrire}
                  className={`field ${bord('date', e.date === '')}`} />
                <input value={e.tiers} onChange={ev => modifier(d, { tiers: ev.target.value })} placeholder="Client / fournisseur" aria-label="Tiers" disabled={!peutEcrire}
                  className={`field ${bord('tiers', e.tiers === '')}`} />
                <input value={e.montant} onChange={ev => modifier(d, { montant: ev.target.value })} placeholder="Montant TTC (€)" inputMode="decimal" aria-label="Montant TTC" disabled={!peutEcrire}
                  className={`field font-mono ${Number.isNaN(montantSaisiEnCts(e.montant) as number) ? '!border-[var(--danger)]' : ''}`} />
                <input value={e.reference} onChange={ev => modifier(d, { reference: ev.target.value })} placeholder="Référence (n° facture…)" aria-label="Référence" disabled={!peutEcrire}
                  className="field" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
                  <FolderTree size={13} /> Où le ranger dans le Drive
                </label>
                <input value={e.chemin} aria-label="Dossier du Drive" disabled={!peutEcrire} placeholder="Dossier / Sous-dossier / Année"
                  onChange={ev => modifier(d, { chemin: ev.target.value, cheminManuel: true })}
                  className={`field ${texteEnChemin(e.chemin).length === 0 ? '!border-[var(--warning)]' : ''}`} />
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {texteEnChemin(e.chemin).map((seg, i) => {
                    const p = d.proposition
                    const inchange = !!p?.chemin && e.chemin === cheminEnTexte(p.chemin)
                    const nouveau = inchange ? !!p?.chemin_nouveaux?.[i] : null
                    return (
                      <span key={`${seg}-${i}`} className="inline-flex items-center gap-1">
                        {i > 0 && <span className="text-[var(--text-disabled)]">/</span>}
                        <Badge color={nouveau === true ? 'warning' : nouveau === false ? 'success' : 'muted'}>{seg}{nouveau === true ? ' · nouveau' : ''}</Badge>
                      </span>
                    )
                  })}
                  {d.proposition?.chemin && d.proposition.chemin_confiance != null && d.proposition.chemin_confiance < SEUIL_DOUTE && (
                    <span className="text-[var(--warning)]">emplacement incertain, vérifie</span>
                  )}
                </div>
                {peutEcrire && (d.proposition?.alternatives ?? []).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <span>Sinon :</span>
                    {(d.proposition?.alternatives ?? []).map(a => (
                      <button key={a.chemin.join('/')} type="button" onClick={() => modifier(d, { chemin: cheminEnTexte(a.chemin), cheminManuel: true })}
                        className="rounded-full border border-[var(--border)] px-2.5 py-1 hover:bg-[var(--bg-card-hover)] hover:text-[var(--text)] transition-colors">
                        {cheminEnTexte(a.chemin)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {peutEcrire && (
                <div className="flex items-center gap-2">
                  <Button variant="primary" className="min-h-10" disabled={!pret(d)} onClick={() => confirmer(d)}>
                    <Check size={15} /> Confirmer
                  </Button>
                  {driveOk && !pret(d) && <span className="text-xs text-[var(--warning)]">Choisis un type et un dossier pour confirmer.</span>}
                  <span className="ml-auto"><BoutonIcone icone={Undo2} libelle="Rejeter : remettre dans l'Inbox" onClick={() => void rejeter(d)} /></span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
