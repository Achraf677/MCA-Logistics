import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCheck, ClipboardCheck, RefreshCw } from 'lucide-react'
import { Button } from '../../shared/ui/Button'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import { usePermissions } from '../../shared/permissions/usePermissions'
import {
  journeesAValider, photosJournees, validerJournee, refuserJournee,
} from '../../shared/lib/journeesColis.queries'
import type { JourneeColis } from '../../shared/lib/journeesColis'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { CarteValidation, type Saisie } from './CarteValidation'
import { dateFr } from './equipe.logic'
import {
  declares, ecarts, nombresSaisis, versSaisie, filtrerJournees, optionsDistinctes, LIBELLE_CHAMP,
  type NombresColis,
} from './journees.logic'

/**
 * Équipe › À valider : journées de colis envoyées par les salariés, plus anciennes d'abord.
 * Valider (avec confirmation si le validé diffère du déclaré), refuser (motif renvoyé au
 * salarié), ou valider d'un coup les journées sélectionnées sans écart.
 */
export function ValidationJournees({ onChange }: { onChange?: () => void }) {
  const { toast } = useToast()
  const { can } = usePermissions()
  const peutAgir = can('equipe.journees', 'update')
  const [journees, setJournees] = useState<JourneeColis[]>([])
  const [photos, setPhotos] = useState<Record<string, DocumentRow[]>>({})
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({})
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [filtreMembre, setFiltreMembre] = useState('')
  const [filtreClient, setFiltreClient] = useState('')
  const [aConfirmer, setAConfirmer] = useState<{ j: JourneeColis; valides: NombresColis } | null>(null)
  const [lotOuvert, setLotOuvert] = useState(false)
  const [maintenant, setMaintenant] = useState(() => new Date())

  const charger = useCallback(async () => {
    setChargement(true)
    const { data, error } = await journeesAValider()
    setErreur(error ? error.message : null)
    setJournees(data)
    setSaisies(prev => {
      const s: Record<string, Saisie> = {}
      for (const j of data) s[j.id] = prev[j.id] ?? versSaisie(declares(j))
      return s
    })
    setSelection(prev => new Set([...prev].filter(id => data.some(j => j.id === id))))
    const ph = await photosJournees(data.map(j => j.id))
    const parJournee: Record<string, DocumentRow[]> = {}
    for (const d of ph.data) if (d.entity_id) (parJournee[d.entity_id] ??= []).push(d)
    setPhotos(parJournee)
    setMaintenant(new Date())
    setChargement(false)
  }, [])

  useEffect(() => { void charger() }, [charger])

  const visibles = useMemo(
    () => filtrerJournees(journees, { memberId: filtreMembre, clientId: filtreClient }),
    [journees, filtreMembre, filtreClient])
  const membres = useMemo(() => optionsDistinctes(journees, 'member'), [journees])
  const clients = useMemo(() => optionsDistinctes(journees, 'client'), [journees])

  /** Sans écart = nombres saisis valides et égaux au déclaré. */
  const conforme = useCallback((j: JourneeColis) => {
    const v = saisies[j.id] ? nombresSaisis(saisies[j.id]) : null
    return v != null && ecarts(declares(j), v).length === 0
  }, [saisies])

  const selectionConforme = visibles.filter(j => selection.has(j.id) && conforme(j))
  const selectionAvecEcart = visibles.filter(j => selection.has(j.id) && !conforme(j)).length
  const conformesVisibles = visibles.filter(conforme)

  const apres = async (msg: string) => {
    toast(msg)
    await charger()
    onChange?.()
  }

  const valider = async (j: JourneeColis, valides: NombresColis) => {
    setOccupe(j.id)
    const { error } = await validerJournee(j.id, valides)
    setOccupe(null)
    setAConfirmer(null)
    if (error) { toast(error.message, 'error'); return }
    await apres(`Journée de ${j.team_members?.full_name ?? 'ce salarié'} du ${dateFr(j.date)} validée`)
  }

  const demanderValidation = (j: JourneeColis, valides: NombresColis) => {
    if (ecarts(declares(j), valides).length > 0) setAConfirmer({ j, valides })
    else void valider(j, valides)
  }

  const refuser = async (j: JourneeColis, motif: string) => {
    setOccupe(j.id)
    const { error } = await refuserJournee(j.id, motif)
    setOccupe(null)
    if (error) { toast(error.message, 'error'); return }
    await apres('Journée renvoyée au salarié pour correction')
  }

  const validerLot = async () => {
    setOccupe('lot')
    let ok = 0
    const echecs: string[] = []
    for (const j of selectionConforme) {
      const { error } = await validerJournee(j.id, declares(j))
      if (error) echecs.push(`${j.team_members?.full_name ?? '?'} ${dateFr(j.date)} : ${error.message}`)
      else ok += 1
    }
    setOccupe(null)
    setLotOuvert(false)
    setSelection(new Set())
    if (echecs.length) {
      toast(`${ok} validée(s), ${echecs.length} en échec — ${echecs[0]}`, 'error')
      await charger()
      onChange?.()
      return
    }
    await apres(`${ok} journée${ok > 1 ? 's' : ''} validée${ok > 1 ? 's' : ''}`)
  }

  const basculer = (id: string, v: boolean) =>
    setSelection(prev => { const n = new Set(prev); if (v) n.add(id); else n.delete(id); return n })

  if (chargement && journees.length === 0) {
    return <p className="py-16 text-center text-sm text-[var(--text-muted)]">Chargement des journées à valider…</p>
  }
  if (erreur) {
    return (
      <div className="py-12 flex flex-col items-center gap-3">
        <p className="text-sm text-[var(--danger)]">Journées non chargées : {erreur}</p>
        <Button variant="secondary" onClick={() => void charger()}><RefreshCw size={14} /> Réessayer</Button>
      </div>
    )
  }
  if (journees.length === 0) {
    return <EmptyState icon={<ClipboardCheck size={28} />} title="Rien à valider"
      description="Les journées envoyées par les salariés apparaîtront ici." />
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field !w-auto" value={filtreMembre} onChange={e => setFiltreMembre(e.target.value)}>
          <option value="">Tous les salariés</option>
          {membres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
        </select>
        <select className="field !w-auto" value={filtreClient} onChange={e => setFiltreClient(e.target.value)}>
          <option value="">Tous les clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <span className="text-sm text-[var(--text-muted)]">{visibles.length} journée{visibles.length > 1 ? 's' : ''} à valider</span>
        {peutAgir && (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Button variant="secondary" size="compact" disabled={conformesVisibles.length === 0 || !!occupe}
              onClick={() => setSelection(new Set(conformesVisibles.map(j => j.id)))}>
              Sélectionner les conformes ({conformesVisibles.length})
            </Button>
            <Button variant="primary" size="compact" disabled={selectionConforme.length === 0 || !!occupe}
              onClick={() => setLotOuvert(true)}>
              <CheckCheck size={14} /> Valider tout ce qui est conforme ({selectionConforme.length})
            </Button>
            <Button variant="ghost" size="compact" onClick={() => void charger()} disabled={!!occupe} title="Actualiser">
              <RefreshCw size={14} />
            </Button>
          </div>
        )}
      </div>
      {selectionAvecEcart > 0 && (
        <p className="text-xs text-[var(--warning)]">
          {selectionAvecEcart} journée{selectionAvecEcart > 1 ? 's' : ''} sélectionnée{selectionAvecEcart > 1 ? 's' : ''} avec écart :
          à valider une par une.
        </p>
      )}
      {!peutAgir && (
        <p className="text-xs text-[var(--text-muted)]">Consultation seule : ton compte n’a pas le droit de valider.</p>
      )}

      {visibles.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--text-muted)]">Aucune journée pour ce filtre.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visibles.map(j => (
            <CarteValidation key={j.id} j={j} photos={photos[j.id] ?? []}
              saisie={saisies[j.id] ?? versSaisie(declares(j))}
              onSaisie={s => setSaisies(p => ({ ...p, [j.id]: s }))}
              selection={selection.has(j.id)} onSelection={v => basculer(j.id, v)}
              peutAgir={peutAgir} occupe={occupe === j.id || occupe === 'lot'} maintenant={maintenant}
              onValider={v => demanderValidation(j, v)} onRefuser={m => void refuser(j, m)} />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!aConfirmer}
        title="Valider avec un écart ?"
        message={aConfirmer
          ? `${aConfirmer.j.team_members?.full_name ?? 'Salarié'} — ${dateFr(aConfirmer.j.date)} — ${aConfirmer.j.clients?.name ?? ''}. `
            + 'Le validé diffère du déclaré : '
            + ecarts(declares(aConfirmer.j), aConfirmer.valides)
              .map(d => `${LIBELLE_CHAMP[d.champ]} : déclaré ${d.avant} → validé ${d.apres}`).join(' ; ')
            + '. Les deux nombres sont gardés (historique).'
          : ''}
        confirmLabel="Valider avec ces nombres"
        loading={!!occupe}
        onConfirm={() => { if (aConfirmer) void valider(aConfirmer.j, aConfirmer.valides) }}
        onCancel={() => setAConfirmer(null)}
      />
      <ConfirmDialog
        open={lotOuvert}
        title="Valider les journées conformes ?"
        message={`${selectionConforme.length} journée${selectionConforme.length > 1 ? 's' : ''} sans écart vont être validées telles que déclarées. `
          + 'Une fois validées, le salarié ne peut plus les modifier.'}
        confirmLabel="Tout valider"
        loading={occupe === 'lot'}
        onConfirm={() => void validerLot()}
        onCancel={() => setLotOuvert(false)}
      />
    </div>
  )
}
