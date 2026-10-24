import { useMemo, useState } from 'react'
import { ArrowRight, Check, CheckCheck, Sparkles, Undo2 } from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { getDownloadUrl } from '../../shared/lib/documents.queries'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { TYPES_DOCUMENT, nomPropose } from '../../shared/lib/documentsTri'
import { montantSaisiEnCts } from '../../shared/lib/depenses'
import { confirmerClassement, remettreDansInbox } from './documents.queries'
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
}

const SEUIL_DOUTE = 0.7

const montantTexte = (cts: number | null | undefined) => (cts != null ? (cts / 100).toFixed(2).replace('.', ',') : '')

function editionInitiale(d: DocumentRow): Edition {
  const p = d.proposition
  return {
    type: p?.type ?? '', date: p?.date ?? '', tiers: p?.tiers ?? '', montant: montantTexte(p?.montant_ttc_cts), reference: p?.reference ?? '',
    nom: p?.nom ?? d.file_name, nomManuel: false,
  }
}

/** À confirmer : l'IA a proposé un nom rangé et des champs ; tu corriges si besoin, tu confirmes (ou tu rejettes). */
export function ConfirmationTri({ docs, classes, miniatures, peutEcrire, driveOk, onChange, toast }: {
  docs: DocumentRow[]
  classes: DocumentRow[]
  miniatures: Record<string, string>
  peutEcrire: boolean
  /** Compte Google connecté avec le scope Drive : sans lui, rien ne peut être rangé. */
  driveOk: boolean
  onChange: () => Promise<void>
  toast: (message: string, type?: 'success' | 'error') => void
}) {
  const [editions, setEditions] = useState<Record<string, Edition>>({})
  const [occupe, setOccupe] = useState<string | 'tous' | null>(null)

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
    setEditions(p => ({ ...p, [d.id]: e }))
  }

  const classement = (d: DocumentRow) => {
    const e = edition(d)
    const m = montantSaisiEnCts(e.montant)
    return {
      nom: e.nom.trim(), type: e.type || null, date: e.date || null, tiers: e.tiers.trim() || null, reference: e.reference.trim() || null,
      montant_ttc_cts: m != null && !Number.isNaN(m) ? m : null, resume: d.proposition?.resume ?? null,
    }
  }
  const pret = (d: DocumentRow) => { const e = edition(d); return driveOk && e.nom.trim() !== '' && e.type !== '' }

  const confirmer = async (d: DocumentRow) => {
    setOccupe(d.id)
    const { error } = await confirmerClassement(d.id, classement(d))
    setOccupe(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Document rangé dans le Drive')
    await onChange()
  }

  const rejeter = async (d: DocumentRow) => {
    setOccupe(d.id)
    const { error } = await remettreDansInbox(d.id)
    setOccupe(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Remis dans l\'Inbox')
    await onChange()
  }

  const toutConfirmer = async () => {
    const aFaire = docs.filter(pret)
    setOccupe('tous')
    let ok = 0
    let premierEchec: string | null = null
    for (const d of aFaire) { const { error } = await confirmerClassement(d.id, classement(d)); if (!error) ok++; else premierEchec ??= error.message }
    setOccupe(null)
    if (premierEchec) toast(premierEchec, 'error')
    toast(`${ok} document${ok > 1 ? 's' : ''} rangé${ok > 1 ? 's' : ''}${aFaire.length < docs.length ? ` · ${docs.length - aFaire.length} à compléter (type ou nom manquant)` : ''}`)
    await onChange()
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
          <Button variant="primary" className="min-h-10" disabled={prets === 0 || occupe !== null} onClick={() => void toutConfirmer()}>
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
                    <Badge color={d.proposition?.lu_via === 'texte' ? 'info' : 'success'}>{d.proposition?.lu_via === 'texte' ? 'Lu dans le texte' : 'Lu sur l\'image'}</Badge>
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

              {peutEcrire && (
                <div className="flex items-center gap-2">
                  <Button variant="primary" className="min-h-10" disabled={!pret(d) || occupe !== null} onClick={() => void confirmer(d)}>
                    <Check size={15} /> Confirmer
                  </Button>
                  {driveOk && !pret(d) && <span className="text-xs text-[var(--warning)]">Choisis un type pour confirmer.</span>}
                  <span className="ml-auto"><BoutonIcone icone={Undo2} libelle="Rejeter : remettre dans l'Inbox" onClick={() => void rejeter(d)} disabled={occupe !== null} /></span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
