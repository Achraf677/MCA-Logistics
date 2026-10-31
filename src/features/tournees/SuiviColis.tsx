import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Camera, ChevronDown, Clock, Download, MessageSquare, PackageCheck, PackagePlus, Pause, TriangleAlert, Undo2, ListChecks,
} from 'lucide-react'
import { BarreRecherche } from '../../shared/ui/BarreRecherche'
import { Button } from '../../shared/ui/Button'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ListeDeroulante } from '../../shared/ui/ListeDeroulante'
import { Skeleton } from '../../shared/ui/Skeleton'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'
import { useToast } from '../../shared/ui/useToast'
import { toLocalISO } from '../../shared/lib/dates'
import { downloadCSV } from '../../shared/lib/download'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { LIBELLE_STATUT_ARRET, LIBELLE_TYPE_ARRET, type FamilleStatut, type TourneeColis } from '../../shared/lib/tourneesColis'
import { chargerSuiviColis, urlPhotoArret } from '../../shared/lib/tourneesColis.queries'
import { libelleDuree } from '../../shared/lib/tourneesColisRoute'
import { decalerJour } from './tournees.logic'
import {
  anomalies, construireSuivi, csvSuivi, ecartsPassage, filtrerSuivi, grouperSuivi, heureLocale, idsAnomalies, passagesParHeure,
  totauxSuivi, type FiltreSuivi, type LigneSuivi, type RegroupementSuivi,
} from './suivi.logic'

const champ = 'field !w-auto'
const COULEUR: Record<FamilleStatut | 'aucun', string> = {
  livre: 'var(--success)', attente: 'var(--warning)', retour: 'var(--danger)', neutre: 'var(--text-muted)', aucun: 'var(--border-strong)',
}

function Pastille({ l }: { l: LigneSuivi }) {
  const c = COULEUR[l.famille ?? 'aucun']
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold"
      style={{ color: c, borderColor: `color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      {l.statut ? LIBELLE_STATUT_ARRET[l.statut] : 'Non traité'}
    </span>
  )
}

function Ligne({ l, ecart, anomalie, plusieursSalaries, afficherVillage, onPhoto }: {
  l: LigneSuivi; ecart: number | undefined; anomalie: boolean; plusieursSalaries: boolean; afficherVillage: boolean; onPhoto: (id: string) => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-[var(--border)] text-sm">
      <span className="w-12 shrink-0 font-mono tabular-nums text-[var(--text)]">{heureLocale(l.le)}</span>
      <span className="flex-1 min-w-[10rem]">
        <span className="block font-medium text-[var(--text)] break-words">{l.adresse}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--text-muted)]">
          {afficherVillage && <span>{l.village}</span>}
          {l.type !== 'c' && <span className="inline-flex items-center gap-1">{l.type === 'col' ? <PackagePlus size={12} /> : null}{LIBELLE_TYPE_ARRET[l.type]}</span>}
          {plusieursSalaries && <span>{l.salarie}</span>}
          {l.note && <span className="inline-flex items-center gap-1"><MessageSquare size={11} /> {l.note}</span>}
        </span>
      </span>
      <Pastille l={l} />
      <span className="w-16 shrink-0 text-right tabular-nums text-[var(--text)]">
        {l.type === 'col' ? '—' : l.statut ? `${l.remis} / ${l.quantite}` : l.quantite}
        <span className="text-xs text-[var(--text-muted)]"> colis</span>
      </span>
      <span className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]" title="Depuis le passage précédent">
        {ecart != null ? `+${libelleDuree(ecart)}` : ''}
      </span>
      <span className="w-12 shrink-0 inline-flex items-center justify-end gap-1.5">
        {anomalie && <TriangleAlert size={14} className="text-[var(--warning)]" aria-label="À contrôler" />}
        {l.photos > 0 && (
          <button type="button" onClick={() => onPhoto(l.id)} aria-label={`Voir la photo (${l.photos})`}
            className="inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            <Camera size={14} /> {l.photos}
          </button>
        )}
      </span>
    </li>
  )
}

/**
 * Suivi détaillé des colis (bureau) : par village, par tournée ou par jour, avec l'heure de passage de chaque arrêt,
 * les totaux, les écarts entre passages et les points à contrôler. Lecture seule.
 */
export function SuiviColis({ dateInitiale }: { dateInitiale: string }) {
  const { toast } = useToast()
  const [du, setDu] = useState(dateInitiale)
  const [au, setAu] = useState(dateInitiale)
  const [charge, setCharge] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [tournees, setTournees] = useState<TourneeColis[]>([])
  const [lignes, setLignes] = useState<LigneSuivi[]>([])
  const [synthese, setSynthese] = useState<Set<string>>(new Set())
  const [docs, setDocs] = useState<Map<string, DocumentRow[]>>(new Map())

  const [par, setPar] = useState<RegroupementSuivi>('village')
  const [statut, setStatut] = useState<FiltreSuivi>('tous')
  const [membreId, setMembreId] = useState('')
  const [villageCle, setVillageCle] = useState('')
  const [q, setQ] = useState('')
  const [ouvert, setOuvert] = useState<string | null>(null)

  const charger = useCallback(async () => {
    setCharge(false)
    const r = await chargerSuiviColis(du, au)
    setErreur(r.error?.message ?? null)
    setTournees(r.tournees)
    setLignes(construireSuivi(r.tournees, r.arrets, new Map([...r.photos].map(([id, d]) => [id, d.length]))))
    setSynthese(r.syntheses)
    setDocs(r.photos)
    setCharge(true)
  }, [du, au])
  useEffect(() => { void charger() }, [charger])

  const controles = useMemo(() => anomalies(lignes, tournees, synthese), [lignes, tournees, synthese])
  const enAnomalie = useMemo(() => idsAnomalies(controles), [controles])
  const salaries = useMemo(() => [...new Map(lignes.map(l => [l.membreId, l.salarie])).entries()], [lignes])
  const villages = useMemo(() => [...new Map(lignes.map(l => [l.villageCle, l.village])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr')), [lignes])
  const visibles = useMemo(
    () => filtrerSuivi(lignes, { membreId, villageCle, statut, q }, enAnomalie),
    [lignes, membreId, villageCle, statut, q, enAnomalie])
  const ecarts = useMemo(() => ecartsPassage(visibles), [visibles])
  const groupes = useMemo(() => grouperSuivi(visibles, par), [visibles, par])
  const tot = useMemo(() => totauxSuivi(lignes), [lignes])
  const heures = useMemo(() => passagesParHeure(visibles), [visibles])
  const maxHeure = Math.max(1, ...heures.map(h => h.livre + h.attente + h.retour + h.neutre))
  const nbAnomalies = enAnomalie.size + controles.filter(c => c.code === 'sans_synthese').reduce((s, c) => s + c.tourneeIds.length, 0)
  const nomTournee = (id: string) => {
    const t = tournees.find(x => x.id === id)
    return t ? `${t.team_members?.full_name ?? 'Salarié'} · ${t.date.split('-').reverse().slice(0, 2).join('/')}` : id
  }

  const periode = (a: string, b: string) => { setDu(a); setAu(b) }
  const aujourdhui = toLocalISO(new Date())
  const tuile = (f: FiltreSuivi) => ({ actif: statut === f, onClick: () => setStatut(cur => (cur === f ? 'tous' : f)) })

  const voirPhoto = async (arretId: string) => {
    const d = docs.get(arretId)?.[0]
    const u = d ? await urlPhotoArret(d) : null
    if (u) ouvrirDocument(u, { titre: 'Photo de preuve', type: 'image' }); else toast('Photo introuvable', 'error')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={du} max={au} aria-label="Du" onChange={e => e.target.value && setDu(e.target.value)} className={champ} />
        <span className="text-[var(--text-muted)]">→</span>
        <input type="date" value={au} min={du} aria-label="Au" onChange={e => e.target.value && setAu(e.target.value)} className={champ} />
        <Button size="compact" variant="secondary" onClick={() => periode(aujourdhui, aujourdhui)}>Aujourd'hui</Button>
        <Button size="compact" variant="secondary" onClick={() => periode(decalerJour(aujourdhui, -6), aujourdhui)}>7 jours</Button>
        <Button size="compact" variant="secondary" onClick={() => periode(`${aujourdhui.slice(0, 8)}01`, aujourdhui)}>Ce mois</Button>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {salaries.length > 1 && (
            <div className="w-56">
              <ListeDeroulante valeur={membreId} onChange={setMembreId} ariaLabel="Salarié" placeholder="Tous les salariés"
                options={[{ valeur: '', libelle: 'Tous les salariés' }, ...salaries.map(([id, nom]) => ({ valeur: id, libelle: nom }))]} />
            </div>
          )}
          {villages.length > 1 && (
            <div className="w-48">
              <ListeDeroulante valeur={villageCle} onChange={setVillageCle} ariaLabel="Village" placeholder="Tous les villages"
                options={[{ valeur: '', libelle: 'Tous les villages' }, ...villages.map(([c, l]) => ({ valeur: c, libelle: l }))]} />
            </div>
          )}
          <Button size="compact" variant="secondary" disabled={visibles.length === 0}
            onClick={() => downloadCSV(csvSuivi(visibles, ecarts), `suivi-colis-${du}-${au}.csv`)}>
            <Download size={14} /> Export CSV
          </Button>
        </div>
      </div>

      {erreur && (
        <div role="alert" className="flex items-center gap-3 rounded-[var(--r-md)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          <TriangleAlert size={15} className="shrink-0" />
          <span className="flex-1">{erreur}</span>
          <Button size="compact" variant="secondary" onClick={() => void charger()}>Réessayer</Button>
        </div>
      )}

      {!charge ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : lignes.length === 0 ? (
        <EmptyState icon={<PackageCheck size={28} />} title="Aucun colis sur cette période" description="Choisis d'autres dates." />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <ChiffreCarte libelle="Livrés" icone={<PackageCheck size={13} />} valeur={`${tot.colisLivres} / ${tot.colis}`}
              detail={tot.colis ? `${Math.round((tot.colisLivres / tot.colis) * 100)} % des colis` : '—'} titre="Colis livrés" {...tuile('livres')} />
            <ChiffreCarte libelle="Avisés" icone={<Pause size={13} />} valeur={String(tot.colisAttente)} ton={tot.colisAttente ? 'warning' : undefined}
              detail="avisés / en instance" titre="Colis en attente" {...tuile('avises')} />
            <ChiffreCarte libelle="Retours" icone={<Undo2 size={13} />} valeur={String(tot.colisRetour)} ton={tot.colisRetour ? 'danger' : undefined}
              detail="refusés, absents, relais fermé…" titre="Colis en retour" {...tuile('retours')} />
            <ChiffreCarte libelle="Collectes" icone={<PackagePlus size={13} />} valeur={`${tot.collectesTraitees} / ${tot.collectes}`}
              detail="faites sur prévues" titre="Collectes" {...tuile('collectes')} />
            <ChiffreCarte libelle="Non traités" icone={<ListChecks size={13} />}
              valeur={String(lignes.filter(l => !l.statut && l.type !== 'col').length)} detail="arrêts sans statut" titre="Arrêts non traités" {...tuile('non_traites')} />
            <ChiffreCarte libelle="À contrôler" icone={<TriangleAlert size={13} />} valeur={String(nbAnomalies)} ton={nbAnomalies ? 'warning' : undefined}
              detail={tot.premier != null ? `${heureLocale(tot.premier)} → ${heureLocale(tot.dernier)}` : 'aucun passage'} titre="Incohérences" {...tuile('anomalies')} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BarreRecherche value={q} onChange={setQ} placeholder="Chercher une adresse, un village, une note…" ariaLabel="Rechercher un arrêt"
              raccourci className="flex-1 min-w-[12rem] max-w-xl" />
            <div className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden" role="group" aria-label="Regrouper par">
              {([['village', 'Village'], ['tournee', 'Tournée'], ['jour', 'Jour']] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={par === v} onClick={() => { setPar(v); setOuvert(null) }}
                  className={`min-h-9 px-3 text-sm ${par === v ? 'bg-[var(--bg-elevated)] text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'}`}>{l}</button>
              ))}
            </div>
            <span className="text-sm text-[var(--text-muted)] tabular-nums">{visibles.length} arrêt{visibles.length > 1 ? 's' : ''}</span>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_19rem] items-start">
            <div className="flex flex-col gap-2 lg:max-h-[calc(100vh-22rem)] lg:overflow-y-auto lg:pr-1">
              {groupes.length === 0 && <p className="p-4 text-sm text-[var(--text-muted)]">Rien ne correspond aux filtres.</p>}
              {groupes.map(g => {
                const pct = g.colis ? Math.round((g.colisLivres / g.colis) * 100) : 0
                const ouverte = ouvert === g.cle
                return (
                  <section key={g.cle} className="shrink-0 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                    <button type="button" aria-expanded={ouverte} onClick={() => setOuvert(ouverte ? null : g.cle)}
                      className="w-full text-left px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <ChevronDown size={16} className={`shrink-0 text-[var(--text-muted)] transition-transform ${ouverte ? '' : '-rotate-90'}`} />
                      <span className="flex-1 min-w-[8rem] font-semibold text-[var(--text)] first-letter:uppercase">{g.libelle}</span>
                      <span className="text-xs text-[var(--text-muted)] tabular-nums">{g.arrets} arrêt{g.arrets > 1 ? 's' : ''} · {g.colis} colis{g.collectes ? ` · ${g.collectes} collecte${g.collectes > 1 ? 's' : ''}` : ''}</span>
                      <span className="flex items-center gap-2 w-40">
                        <span className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                          <span className="block h-full bg-[var(--success)]" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-[var(--text)] w-9 text-right">{pct} %</span>
                      </span>
                      <span className="text-xs tabular-nums text-[var(--text-muted)] inline-flex items-center gap-1">
                        <Clock size={12} />
                        {g.premier != null ? `${heureLocale(g.premier)} → ${heureLocale(g.dernier)}${g.dureeMin ? ` (${libelleDuree(g.dureeMin)})` : ''}` : 'pas de passage'}
                      </span>
                      {(g.colisAttente > 0 || g.colisRetour > 0) && (
                        <span className="text-xs tabular-nums">
                          {g.colisAttente > 0 && <span className="text-[var(--warning)]">{g.colisAttente} avisé{g.colisAttente > 1 ? 's' : ''} </span>}
                          {g.colisRetour > 0 && <span className="text-[var(--danger)]">{g.colisRetour} retour{g.colisRetour > 1 ? 's' : ''}</span>}
                        </span>
                      )}
                    </button>
                    {ouverte && (
                      <ul>
                        {[...g.lignes].sort((a, b) => (a.le ?? Infinity) - (b.le ?? Infinity) || a.rang - b.rang).map(l => (
                          <Ligne key={l.id} l={l} ecart={ecarts.get(l.id)} anomalie={enAnomalie.has(l.id)}
                            plusieursSalaries={salaries.length > 1 && par !== 'tournee'} afficherVillage={par !== 'village'} onPhoto={id => void voirPhoto(id)} />
                        ))}
                      </ul>
                    )}
                  </section>
                )
              })}
            </div>

            <aside className="flex flex-col gap-3">
              <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-2">À contrôler</h3>
                {controles.length === 0 ? (
                  <p className="text-sm text-[var(--success)]">Rien à signaler.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {controles.map(c => (
                      <li key={c.code} className="text-sm">
                        <button type="button" onClick={() => c.arretIds.length && setStatut('anomalies')}
                          className="w-full flex items-start gap-2 text-left text-[var(--text)]">
                          <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[var(--warning)]" />
                          <span className="flex-1">{c.libelle}</span>
                          <span className="font-semibold tabular-nums">{c.arretIds.length || c.tourneeIds.length}</span>
                        </button>
                        {c.tourneeIds.length > 0 && (
                          <p className="pl-6 text-xs text-[var(--text-muted)]">{c.tourneeIds.map(nomTournee).join(' · ')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Passages par heure</h3>
                {heures.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Aucun passage.</p> : (
                  <ul className="flex flex-col gap-1">
                    {heures.map(h => {
                      const total = h.livre + h.attente + h.retour + h.neutre
                      return (
                        <li key={h.heure} className="flex items-center gap-2 text-xs tabular-nums">
                          <span className="w-9 text-[var(--text-muted)]">{String(h.heure).padStart(2, '0')} h</span>
                          <span className="flex-1 h-3 rounded-sm bg-[var(--bg)] overflow-hidden flex" style={{ maxWidth: '100%' }}>
                            <span className="h-full" style={{ width: `${(h.livre / maxHeure) * 100}%`, background: COULEUR.livre }} />
                            <span className="h-full" style={{ width: `${(h.attente / maxHeure) * 100}%`, background: COULEUR.attente }} />
                            <span className="h-full" style={{ width: `${(h.retour / maxHeure) * 100}%`, background: COULEUR.retour }} />
                            <span className="h-full" style={{ width: `${(h.neutre / maxHeure) * 100}%`, background: COULEUR.neutre }} />
                          </span>
                          <span className="w-6 text-right text-[var(--text)]">{total}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
