import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Lock, Send, Save, Trash2, History, Camera, Trash, Check, RotateCcw,
  PackageCheck, Home, Store, AlertTriangle, CalendarDays,
} from 'lucide-react'
import { Badge } from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { EmptyState } from '../../shared/ui/EmptyState'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { useProfile } from '../../app/providers'
import { toLocalISO } from '../../shared/lib/dates'
import { formatMoney } from '../../shared/lib/money'
import type { DocumentRow } from '../../shared/lib/documents.types'
import {
  LIBELLE_STATUT_JOURNEE, COULEUR_STATUT_JOURNEE, LIBELLE_ACTION_HISTORIQUE, manquesPourEnvoyer,
  salariePeutModifier, colisRetenus, totauxJournees, bornesMois,
  type JourneeColis, type HistoriqueJournee,
} from '../../shared/lib/journeesColis'
import {
  listerJournees, enregistrerJournee, supprimerJournee, historiqueJournee, photosJournee,
  ajouterPhotoJournee, urlPhoto, retirerPhoto,
} from '../../shared/lib/journeesColis.queries'
import { getNomsClients } from './mescourses.queries'
import type { EtatFiche, MaFiche } from './mescourses.types'
import {
  decalerJour, borneAujourdhui, decalerMois, libelleMois, formulaireDepuis, lireFormulaire, pas,
  formulaireModifie, lignesCorrection, joursDuMois, colisEnAttente, estimationPaie,
  type FormulaireJournee,
} from './espace.logic'
import { libelleDateCourte } from './mescourses.logic'
import { Carte, TitreCarte, MessageErreur, Compteur, GardeFiche, remonterEnHaut, champCls, boutonPrimaireCls, boutonSecondaireCls } from './EspaceCommun'
import { VisionneusePhoto, ChoixPhoto } from './VisionneusePhoto'
import { useReprisePhoto } from './useReprisePhoto'

const aujourdhui = () => toLocalISO(new Date())

/**
 * Ma journée (messagerie) : pour chaque client du jour fixé par le bureau, le
 * salarié déclare ses colis (domicile, relais, litige), photographie le compteur
 * de son appareil, et envoie au bureau. Validée = verrouillée (garanti par la base).
 * En dessous : son mois (statuts, totaux, estimation de paie au colis).
 */
export function MaJournee({ fiche }: { fiche: EtatFiche }) {
  return <GardeFiche fiche={fiche}>{f => <MaJourneeFiche fiche={f} />}</GardeFiche>
}

function MaJourneeFiche({ fiche }: { fiche: MaFiche }) {
  const [date, setDate] = useState(aujourdhui)
  const [journees, setJournees] = useState<JourneeColis[]>([])
  const [noms, setNoms] = useState<Map<string, string>>(new Map())
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)
  // Incrémenté à chaque écriture : le mois se recharge avec la journée.
  const [version, setVersion] = useState(0)

  const recharger = useCallback(async () => {
    setErreur(null)
    const { data, error } = await listerJournees({ du: date, au: date, memberId: fiche.id })
    if (error) { setErreur(error.message); setJournees([]) } else setJournees(data)
    setChargement(false)
    setVersion(v => v + 1)
  }, [date, fiche.id])

  useEffect(() => { setChargement(true); recharger() }, [recharger])

  // Clients du jour = ceux attribués par le bureau, plus ceux d'une journée déjà
  // déclarée ce jour-là (un client retiré depuis reste visible pour sa journée).
  const clientIds = useMemo(() => {
    const ids = [...fiche.clients_messagerie]
    for (const j of journees) if (!ids.includes(j.client_id)) ids.push(j.client_id)
    return ids
  }, [fiche.clients_messagerie, journees])

  useEffect(() => {
    let annule = false
    getNomsClients(clientIds).then(m => { if (!annule) setNoms(m) })
    return () => { annule = true }
  }, [clientIds])

  const auj = aujourdhui()
  const estAujourdhui = date === auj

  if (!fiche.complete) {
    return (
      <EmptyState icon={<PackageCheck size={28} />} title="Pas encore ouvert"
        description="La déclaration des colis n'est pas encore ouverte sur le site. Préviens le bureau." />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Date : aujourd'hui par défaut, jamais dans le futur. */}
      <div className="flex items-center gap-2">
        <BoutonIcone icone={ChevronLeft} libelle="Jour précédent" onClick={() => setDate(d => decalerJour(d, -1))} />
        <div className="flex-1 min-w-0 text-center">
          <span className="block text-base font-semibold text-[var(--text)] first-letter:uppercase">
            {estAujourdhui ? "Aujourd'hui" : libelleDateCourte(date)}
          </span>
          {!estAujourdhui && (
            <button onClick={() => setDate(auj)} className="text-xs text-[var(--brand)] underline min-h-7">
              Revenir à aujourd'hui
            </button>
          )}
        </div>
        <BoutonIcone icone={ChevronRight} libelle="Jour suivant" disabled={date >= auj}
          onClick={() => setDate(d => borneAujourdhui(decalerJour(d, 1), auj))} />
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {chargement ? (
        <Skeleton className="h-64" />
      ) : clientIds.length === 0 ? (
        <EmptyState icon={<PackageCheck size={28} />} title="Aucun client attribué"
          description="Le bureau ne t'a encore attribué aucun client de messagerie." />
      ) : (
        clientIds.map(cid => (
          <CarteJournee
            key={`${date}-${cid}`}
            date={date}
            clientId={cid}
            nomClient={noms.get(cid) ?? journees.find(j => j.client_id === cid)?.clients?.name ?? 'Client'}
            journee={journees.find(j => j.client_id === cid) ?? null}
            fiche={fiche}
            onChange={recharger}
          />
        ))
      )}

      <MonMois fiche={fiche} version={version} noms={noms} onChoisirJour={d => { setDate(d); remonterEnHaut() }} />
    </div>
  )
}

// ── Une journée × un client ─────────────────────────────────────────────────

function CarteJournee({ date, clientId, nomClient, journee, fiche, onChange }: {
  date: string
  clientId: string
  nomClient: string
  journee: JourneeColis | null
  fiche: MaFiche
  onChange: () => Promise<void>
}) {
  const { toast } = useToast()
  const { companyId } = useProfile()
  const [form, setForm] = useState<FormulaireJournee>(() => formulaireDepuis(journee))
  const [busy, setBusy] = useState(false)
  const [photos, setPhotos] = useState<DocumentRow[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [erreurPhotos, setErreurPhotos] = useState<string | null>(null)
  // Photo prise, pas encore gardée : on la montre en grand AVANT de l'envoyer.
  const [apercu, setApercu] = useState<{ file: File; url: string; remplace: DocumentRow | null } | null>(null)
  const [grande, setGrande] = useState<DocumentRow | null>(null)
  const [aRemplacer, setARemplacer] = useState<DocumentRow | null>(null)
  const [confirmerSuppression, setConfirmerSuppression] = useState(false)
  const [historique, setHistorique] = useState<HistoriqueJournee[] | null>(null)

  const modifiable = salariePeutModifier(journee)
  const statut = journee?.statut ?? null

  // La journée relue depuis la base (après une écriture) remet le formulaire à jour.
  const cleJournee = journee ? `${journee.id}:${journee.updated_at}` : 'nouvelle'
  useEffect(() => { setForm(formulaireDepuis(journee)) }, [cleJournee]) // eslint-disable-line react-hooks/exhaustive-deps

  const chargerPhotos = useCallback(async () => {
    if (!journee) { setPhotos([]); return }
    const { data, error } = await photosJournee(journee.id)
    if (error) { setErreurPhotos(error.message); return }
    setErreurPhotos(null)
    setPhotos(data)
    const signees = await Promise.all(data.map(async d => [d.id, await urlPhoto(d)] as const))
    setUrls(new Map(signees.filter((x): x is readonly [string, string] => !!x[1])))
  }, [journee?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { chargerPhotos() }, [chargerPhotos])

  // Libère l'aperçu local quand il disparaît.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu.url) }, [apercu])

  const { saisie, invalides } = lireFormulaire(form)
  const manques = [...invalides, ...manquesPourEnvoyer(saisie, photos.length)]
  const modifie = formulaireModifie(form, journee)

  const champs = () => ({
    colis_domicile: saisie.colis_domicile,
    colis_relais: saisie.colis_relais,
    colis_litige: saisie.colis_litige,
    litige_raison: form.raison.trim() || null,
    note: form.note.trim() || null,
  })

  /** Écrit la journée ; renvoie son id (null si refus). */
  const ecrire = async (cible: 'brouillon' | 'envoyee'): Promise<string | null> => {
    if (!companyId) { toast('Session expirée : reconnecte-toi.', 'error'); return null }
    const { data, error } = await enregistrerJournee({
      id: journee?.id, companyId, memberId: fiche.id, date, clientId, champs: champs(), statut: cible,
    })
    if (error || !data) { toast(error?.message ?? 'Enregistrement impossible.', 'error'); return null }
    return data.id
  }

  const enregistrer = async (cible: 'brouillon' | 'envoyee') => {
    if (invalides.length > 0) { toast(invalides[0], 'error'); return }
    if (cible === 'envoyee' && manques.length > 0) return
    setBusy(true)
    const id = await ecrire(cible)
    setBusy(false)
    if (!id) return
    toast(cible === 'envoyee' ? (statut === 'envoyee' ? 'Mise à jour envoyée au bureau' : 'Journée envoyée au bureau') : 'Brouillon enregistré')
    await onChange()
  }

  // ── Photos ────────────────────────────────────────────────────────────────
  const voirAvantEnvoi = (file: File, remplace: DocumentRow | null = null) => {
    if (!file.type.startsWith('image/')) { toast('Choisis une photo (image).', 'error'); return }
    setApercu({ file, url: URL.createObjectURL(file), remplace })
  }
  const reprise = useReprisePhoto(f => { voirAvantEnvoi(f, aRemplacer); setARemplacer(null) })

  const garderPhoto = async () => {
    if (!apercu || !companyId) return
    setBusy(true)
    // La photo s'attache à une journée existante : brouillon enregistré à la première photo.
    let id = journee?.id ?? null
    if (!id) {
      id = await ecrire('brouillon')
      if (!id) { setBusy(false); return }
    }
    const { error } = await ajouterPhotoJournee(apercu.file, companyId, id)
    if (error) { setBusy(false); toast(`Photo non envoyée : ${error.message}`, 'error'); return }
    if (apercu.remplace) await retirerPhoto(apercu.remplace)
    setBusy(false)
    setApercu(null)
    toast(journee ? 'Photo ajoutée' : 'Photo ajoutée, brouillon enregistré')
    if (!journee) await onChange()
    else await chargerPhotos()
  }

  const retirer = async (doc: DocumentRow) => {
    setBusy(true)
    const { error } = await retirerPhoto(doc)
    setBusy(false)
    setGrande(null)
    if (error) { toast(error.message, 'error'); return }
    toast('Photo retirée')
    await chargerPhotos()
  }

  // ── Suppression, historique ───────────────────────────────────────────────
  const supprimer = async () => {
    if (!journee) return
    setBusy(true)
    // Les photos d'abord (la base ne les accepte que tant que la journée existe).
    for (const p of photos) await retirerPhoto(p)
    const { error } = await supprimerJournee(journee.id)
    setBusy(false)
    setConfirmerSuppression(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Journée supprimée')
    await onChange()
  }

  const basculerHistorique = async () => {
    if (historique) { setHistorique(null); return }
    if (!journee) return
    const { data, error } = await historiqueJournee(journee.id)
    if (error) { toast(error.message, 'error'); return }
    setHistorique(data)
  }

  const retenus = journee ? colisRetenus(journee) : null
  const corrections = journee ? lignesCorrection(journee) : []

  return (
    <Carte>
      <TitreCarte icone={<PackageCheck size={18} />}
        droite={statut
          ? <Badge color={COULEUR_STATUT_JOURNEE[statut]}>{statut === 'validee' && <Lock size={11} className="mr-1" />}{LIBELLE_STATUT_JOURNEE[statut]}</Badge>
          : <Badge color="muted">À déclarer</Badge>}>
        {nomClient}
      </TitreCarte>

      {/* Refusée : le motif du bureau, en rouge, au-dessus de tout. */}
      {journee?.motif_refus && (statut === 'refusee' || statut === 'brouillon') && (
        <MessageErreur>À corriger : {journee.motif_refus}</MessageErreur>
      )}
      {statut === 'envoyee' && (
        <p className="text-xs text-[var(--text-muted)]">Envoyée au bureau. Tu peux encore la corriger tant qu'elle n'est pas validée.</p>
      )}

      {statut === 'validee' && retenus ? (
        <div className="flex flex-col gap-2">
          <p className="inline-flex items-center gap-1.5 text-sm text-[var(--success)]">
            <Lock size={14} /> Validée par le bureau : plus rien n'est modifiable.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Chiffre icone={<Home size={14} />} libelle="Domicile" valeur={retenus.domicile} />
            <Chiffre icone={<Store size={14} />} libelle="Point relais" valeur={retenus.relais} />
            <Chiffre icone={<AlertTriangle size={14} />} libelle="Litige" valeur={retenus.litige} />
          </div>
          {corrections.length > 0 && (
            <div className="p-3 rounded-[var(--r-md)] bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-sm text-[var(--text)]">
              <span className="font-medium">Corrigé par le bureau</span>
              <ul className="mt-1 text-[var(--text-muted)]">{corrections.map(l => <li key={l}>{l}</li>)}</ul>
              {journee?.motif_modification && <p className="mt-1 text-xs text-[var(--text-muted)]">Motif : {journee.motif_modification}</p>}
            </div>
          )}
          {journee?.litige_raison && <p className="text-sm text-[var(--text-muted)]">Raison du litige : {journee.litige_raison}</p>}
          {journee?.note && <p className="text-sm text-[var(--text-muted)]">Note : {journee.note}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Compteur libelle="Livrés à domicile" valeur={form.domicile} disabled={busy}
            onChange={v => setForm(f => ({ ...f, domicile: v }))} onPas={d => setForm(f => ({ ...f, domicile: pas(f.domicile, d) }))} />
          <Compteur libelle="Livrés en point relais" valeur={form.relais} disabled={busy}
            onChange={v => setForm(f => ({ ...f, relais: v }))} onPas={d => setForm(f => ({ ...f, relais: pas(f.relais, d) }))} />
          <Compteur libelle="En litige" aide="(abîmé, refusé, perdu…)" valeur={form.litige} disabled={busy}
            onChange={v => setForm(f => ({ ...f, litige: v }))} onPas={d => setForm(f => ({ ...f, litige: pas(f.litige, d) }))} />
          {saisie.colis_litige > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text)]">Raison du litige <span className="text-[var(--danger)]">*</span></span>
              <input className={champCls} value={form.raison} disabled={busy} placeholder="Ex. 2 colis abîmés, 1 refusé"
                onChange={e => setForm(f => ({ ...f, raison: e.target.value }))} />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--text)]">Note pour le bureau <span className="text-xs font-normal text-[var(--text-muted)]">(facultatif)</span></span>
            <textarea className={`${champCls} min-h-20 py-2`} value={form.note} disabled={busy}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </label>
        </div>
      )}

      {/* PHOTOS DU COMPTEUR : vignettes, plein écran, reprendre / retirer. */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-[var(--text)]">
          Photo{photos.length > 1 ? 's' : ''} du compteur de l'appareil {modifiable && <span className="text-[var(--danger)]">*</span>}
        </span>
        {erreurPhotos && <MessageErreur>Photos illisibles : {erreurPhotos}</MessageErreur>}
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map(p => (
              <button key={p.id} onClick={() => setGrande(p)} aria-label="Voir la photo en grand"
                className="w-20 h-20 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                {urls.get(p.id)
                  ? <img src={urls.get(p.id)} alt="Compteur" className="w-full h-full object-cover" />
                  : <Camera size={20} className="m-auto text-[var(--text-disabled)]" />}
              </button>
            ))}
          </div>
        )}
        {modifiable && (
          <ChoixPhoto onFichier={f => voirAvantEnvoi(f)} disabled={busy}
            libellePrendre={photos.length ? 'Ajouter une photo' : 'Prendre la photo'} />
        )}
        {!modifiable && photos.length === 0 && <p className="text-xs text-[var(--text-muted)]">Aucune photo.</p>}
      </div>

      {modifiable && (
        <div className="flex flex-col gap-2 pt-1">
          {manques.length > 0 && (
            <div className="p-3 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] text-sm">
              <span className="font-medium text-[var(--text)]">Pour envoyer, il manque :</span>
              <ul className="mt-1 list-disc pl-5 text-[var(--text-muted)]">{manques.map(m => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          {modifie && journee && <p className="text-xs text-[var(--warning)]">Modifications non enregistrées.</p>}
          <div className="flex flex-col sm:flex-row gap-2">
            {statut !== 'envoyee' && (
              <button className={`${boutonSecondaireCls} sm:flex-1`} disabled={busy} onClick={() => enregistrer('brouillon')}>
                <Save size={18} /> Enregistrer le brouillon
              </button>
            )}
            <button className={`${boutonPrimaireCls} sm:flex-1`} disabled={busy || manques.length > 0} onClick={() => enregistrer('envoyee')}>
              <Send size={18} /> {statut === 'envoyee' ? 'Mettre à jour l’envoi' : statut === 'refusee' ? 'Renvoyer au bureau' : 'Envoyer au bureau'}
            </button>
          </div>
        </div>
      )}

      {journee && (
        <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
          <button onClick={basculerHistorique} className="min-h-11 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            <History size={16} /> {historique ? "Masquer l'historique" : 'Historique'}
          </button>
          <span className="flex-1" />
          {modifiable && (
            <button onClick={() => setConfirmerSuppression(true)} disabled={busy}
              className="min-h-11 inline-flex items-center gap-1.5 text-sm text-[var(--danger)]">
              <Trash2 size={16} /> Supprimer
            </button>
          )}
        </div>
      )}
      {historique && (
        historique.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Aucun événement enregistré.</p> : (
          <ol className="flex flex-col gap-1.5">
            {historique.map(h => (
              <li key={h.id} className="text-sm text-[var(--text)]">
                <span className="text-xs text-[var(--text-muted)] tabular-nums mr-2">{libelleHorodatage(h.le)}</span>
                {LIBELLE_ACTION_HISTORIQUE[h.action] ?? h.action}
                {h.motif && <span className="block text-xs text-[var(--text-muted)]">Motif : {h.motif}</span>}
              </li>
            ))}
          </ol>
        )
      )}

      {reprise.input}

      {apercu && (
        <VisionneusePhoto src={apercu.url} titre="Vérifie ta photo" onFermer={() => setApercu(null)}
          actions={[
            { libelle: 'Reprendre', icone: RotateCcw, onClick: () => { const r = apercu.remplace; setApercu(null); setARemplacer(r); reprise.ouvrir() }, disabled: busy },
            { libelle: busy ? 'Envoi…' : 'Garder', icone: Check, ton: 'primaire', onClick: garderPhoto, disabled: busy },
          ]} />
      )}
      {grande && (
        <VisionneusePhoto src={urls.get(grande.id) ?? null} titre="Compteur de l'appareil" onFermer={() => setGrande(null)}
          actions={modifiable ? [
            { libelle: 'Reprendre', icone: RotateCcw, onClick: () => { setARemplacer(grande); setGrande(null); reprise.ouvrir() }, disabled: busy },
            { libelle: 'Retirer', icone: Trash, ton: 'danger', onClick: () => retirer(grande), disabled: busy },
          ] : []} />
      )}

      <ConfirmDialog open={confirmerSuppression} title="Supprimer la journée"
        message={`Supprimer ta déclaration du ${libelleDateCourte(date)} pour ${nomClient}, photos comprises ?`}
        confirmLabel="Supprimer" loading={busy}
        onConfirm={supprimer} onCancel={() => setConfirmerSuppression(false)} />
    </Carte>
  )
}

function Chiffre({ icone, libelle, valeur }: { icone: React.ReactNode; libelle: string; valeur: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-2 rounded-[var(--r-md)] bg-[var(--bg-elevated)]">
      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">{icone} {libelle}</span>
      <span className="text-xl font-semibold tabular-nums text-[var(--text)]">{valeur}</span>
    </div>
  )
}

function libelleHorodatage(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
}

// ── Mon mois ────────────────────────────────────────────────────────────────

function MonMois({ fiche, version, noms, onChoisirJour }: {
  fiche: MaFiche
  version: number
  noms: Map<string, string>
  onChoisirJour: (date: string) => void
}) {
  const moisCourant = aujourdhui().slice(0, 7)
  const [mois, setMois] = useState(moisCourant)
  const [journees, setJournees] = useState<JourneeColis[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    let annule = false
    const { du, au } = bornesMois(`${mois}-01`)
    listerJournees({ du, au, memberId: fiche.id }).then(({ data, error }) => {
      if (annule) return
      setErreur(error ? error.message : null)
      setJournees(data)
      setChargement(false)
    })
    return () => { annule = true }
  }, [mois, fiche.id, version])

  const totaux = useMemo(() => totauxJournees(journees), [journees])
  const attente = colisEnAttente(totaux)
  const paie = estimationPaie(totaux, fiche)
  const jours = useMemo(() => joursDuMois(journees), [journees])

  return (
    <Carte className="mt-2">
      <TitreCarte icone={<CalendarDays size={18} />}>Mon mois</TitreCarte>
      <div className="flex items-center gap-2">
        <BoutonIcone icone={ChevronLeft} libelle="Mois précédent" onClick={() => { setChargement(true); setMois(m => decalerMois(m, -1)) }} />
        <span className="flex-1 text-center text-sm font-medium text-[var(--text)] first-letter:uppercase">{libelleMois(mois)}</span>
        <BoutonIcone icone={ChevronRight} libelle="Mois suivant" disabled={mois >= moisCourant}
          onClick={() => { setChargement(true); setMois(m => decalerMois(m, 1)) }} />
      </div>

      {erreur && <MessageErreur>{erreur}</MessageErreur>}

      {chargement ? <Skeleton className="h-32" /> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Chiffre icone={<Home size={14} />} libelle="Domicile" valeur={totaux.valides.domicile} />
            <Chiffre icone={<Store size={14} />} libelle="Relais" valeur={totaux.valides.relais} />
            <Chiffre icone={<AlertTriangle size={14} />} libelle="Litiges" valeur={totaux.valides.litige} />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Validés par le bureau ({totaux.valides.jours} jour{totaux.valides.jours > 1 ? 's' : ''}).
            {(attente.domicile + attente.relais + attente.litige) > 0 && (
              <> En attente de validation : {attente.domicile} domicile · {attente.relais} relais · {attente.litige} litige.</>
            )}
            {totaux.aCorriger > 0 && <span className="text-[var(--danger)]"> {totaux.aCorriger} journée{totaux.aCorriger > 1 ? 's' : ''} à corriger.</span>}
          </p>

          <div className="p-3 rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)]">
            <span className="block text-sm text-[var(--text-muted)]">Estimation de ta paie au colis</span>
            {paie.cts == null ? (
              <span className="block text-sm text-[var(--warning)]">Tarif non renseigné, voir avec le bureau.</span>
            ) : (
              <span className="block text-2xl font-semibold tabular-nums text-[var(--text)]">{formatMoney(paie.cts)}</span>
            )}
            <span className="block text-xs text-[var(--text-muted)]">
              Sur les colis validés seulement. Estimation, la fiche de paie fait foi.
            </span>
          </div>

          {jours.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Aucune journée déclarée ce mois-ci.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {jours.map(jour => (
                <li key={jour.date}>
                  <button onClick={() => onChoisirJour(jour.date)}
                    className="w-full min-h-12 py-2 flex flex-col gap-1 text-left hover:bg-[var(--bg-card-hover)] rounded-[var(--r-sm)]">
                    <span className="text-sm font-medium text-[var(--text)] first-letter:uppercase">{libelleDateCourte(jour.date)}</span>
                    {jour.journees.map(j => {
                      const r = colisRetenus(j)
                      return (
                        <span key={j.id} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <span className="flex-1 min-w-0 truncate">
                            {noms.get(j.client_id) ?? j.clients?.name ?? 'Client'} · {r.domicile} dom. · {r.relais} relais{r.litige ? ` · ${r.litige} litige` : ''}
                          </span>
                          <Badge color={COULEUR_STATUT_JOURNEE[j.statut]}>{LIBELLE_STATUT_JOURNEE[j.statut]}</Badge>
                        </span>
                      )
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Carte>
  )
}
