import { useState, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Trash2, Loader2, Camera, Mail, Check, Route, Copy, RefreshCw, Zap, AlertTriangle } from 'lucide-react'
import { DocumentsPanel } from '../../shared/ui/DocumentsPanel'
import { ApercuFacture } from './ApercuFacture'
import { ColisDesJournees } from './ColisDesJournees'
import { uploadDocument, listDocuments, getDownloadUrl } from '../../shared/lib/documents.queries'
// Regle unique « sans justificatif » — la meme que l'alerte de la cloche.
import { isLivraisonSansJustif } from '../../shared/lib/livraisonsSansJustif'
import { aProblemeOuvert, libelleMotif } from '../../shared/lib/problemeTerrain'
import type { DocumentRow } from '../../shared/lib/documents.types'
import { Drawer }      from '../../shared/ui/Drawer'
import { Button }      from '../../shared/ui/Button'
import { Badge }       from '../../shared/ui/Badge'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import { ContactLinks } from '../../shared/ui/ContactLinks'
import { useToast }    from '../../shared/ui/useToast'
import { useProfile, supabase } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { formatMoney, addTva } from '../../shared/lib/money'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { autoliquidationParDefaut } from '../../shared/lib/pays'
import { lireSupplements } from '../../shared/lib/supplements'
import { ExtraLinesEditor } from '../../shared/ui/LignesSupplementaires'
import { Bloc, ChoixClient, ChoixPrestation, Champ as Field } from '../../shared/ui/FicheSaisie'
import type { Supplement } from '../../shared/lib/supplements'
import {
  STATUS_LABELS, STATUS_COLORS,
  TRANSITION_ACTION_LABELS, libelleDelaiPaiement,
  allowedNextStatuses,
  computeAmount,
  effectiveHtCts, effectiveTtcCts,
  tauxTvaInitial, montantsAEcrire, recapMontant, estFacturationBloquee,
  isoLocal, trajet, blocsPrestation,
  heureSaisie, libelleDuree, manquesFiche,
  moisDe, finDeMois, libelleMois, resumeMessagerie,
} from './livraisons.logic'
import type { ClientTariff, Prestation } from './livraisons.logic'
import {
  createDelivery, updateDelivery, transitionDelivery, deleteDelivery,
  getActiveClients, getActiveVehicles, getActiveDrivers, savePod,
  sendClientEmail,
  getClientLookup, revenirALivree,
} from './livraisons.queries'
import type { DeliveryExtraLine, DeliveryRow, DeliveryStatus } from './livraisons.types'
import { ouvrirDocument } from '../../shared/ui/VisionneuseDocument'

// ── Types locaux ──────────────────────────────────────────────────────────────

/**
 * 3 onglets en modification : la course (tout ce qui se saisit, prix compris),
 * les preuves (photo + fichiers, sur une seule page) et la facturation (suivi).
 * Les anciennes clés ('documents', 'pod') restent acceptées en entrée.
 */
type Tab = 'detail' | 'preuves' | 'montant'
type TabDemande = Tab | 'documents' | 'pod'

interface Props {
  open: boolean
  onClose: () => void
  delivery?: DeliveryRow | null
  onSaved: () => void
  /** Onglet pré-sélectionné à l'ouverture (ex 'pod' pour ouvrir les preuves). Défaut 'detail'. */
  initialTab?: TabDemande
  /** Nouvelle course : date pré-remplie (AAAA-MM-JJ, ex. jour cliqué dans le Calendrier). Défaut : aujourd'hui. */
  dateInitiale?: string
}

interface ClientLookup extends ClientTariff {
  id: string
  label: string
  phone: string | null
  email: string | null
  /** Délai de paiement en jours (défaut 30 côté base). */
  payment_terms: number | null
  /** Libellé du délai (« 30 », « fin de mois »…) quand il est renseigné. */
  payment_terms_label: string | null
  /** Numéro de TVA intracommunautaire — condition de l'autoliquidation. */
  tva_intra: string | null
  // Défauts de ses courses (fiche client, lot B).
  pays: string
  retrait_adresse: string | null
  retrait_contact: string | null
  retrait_tel: string | null
  chauffeur_habituel_id: string | null
  vehicule_habituel_id: string | null
  prestation_defaut: Prestation | null
  reference_obligatoire: boolean
  supplements: Supplement[]
}

interface Lookup { id: string; label: string }

// ── Formulaire ────────────────────────────────────────────────────────────────

/** Aujourd'hui en date LOCALE (l'UTC donnait la veille avant 2 h du matin). */
const aujourdhui = () => isoLocal(new Date())

const EMPTY_FORM = {
  date:             '',
  prestation:       'express' as Prestation | '',
  reference_client: '',
  urgent:           '',
  client_id:        '',
  vehicle_id:       '',
  driver_id:        '',
  description:      '',
  pickup_address:   '',
  delivery_address: '',
  // Arrêts : qui remet / qui reçoit (expéditeur / destinataire).
  expediteur_nom:   '',
  expediteur_tel:   '',
  destinataire_nom: '',
  destinataire_tel: '',
  creneau_retrait_debut:   '',
  creneau_retrait_fin:     '',
  creneau_livraison_debut: '',
  creneau_livraison_fin:   '',
  /** Messagerie : prix HT d'UN colis, en euros (pré-rempli par le tarif client). */
  prix_colis:       '',
  // Marchandise
  marchandise_desc: '',
  nb_colis:         '',
  poids_kg_reel:    '',
  volume_m3:        '',
  km:               '',
  duree_min:        '',
  empty_km:         '',
  pallets:          '',
  manual_ht:        '',   // HT en euros (mode manuel)
  tva_override:     '',   // TVA en euros, éditable dans tous les modes
  tva_rate:         '20', // Taux TVA % (pilote l'auto-suggestion)
  /**
   * Facture en AUTOLIQUIDATION : la TVA n'est pas facturée, elle est due par
   * le preneur. Stocké en '1' / '' comme les autres champs du formulaire, qui
   * sont tous des chaînes.
   */
  autoliquidation:  '',
  /** Consignes CHAUFFEUR (colonne `notes`, affichée dans Mes courses). */
  notes:            '',
  /** Note du bureau, jamais montrée au chauffeur. */
  note_interne:     '',
  /** Échéance de paiement imposée (AAAA-MM-JJ) ; vide = délai du client. */
  echeance_le:      '',
  /** Création d'une course PASSÉE, déjà livrée : naît « Livrée ». */
  deja_livree:      '',
}
type Form = typeof EMPTY_FORM

/**
 * Champs que le chauffeur peut AUSSI renseigner depuis Mes courses. Ils ne sont
 * renvoyés à l'enregistrement de la fiche que s'ils ont été modifiés ici :
 * sinon une saisie faite sur le terrain serait écrasée par la valeur chargée à
 * l'ouverture.
 */
const CHAMPS_PARTAGES = [
  'expediteur_nom', 'expediteur_tel', 'destinataire_nom', 'destinataire_tel',
  'marchandise_desc', 'nb_colis', 'poids_kg_reel',
] as const

const nombreOuNull = (s: string) => {
  const n = parseFloat(s.replace(',', '.'))
  return s.trim() && Number.isFinite(n) ? n : null
}

/** Ligne `clients` → entrée du sélecteur (actif ou non). */
function versClientLookup(c: {
  id: string; name: string; tariff_mode: string | null; tariff_rate_cts: number | null
  phone?: string | null; email?: string | null; payment_terms?: number | null
  payment_terms_label?: string | null; tva_intra?: string | null
  pays?: string | null; retrait_adresse?: string | null; retrait_contact?: string | null
  retrait_tel?: string | null; chauffeur_habituel_id?: string | null; vehicule_habituel_id?: string | null
  prestation_defaut?: string | null; reference_obligatoire?: boolean | null; supplements?: unknown
}): ClientLookup {
  return {
    id: c.id,
    label: c.name,
    tariff_mode: (c.tariff_mode ?? 'manuel') as ClientTariff['tariff_mode'],
    tariff_rate_cts: c.tariff_rate_cts ?? null,
    phone: c.phone ?? null,
    email: c.email ?? null,
    payment_terms: c.payment_terms ?? null,
    payment_terms_label: c.payment_terms_label ?? null,
    tva_intra: c.tva_intra ?? null,
    pays: c.pays ?? 'FR',
    retrait_adresse: c.retrait_adresse ?? null,
    retrait_contact: c.retrait_contact ?? null,
    retrait_tel: c.retrait_tel ?? null,
    chauffeur_habituel_id: c.chauffeur_habituel_id ?? null,
    vehicule_habituel_id: c.vehicule_habituel_id ?? null,
    prestation_defaut: (c.prestation_defaut ?? null) as Prestation | null,
    reference_obligatoire: !!c.reference_obligatoire,
    supplements: lireSupplements(c.supplements),
  }
}

/** Formulaire d'une course existante. */
function formDepuis(d: DeliveryRow): Form {
  const derivedHt = effectiveHtCts(d)
  const s = (v: string | number | null | undefined) => v == null ? '' : String(v)
  return {
    date:             d.date,
    prestation:       d.prestation ?? 'express',
    reference_client: s(d.reference_client),
    urgent:           d.urgent ? '1' : '',
    client_id:        d.client_id,
    vehicle_id:       s(d.vehicle_id),
    driver_id:        s(d.driver_id),
    description:      s(d.description),
    pickup_address:   s(d.pickup_address),
    delivery_address: s(d.delivery_address),
    expediteur_nom:   s(d.expediteur_nom),
    expediteur_tel:   s(d.expediteur_tel),
    destinataire_nom: s(d.destinataire_nom),
    destinataire_tel: s(d.destinataire_tel),
    creneau_retrait_debut:   heureSaisie(d.creneau_retrait_debut),
    creneau_retrait_fin:     heureSaisie(d.creneau_retrait_fin),
    creneau_livraison_debut: heureSaisie(d.creneau_livraison_debut),
    creneau_livraison_fin:   heureSaisie(d.creneau_livraison_fin),
    prix_colis:       d.prix_unitaire_cts != null ? (d.prix_unitaire_cts / 100).toFixed(2) : '',
    marchandise_desc: s(d.marchandise_desc),
    nb_colis:         s(d.nb_colis),
    poids_kg_reel:    s(d.poids_kg_reel),
    volume_m3:        s(d.volume_m3),
    km:               s(d.km),
    duree_min:        s(d.duree_min),
    empty_km:         s(d.empty_km),
    pallets:          s(d.weight_kg),
    manual_ht:        derivedHt > 0 ? (derivedHt / 100).toFixed(2) : '',
    tva_override:     d.tva_cts != null ? (d.tva_cts / 100).toFixed(2) : '',
    // Taux STOCKÉ (5,5 reste 5,5) ; à défaut déduit au dixième ; à défaut 20.
    tva_rate:         String(tauxTvaInitial(d)),
    autoliquidation:  d.autoliquidation ? '1' : '',
    notes:            s(d.notes),
    note_interne:     s(d.note_interne),
    echeance_le:      s(d.echeance_le),
    deja_livree:      '',
  }
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerLivraison({ open, onClose, delivery: deliveryProp, onSaved, initialTab = 'detail', dateInitiale }: Props) {
  const { companyId } = useProfile()
  const { toast }     = useToast()

  /**
   * « Dupliquer » : la fiche repasse en CRÉATION, pré-remplie avec la course
   * ouverte (date du jour, aucun statut, aucune preuve). `delivery` vaut alors
   * null dans tout le composant.
   */
  const [copie, setCopie] = useState(false)
  const delivery = copie ? null : deliveryProp
  const isEdit   = !!delivery

  const [tab, setTab]           = useState<Tab>('detail')
  const [form, setForm]         = useState<Form>(EMPTY_FORM)
  /** Valeurs à l'ouverture : seuls les champs partagés avec Mes courses modifiés ici sont réécrits. */
  const formInitial = useRef<Form>(EMPTY_FORM)
  /** Même instantané, en état : lu au rendu (« modifications non enregistrées »). */
  const [instantane, setInstantane] = useState<Form>(EMPTY_FORM)
  /** Course dont le formulaire porte les valeurs (id, ou 'nouvelle'). */
  const [formPour, setFormPour] = useState<string | null>(null)
  const [extraLines, setExtraLines] = useState<DeliveryExtraLine[]>([])
  const [tvaTouched, setTvaTouched] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [tenteEnregistrer, setTenteEnregistrer] = useState(false)
  const [transitioning, setTransitioning] = useState<DeliveryStatus | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmAnnuler, setConfirmAnnuler] = useState(false)
  /**
   * Recalcul auto de la TVA : clé « HT|taux » déjà traitée. 'init' = la
   * fiche vient d'être (ré)ouverte — le premier passage enregistre la clé
   * SANS toucher à la TVA stockée ; ensuite, tout changement de HT ou de taux
   * recalcule la TVA, sauf saisie manuelle dans cette session (tvaTouched).
   */
  const tvaAutoKey = useRef<string>('init')
  /** Facturation demandée sur une course sans aucune preuve de livraison. */
  const [confirmSansPreuve, setConfirmSansPreuve] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Coordonnées géocodées de l'adresse de livraison (Photon). null = saisie libre.
  const [deliveryCoords, setDeliveryCoords] =
    useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })

  const [calcLoading, setCalcLoading] = useState(false)
  const [calcError, setCalcError]     = useState<string | null>(null)
  /** Couple d'adresses dont le trajet est déjà calculé (pas de recalcul à l'ouverture). */
  const trajetCle = useRef('')

  const [clients,  setClients]  = useState<ClientLookup[]>([])
  const [vehicles, setVehicles] = useState<Lookup[]>([])
  const [drivers,  setDrivers]  = useState<Lookup[]>([])

  // ── Référentiels ─────────────────────────────────────────────────────────────

  // Client de la course courante : s'il est INACTIF, il n'est pas dans la
  // liste des actifs — sans lui, `computed` restait nul et l'enregistrement
  // effaçait les montants. On le charge à part et on l'ajoute à la liste.
  const clientCourantId = deliveryProp?.client_id ?? null
  useEffect(() => {
    if (!open) return
    let annule = false
    ;(async () => {
      const { data, error } = await getActiveClients()
      // Jamais de liste vide en silence : on dit pourquoi.
      if (error && !annule) toast(`Liste des clients illisible : ${error.message}`, 'error')
      const liste = (data ?? []).map(versClientLookup)
      if (clientCourantId && !liste.some(c => c.id === clientCourantId)) {
        const { data: inactif } = await getClientLookup(clientCourantId)
        if (inactif) liste.push({ ...versClientLookup(inactif), label: `${inactif.name} (inactif)` })
      }
      if (!annule) setClients(liste)
    })()
    getActiveVehicles().then(({ data }) =>
      setVehicles((data ?? []).map(v => ({ id: v.id, label: v.label })))
    )
    getActiveDrivers().then(({ data }) =>
      setDrivers((data ?? []).map(m => ({ id: m.id, label: m.full_name })))
    )
    return () => { annule = true }
  }, [open, clientCourantId])

  // ── Initialisation formulaire ─────────────────────────────────────────────────

  useEffect(() => {
    setCopie(false)
    // TVA non « touchée » à l'ouverture : elle se recalcule dès que le HT ou
    // le taux change. La valeur stockée est gardée tant que rien ne bouge
    // (voir tvaAutoKey).
    setTvaTouched(false)
    tvaAutoKey.current = 'init'
    setTenteEnregistrer(false)
    if (deliveryProp) {
      const f = formDepuis(deliveryProp)
      setForm(f)
      formInitial.current = f
      setInstantane(f)
      trajetCle.current = `${f.pickup_address.trim()}|${f.delivery_address.trim()}`
      setDeliveryCoords({ lat: deliveryProp.delivery_lat ?? null, lng: deliveryProp.delivery_lng ?? null })
      setExtraLines(Array.isArray(deliveryProp.extra_lines) ? deliveryProp.extra_lines : [])
    } else {
      const f = { ...EMPTY_FORM, date: dateInitiale || aujourdhui() }
      setForm(f)
      formInitial.current = f
      setInstantane(f)
      trajetCle.current = '|'
      setDeliveryCoords({ lat: null, lng: null })
      setExtraLines([])
    }
    setCalcError(null)
    // Même lot de rendu que setForm : le recalcul auto de la TVA sait ainsi
    // si le formulaire affiché est déjà celui de CETTE course.
    setFormPour(deliveryProp?.id ?? 'nouvelle')
    const demande: TabDemande = initialTab
    setTab(demande === 'pod' || demande === 'documents' ? 'preuves' : demande)
  }, [deliveryProp, open, initialTab, dateInitiale])

  const set = (k: keyof Form, v: string) => setForm(p => ({ ...p, [k]: v }))

  /**
   * Prix saisi TTC (ex. montant affiché par une plateforme) : on en déduit le
   * HT au taux courant, et la TVA = TTC − HT pour retomber exactement sur le
   * TTC saisi (écart d'arrondi ≤ 1 ct, accepté par la facturation).
   */
  const saisirTtc = (ttcCts: number) => {
    const taux = parseFloat(form.tva_rate || '20') / 100
    const htCts = form.autoliquidation ? ttcCts : Math.round(ttcCts / (1 + taux))
    setForm(p => ({
      ...p,
      manual_ht: (htCts / 100).toFixed(2),
      tva_override: form.autoliquidation ? '' : ((ttcCts - htCts) / 100).toFixed(2),
    }))
    setTvaTouched(!form.autoliquidation)
  }

  /**
   * Relevé de messagerie : le mois à saisir. Avant le 10, c'est en général le
   * mois PRÉCÉDENT qu'on relève (colis livrés le mois dernier).
   */
  const moisParDefaut = () => {
    const d = new Date()
    if (d.getDate() <= 10) d.setMonth(d.getMonth() - 1, 1)
    return isoLocal(d).slice(0, 7)
  }

  /**
   * Choisir la prestation. Messagerie : la date devient la fin du mois relevé
   * et le prix au colis vient du tarif du client (saisi une seule fois, dans
   * la fiche client).
   */
  const choisirPrestation = (p: Prestation, clientId = form.client_id) => {
    const client = clients.find(c => c.id === clientId)
    setForm(f => {
      const suite = { ...f, prestation: p, client_id: clientId }
      if (p === 'messagerie') {
        suite.date = finDeMois(isEdit ? moisDe(f.date) : moisParDefaut())
        if (!f.prix_colis && client?.tariff_mode === 'colis' && client.tariff_rate_cts != null) {
          suite.prix_colis = (client.tariff_rate_cts / 100).toFixed(2)
        }
      } else if (f.prestation === 'messagerie' && !isEdit) {
        suite.date = aujourdhui()
      }
      return suite
    })
  }

  /**
   * Choisir le client. En CRÉATION, ses habitudes (fiche client) remplissent
   * les cases encore vides : prestation, retrait habituel et son contact,
   * chauffeur, véhicule, autoliquidation (client UE identifié). Rien n'écrase
   * une saisie déjà faite ; en modification, rien n'est pré-rempli.
   */
  const choisirClient = (id: string) => {
    const client = clients.find(c => c.id === id)
    if (!client || isEdit) {
      setForm(f => ({ ...f, client_id: id }))
      return
    }
    const presta: Prestation = client.prestation_defaut
      ?? (client.tariff_mode === 'colis' ? 'messagerie' : ((form.prestation || 'express') as Prestation))
    // Date et prix au colis suivent la prestation (relevé : fin de mois, tarif client).
    choisirPrestation(presta, id)
    setForm(f => {
      const ou = (actuel: string, defaut: string | null) => actuel.trim() ? actuel : (defaut ?? '')
      return {
        ...f,
        client_id: id,
        prestation: presta,
        pickup_address: ou(f.pickup_address, client.retrait_adresse),
        expediteur_nom: ou(f.expediteur_nom, client.retrait_contact),
        expediteur_tel: ou(f.expediteur_tel, client.retrait_tel),
        driver_id: ou(f.driver_id, client.chauffeur_habituel_id),
        vehicle_id: ou(f.vehicle_id, client.vehicule_habituel_id),
        autoliquidation: autoliquidationParDefaut(client.pays, client.tva_intra) ? '1' : f.autoliquidation,
      }
    })
  }

  /** Copie de la course ouverte → nouvelle course (date du jour, sans preuve ni statut). */
  const dupliquer = () => {
    setCopie(true)
    // Relevé de messagerie : on copie vers le mois courant (fin de mois), pas « aujourd'hui ».
    setForm(p => ({ ...p, date: p.prestation === 'messagerie' ? finDeMois(moisParDefaut()) : aujourdhui(), reference_client: '', deja_livree: '' }))
    formInitial.current = EMPTY_FORM
    setInstantane(EMPTY_FORM)
    setFormPour('nouvelle')
    tvaAutoKey.current = 'init'
    setTab('detail')
    toast('Copie prête : vérifiez la date puis enregistrez')
  }

  // ── Calcul trajet IGN ─────────────────────────────────────────────────────────

  const calculerTrajet = async (depart: string, arrivee: string, silencieux: boolean) => {
    if (!depart || !arrivee) {
      if (!silencieux) setCalcError("Renseignez l'adresse de retrait et l'adresse de livraison avant de calculer.")
      return
    }
    trajetCle.current = `${depart}|${arrivee}`
    setCalcLoading(true)
    setCalcError(null)
    const { data, error } = await supabase.functions.invoke('route-calc', {
      body: { depart, arrivee },
    })
    setCalcLoading(false)
    if (error || !data?.ok) {
      setCalcError(data?.error ?? error?.message ?? 'Erreur lors du calcul du trajet.')
      return
    }
    setForm(p => ({
      ...p,
      km: String(Math.round(data.data.distance_km as number)),
      duree_min: data.data.duree_min != null ? String(data.data.duree_min) : '',
    }))
  }

  // Trajet AUTOMATIQUE : dès que les deux adresses sont connues ou changent
  // (avec un délai, pour ne pas appeler l'IGN à chaque frappe). Rien à
  // l'ouverture d'une course existante : la clé est déjà celle de ses adresses.
  const blocs = blocsPrestation(form.prestation || null)
  const isDetailReadOnly = isEdit && ['facturee', 'payee', 'annulee'].includes(delivery?.statut ?? '')
  useEffect(() => {
    if (!open || isDetailReadOnly || !blocs.retrait) return
    const depart = form.pickup_address.trim()
    const arrivee = form.delivery_address.trim()
    if (depart.length < 8 || arrivee.length < 8) return
    if (`${depart}|${arrivee}` === trajetCle.current) return
    const t = setTimeout(() => { calculerTrajet(depart, arrivee, true) }, 1200)
    return () => clearTimeout(t)
  }, [open, form.pickup_address, form.delivery_address, isDetailReadOnly, blocs.retrait])

  // ── Client sélectionné ────────────────────────────────────────────────────────

  const selectedClient = useMemo(
    () => clients.find(c => c.id === form.client_id) ?? null,
    [clients, form.client_id],
  )

  // ── Calcul du montant ─────────────────────────────────────────────────────────

  const prixColisCts = nombreOuNull(form.prix_colis) != null ? Math.round(nombreOuNull(form.prix_colis)! * 100) : null
  const nbColis = nombreOuNull(form.nb_colis) != null ? Math.round(nombreOuNull(form.nb_colis)!) : null
  const computed = useMemo(() => {
    // Sans client choisi, le prix se saisit quand même (mode manuel) : tout
    // doit pouvoir se remplir d'une traite, dans n'importe quel ordre.
    const tarif: ClientTariff = selectedClient ?? { tariff_mode: 'manuel', tariff_rate_cts: null }
    const rate = parseFloat(form.tva_rate || '20') / 100
    const tvaSaisie = form.tva_override !== '' && Number.isFinite(parseFloat(form.tva_override))
      ? Math.round(parseFloat(form.tva_override) * 100) : null
    // Relevé de messagerie : HT = colis × prix au colis, quel que soit le tarif du client.
    if (blocs.releve) {
      return computeAmount({ tariff_mode: 'colis', tariff_rate_cts: prixColisCts },
        { colis: nbColis, manual_tva_cts: tvaSaisie }, rate)
    }
    // Client « au colis » sur une course hors relevé : prix saisi à la main.
    return computeAmount(
      tarif.tariff_mode === 'colis' ? { tariff_mode: 'manuel', tariff_rate_cts: null } : tarif,
      {
        distance_km:   form.km      ? parseFloat(form.km)      : null,
        pallets:       form.pallets ? parseFloat(form.pallets) : null,
        manual_ht_cts: form.manual_ht
          ? Math.round(parseFloat(form.manual_ht) * 100) : null,
        // Le champ TVA fait foi dès qu'il est rempli : valeur stockée à
        // l'ouverture, recalcul automatique ensuite, ou saisie manuelle.
        manual_tva_cts: form.tva_override !== '' && Number.isFinite(parseFloat(form.tva_override))
          ? Math.round(parseFloat(form.tva_override) * 100) : null,
      },
      rate,
    )
  }, [selectedClient, form.km, form.pallets, form.manual_ht, form.tva_override, form.tva_rate, blocs.releve, prixColisCts, nbColis])

  // Recalcule le champ TVA quand le HT ou le taux changent, sauf si
  // l'utilisateur a saisi la TVA à la main dans cette session. Le premier
  // passage après ouverture ne fait que mémoriser la clé : la TVA stockée
  // d'une course existante n'est pas réécrite tant que rien ne bouge.
  const htCourantCts = computed?.amount_ht_cts ?? 0
  useEffect(() => {
    if (tvaTouched) return
    // Formulaire pas encore rechargé pour la course ouverte : ne rien toucher.
    if (formPour !== (delivery?.id ?? 'nouvelle')) return
    const key = `${htCourantCts}|${form.tva_rate}`
    if (tvaAutoKey.current === 'init') {
      tvaAutoKey.current = key
      if (isEdit && form.tva_override !== '') return
    } else if (tvaAutoKey.current === key) {
      return
    }
    tvaAutoKey.current = key
    const rate = parseFloat(form.tva_rate || '20') / 100
    if (htCourantCts > 0) {
      const autoTvaCts = addTva(htCourantCts, rate) - htCourantCts
      setForm(p => ({ ...p, tva_override: (autoTvaCts / 100).toFixed(2) }))
    } else {
      setForm(p => ({ ...p, tva_override: '' }))
    }
  }, [htCourantCts, form.tva_rate, form.tva_override, tvaTouched, selectedClient, isEdit, formPour, delivery?.id])

  // ── Ce qui manque, étape par étape ───────────────────────────────────────────

  const manques = useMemo(() => manquesFiche({
    ...form,
    prestation: form.prestation || 'express',
    reference_exigee: !!selectedClient?.reference_obligatoire,
    ht_cts: computed?.amount_ht_cts ?? (delivery ? effectiveHtCts(delivery) : null),
  }), [form, computed, delivery, selectedClient])

  // ── Permissions ───────────────────────────────────────────────────────────────

  const isMontantReadOnly = isDetailReadOnly

  const tabs: { key: Tab; label: string }[] = [
    { key: 'detail',  label: 'Course' },
    { key: 'preuves', label: 'Preuves & documents' },
    { key: 'montant', label: 'Facturation' },
  ]

  /** La fiche a-t-elle des saisies non enregistrées (form ou suppléments) ? */
  const ficheModifiee = isEdit && formPour === delivery?.id && (
    (Object.keys(form) as Array<keyof Form>).some(k => k !== 'tva_override' && form[k] !== instantane[k])
    || JSON.stringify(extraLines) !== JSON.stringify(Array.isArray(delivery?.extra_lines) ? delivery!.extra_lines : [])
  )

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setTenteEnregistrer(true)
    if (manques.enregistrer.length > 0) {
      toast(`À compléter : ${manques.enregistrer.join(', ')}`, 'error')
      return
    }

    setSaving(true)
    try {
      // Filtrage extras avant persist :
      //  - lignes vides (label vide ET HT=0) → silencieusement ignorées (l'utilisateur
      //    a cliqué « Ajouter » sans compléter, comportement attendu) ;
      //  - lignes partiellement remplies (label OK mais HT ≤ 0, ou HT OK mais label
      //    absent) → ignorées avec toast d'avertissement, pour ne pas envoyer un
      //    extra bancal que l'Edge pennylane-invoice refuserait en 422 plus tard.
      const cleanedExtras: DeliveryExtraLine[] = []
      let droppedIncomplete = 0
      for (const l of extraLines) {
        const label = (l.label ?? '').trim()
        const ht = Number(l.amount_ht_cts)
        const qty = Number(l.quantity)
        const validLabel = label.length > 0
        const validHt    = Number.isFinite(ht) && ht > 0
        const validQty   = Number.isFinite(qty) && qty >= 1
        const isEmpty    = !validLabel && !(Number.isFinite(ht) && ht > 0)
        if (isEmpty) continue
        if (!validLabel || !validHt || !validQty) { droppedIncomplete++; continue }
        cleanedExtras.push({
          label,
          quantity: qty,
          amount_ht_cts: Math.round(ht),
          tva_rate: Number(l.tva_rate) || 0,
        })
      }
      if (droppedIncomplete > 0) {
        toast('Ligne(s) supplémentaire(s) incomplète(s) ignorée(s)', 'error')
      }

      // Filet de sécurité géocodage : si l'adresse de livraison est saisie
      // mais sans coords (autocomplétion Photon échouée ou saisie tapée sans
      // clic sur une suggestion), on interroge l'Edge Function `geocode` (BAN)
      // avant persist. Échec → toast d'avertissement, on sauvegarde quand
      // même (l'optim de tournée sera juste indisponible sur cette ligne).
      let delivery_lat = deliveryCoords.lat
      let delivery_lng = deliveryCoords.lng
      const addr = form.delivery_address?.trim() ?? ''
      if (addr && (delivery_lat == null || delivery_lng == null)) {
        const { data } = await supabase.functions.invoke('geocode', { body: { address: addr } })
        if (data?.ok && typeof data.lat === 'number' && typeof data.lng === 'number') {
          delivery_lat = data.lat
          delivery_lng = data.lng
        } else {
          toast('Adresse de livraison non localisée', 'error')
        }
      }

      // Champs partagés avec Mes courses : seulement s'ils ont
      // bougé ici (voir CHAMPS_PARTAGES).
      const partages: Record<string, string | number | null> = {}
      for (const k of CHAMPS_PARTAGES) {
        if (form[k] === formInitial.current[k]) continue
        partages[k] = k === 'nb_colis' || k === 'poids_kg_reel'
          ? (k === 'nb_colis' ? (nombreOuNull(form[k]) != null ? Math.round(nombreOuNull(form[k])!) : null) : nombreOuNull(form[k]))
          : (form[k].trim() || null)
      }

      // Seules les colonnes v2 sont écrites pour les montants.
      // montant_ht_cts (DEFAULT 0) et montant_ttc_cts (GENERATED) ne sont JAMAIS écrits.
      const payload = {
        date:             form.date,
        prestation:       (form.prestation || 'express') as Prestation,
        reference_client: form.reference_client.trim() || null,
        urgent:           !!form.urgent,
        client_id:        form.client_id,
        vehicle_id:       form.vehicle_id  || null,
        driver_id:        form.driver_id   || null,
        description:      form.description.trim() || null,
        pickup_address:   blocs.retrait ? (form.pickup_address.trim() || null) : null,
        delivery_address: blocs.livraison ? (form.delivery_address.trim() || null) : null,
        delivery_lat:     blocs.livraison ? delivery_lat : null,
        delivery_lng:     blocs.livraison ? delivery_lng : null,
        creneau_retrait_debut:   blocs.retrait ? (form.creneau_retrait_debut || null) : null,
        creneau_retrait_fin:     blocs.retrait ? (form.creneau_retrait_fin || null) : null,
        creneau_livraison_debut: blocs.livraison ? (form.creneau_livraison_debut || null) : null,
        creneau_livraison_fin:   blocs.livraison ? (form.creneau_livraison_fin || null) : null,
        volume_m3:        nombreOuNull(form.volume_m3),
        prix_unitaire_cts: blocs.releve ? prixColisCts : null,
        ...(blocs.releve ? { nb_colis: nbColis } : {}),
        km:               nombreOuNull(form.km),
        duree_min:        nombreOuNull(form.duree_min) != null ? Math.round(nombreOuNull(form.duree_min)!) : null,
        empty_km:         nombreOuNull(form.empty_km),
        // `weight_kg` est ce que LIT le chauffeur (Mes courses, tournées) : on y
        // recopie le poids saisi ; seul un client au tarif palette y garde ses palettes.
        weight_kg:        selectedClient?.tariff_mode === 'palette'
          ? nombreOuNull(form.pallets)
          : (nombreOuNull(form.poids_kg_reel) ?? nombreOuNull(form.pallets)),
        ...partages,
        // Montants : jamais effacés faute de calcul (client introuvable, tarif
        // incomplet). En AUTOLIQUIDATION : taux 0, TVA 0, TTC = HT — forcé ici
        // plutôt que de faire confiance à l'état du formulaire.
        ...montantsAEcrire(computed, {
          autoliquidation: !!form.autoliquidation,
          tauxPct: parseFloat(form.tva_rate || '20'),
          htExistantCts: delivery?.amount_ht_cts ?? null,
        }),
        autoliquidation:  !!form.autoliquidation,
        notes:            form.notes.trim() || null,
        note_interne:     form.note_interne.trim() || null,
        // Envoyée seulement si renseignée (ou effacée) : une base pas encore
        // migrée refuserait sinon TOUT enregistrement à cause de cette colonne.
        ...(form.echeance_le || instantane.echeance_le ? { echeance_le: form.echeance_le || null } : {}),
        extra_lines:      cleanedExtras,
      }

      if (isEdit && delivery) {
        const { error } = await updateDelivery(delivery.id, payload)
        if (error) throw error
        toast('Livraison mise à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createDelivery({
          amount_ht_cts:  null,
          tva_cts:        null,
          amount_ttc_cts: null,
          type:           deliveryProp?.type ?? null,
          ...payload,
          company_id:  companyId,
          // Un relevé de messagerie constate des colis DÉJÀ livrés : il naît
          // « Livrée », prêt à facturer, sans preuve unitaire attendue.
          // Course passée saisie après coup : « Déjà livrée » la crée livrée,
          // prête à facturer, sans rouvrir la fiche pour la faire avancer.
          statut:      blocs.releve || form.deja_livree ? 'livree' : 'planifiee',
          ...(blocs.releve ? { delivered_at: new Date().toISOString(), justif_non_requis: true } : {}),
          ...(!blocs.releve && form.deja_livree ? { delivered_at: new Date(`${form.date}T12:00:00`).toISOString() } : {}),
          invoiced_at: null,
          paid_at:     null,
        })
        if (error) throw error
        toast(copie ? 'Copie créée' : 'Livraison créée')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Facture-t-on cette course sans la moindre preuve de livraison ?
   *
   * Les documents sont relus ICI, au moment du clic, et pas gardes en etat :
   * le POD peut avoir ete depose depuis une autre session ou par le chauffeur
   * sur son telephone pendant que ce tiroir etait ouvert. Une seule requete,
   * et seulement quand on s'apprete a facturer.
   */
  const factureSansPreuve = async (): Promise<boolean> => {
    if (!delivery) return false
    const { data } = await listDocuments({ entity_type: 'delivery', entity_id: delivery.id })
    return isLivraisonSansJustif(
      {
        id: delivery.id,
        statut: delivery.statut,
        pod_captured_at: delivery.pod_captured_at,
        lv_pdf_url: delivery.lv_pdf_url,
        justif_non_requis: delivery.justif_non_requis,
      },
      (data ?? []).map(d => ({ entity_type: d.entity_type, entity_id: d.entity_id })),
    )
  }

  /**
   * Facturation effective, une fois le manque de preuve assume.
   *
   * `marquerNonRequis` coche `justif_non_requis` AVANT la transition : c'est la
   * meme case que dans l'onglet POD, donc l'alerte de la cloche s'eteint aussi.
   * Deux facons de dire la meme chose auraient fini par ne plus s'accorder.
   */
  const facturerQuandMeme = async (marquerNonRequis: boolean) => {
    if (!delivery) return
    setConfirmSansPreuve(false)
    if (marquerNonRequis) {
      const { error } = await updateDelivery(delivery.id, { justif_non_requis: true })
      if (error) { toast(error.message, 'error'); return }
    }
    await executerTransition('facturee')
  }

  const handleTransition = async (to: DeliveryStatus) => {
    if (!delivery) return

    // La facture part avec ce qui est EN BASE : une saisie non enregistrée
    // (prix, supplément, référence) serait ignorée sans prévenir.
    if (to === 'facturee' && ficheModifiee) {
      toast('Modifications non enregistrées dans l’onglet Course : enregistrez d’abord, puis facturez', 'error')
      setTab('detail')
      return
    }

    if (to === 'facturee') {
      const ht = delivery.amount_ht_cts ?? 0
      if (ht <= 0) {
        toast("Prix requis avant de facturer — saisissez-le dans l'onglet Course", 'error')
        setTab('detail')
        return
      }
      // Le client exige sa référence sur la facture (fiche client).
      if (selectedClient?.reference_obligatoire && !delivery.reference_client?.trim()) {
        toast('Ce client exige sa référence sur la facture — saisissez-la dans l’onglet Course', 'error')
        setTab('detail')
        return
      }
      // Dernier moment ou la preuve peut encore etre obtenue : apres, le client
      // est loin et la facture est partie. L'alerte de la cloche arrive, elle,
      // des semaines plus tard — trop tard pour faire quoi que ce soit.
      setTransitioning(to)
      const sansPreuve = await factureSansPreuve()
      setTransitioning(null)
      if (sansPreuve) { setConfirmSansPreuve(true); return }
    }

    // Annulation : définitive (annulee → rien) — confirmation explicite.
    if (to === 'annulee') { setConfirmAnnuler(true); return }

    await executerTransition(to)
  }

  const handleRevenirALivree = async () => {
    if (!delivery) return
    const { data, error } = await revenirALivree(delivery.id)
    if (error) { toast(error.message, 'error'); return }
    if (!data || data.length === 0) {
      toast("Rien à réparer : la course n'est plus dans cet état (rechargez).", 'error')
      return
    }
    toast('Course revenue à « Livrée » — elle peut être refacturée.')
    onSaved()
    onClose()
  }

  const executerTransition = async (to: DeliveryStatus) => {
    if (!delivery) return
    setTransitioning(to)

    const amountForTransition = to === 'facturee' ? {
      amount_ht_cts:  delivery.amount_ht_cts  ?? 0,
      tva_cts:        delivery.tva_cts         ?? 0,
      amount_ttc_cts: delivery.amount_ttc_cts ?? 0,
    } : undefined

    const { error } = await transitionDelivery(delivery.id, delivery.statut, to, amountForTransition)
    if (error) {
      toast(error.message, 'error')
      setTransitioning(null)
      // Un échec de facturation a pu écrire sync_error / sync_pending : la
      // liste doit le montrer.
      if (to === 'facturee') onSaved()
      return
    }
    toast(`Livraison : ${STATUS_LABELS[to]}`)
    onSaved()
    onClose()
    setTransitioning(null)
  }

  const handleDelete = async () => {
    if (!delivery) return
    setDeleting(true)
    const { error } = await deleteDelivery(delivery.id)
    setDeleting(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDelete(false)
    toast('Livraison supprimée')
    onSaved()
    onClose()
  }

  // Suppression unitaire : gardée par permission delete.
  // Une livraison facturée/payée exige une double vérification (case à cocher).
  const { can } = usePermissions()
  const canDelete = isEdit && can('livraisons.livraisons', 'delete')
  const canSave = !isDetailReadOnly && can('livraisons.livraisons', isEdit ? 'update' : 'create')
  const isInvoicedLike = ['facturee', 'payee'].includes(delivery?.statut ?? '')

  // ── Render ────────────────────────────────────────────────────────────────────

  const drawerTitle = isEdit
    ? `Livraison — ${delivery!.clients?.name ?? '…'}`
    : copie ? 'Nouvelle livraison (copie)' : 'Nouvelle livraison'

  const htAffiche = computed?.amount_ht_cts ?? (delivery ? effectiveHtCts(delivery) : 0)
  const chauffeurNom = drivers.find(d => d.id === form.driver_id)?.label ?? delivery?.team_members?.full_name ?? null
  const ro = isDetailReadOnly
  const prestation = (form.prestation || 'express') as Prestation
  const trajetTxt = [
    form.km ? `${form.km} km` : null,
    libelleDuree(nombreOuNull(form.duree_min)),
  ].filter(Boolean).join(' · ')

  return (
    <Drawer open={open} onClose={onClose} title={drawerTitle} width="max-w-[min(80rem,100vw)]">

      {/* Résumé de la course — ce qu'on veut lire sans ouvrir un onglet. */}
      {isEdit && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-4">
          <Badge color={STATUS_COLORS[delivery!.statut] ?? 'muted'}>
            {STATUS_LABELS[delivery!.statut] ?? delivery!.statut}
          </Badge>
          {delivery!.urgent && <Badge color="danger">Urgent</Badge>}
          {!blocs.releve && ['livree', 'facturee', 'payee'].includes(delivery!.statut) && (
            delivery!.pod_captured_at
              ? <Badge color="success">Preuve OK</Badge>
              : delivery!.justif_non_requis ? null : <Badge color="warning">Sans preuve</Badge>
          )}
          <span className="text-sm text-[var(--text)]">
            {blocs.releve
              ? `${libelleMois(delivery!.date)} · ${resumeMessagerie(delivery!.nb_colis, delivery!.prix_unitaire_cts) ?? ''}`
              : trajet(delivery!.pickup_address, delivery!.delivery_address).court}
          </span>
          {chauffeurNom && <span className="text-xs text-[var(--text-muted)]">{chauffeurNom}</span>}
          <span className="ml-auto flex items-center gap-3">
            {htAffiche > 0 && <span className="font-mono text-sm text-[var(--text)]">{formatMoney(htAffiche)} HT</span>}
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {new Date(`${delivery!.date}T00:00:00`).toLocaleDateString('fr-FR')}
            </span>
          </span>
        </div>
      )}

      {isEdit && (
        <div className="flex gap-0 mb-5 border-b border-[var(--border)]">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-colors -mb-px
                ${tab === t.key
                  ? 'text-[var(--brand)] border-b-2 border-[var(--brand)] font-medium'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Onglet Course : la fiche unique ─────────────────────────────────── */}
      {tab === 'detail' && (
        <div className="flex flex-col gap-4">
          {/* Échec signalé par le chauffeur : la course reste ouverte, le bureau décide. */}
          {isEdit && aProblemeOuvert({ statut: delivery!.statut, probleme_le: delivery!.probleme_le ?? null }) && (
            <div className="flex items-start gap-3 rounded-[var(--r-lg)] border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3">
              <AlertTriangle size={18} className="text-[var(--danger)] shrink-0 mt-0.5" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-[var(--danger)]">
                  Échec signalé par le chauffeur : {libelleMotif(delivery!.probleme_motif)}
                  {delivery!.probleme_le && (
                    <span className="ml-2 font-normal text-xs text-[var(--text-muted)]">
                      {new Date(delivery!.probleme_le).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
                {delivery!.probleme_note && <p className="text-[var(--text)] mt-0.5">{delivery!.probleme_note}</p>}
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  La course reste ouverte : replanifie-la (change la date ou le chauffeur) ou annule-la dans l'onglet Facturation.
                </p>
              </div>
            </div>
          )}

          {/* ① Ordre : une bande */}
          <Bloc titre="Ordre"
            droite={!blocs.releve && (
              <button type="button" disabled={ro}
                onClick={() => set('urgent', form.urgent ? '' : '1')}
                aria-pressed={!!form.urgent}
                title="Course urgente"
                className={`h-8 px-3 rounded-[var(--r-pill)] border text-xs flex items-center gap-1.5 transition-colors disabled:opacity-60
                  ${form.urgent
                    ? 'bg-[var(--danger)]/15 border-[var(--danger)] text-[var(--danger)] font-medium'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                <Zap size={13} /> Urgent
              </button>
            )}>
            <Field label="Prestation">
              <ChoixPrestation value={prestation} onChange={choisirPrestation} disabled={ro} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-start">
              <Field label="Client *" error={tenteEnregistrer && !form.client_id ? 'Le client est requis' : undefined}>
                <ChoixClient clients={clients} value={form.client_id} disabled={ro}
                  onChange={choisirClient} />
                {selectedClient && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    {(selectedClient.phone || selectedClient.email) && (
                      <ContactLinks phone={selectedClient.phone} email={selectedClient.email} />
                    )}
                    {/* LE DÉLAI DE PAIEMENT, visible dès la création : c'est en
                        acceptant la course qu'on décide s'il est acceptable. */}
                    <span>Paiement : {libelleDelaiPaiement(selectedClient)}</span>
                  </div>
                )}
              </Field>
              {blocs.releve ? (
                <Field label="Mois relevé *">
                  <Input type="month" value={moisDe(form.date)} disabled={ro}
                    onChange={v => v && set('date', finDeMois(v))} />
                </Field>
              ) : (
                <Field label="Date *" error={tenteEnregistrer && !form.date ? 'La date est requise' : undefined}>
                  <Input type="date" value={form.date} onChange={v => set('date', v)} disabled={ro} />
                </Field>
              )}
              <Field label={selectedClient?.reference_obligatoire ? 'Référence client *' : 'Référence client'}>
                <Input value={form.reference_client} onChange={v => set('reference_client', v)}
                  placeholder="ODT, n° de commande…" disabled={ro} />
              </Field>
            </div>
          </Bloc>

          {blocs.releve && (
            <Bloc titre={`Relevé ${form.date ? libelleMois(form.date) : ''}`}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Colis livrés dans le mois">
                  <Input type="number" value={form.nb_colis} onChange={v => set('nb_colis', v)}
                    placeholder="0" min={0} step={1} disabled={ro} />
                </Field>
                <Field label="Prix au colis (€ HT)">
                  <Input type="number" value={form.prix_colis} onChange={v => set('prix_colis', v)}
                    placeholder="1,00" min={0} step={0.01} disabled={ro} />
                </Field>
              </div>
              {form.client_id && !ro && (
                <ColisDesJournees clientId={form.client_id} date={form.date} valeur={nbColis}
                  onReprendre={n => set('nb_colis', String(n))} />
              )}
              <div className="flex items-baseline justify-between gap-3 rounded-[var(--r-md)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg-card))] border border-[var(--border)] px-3 py-2">
                <span className="text-sm text-[var(--text-muted)]">
                  {resumeMessagerie(nbColis, prixColisCts) ?? 'Colis × prix au colis'}
                </span>
                <span className="font-mono text-sm font-semibold text-[var(--text)]">
                  {computed ? `${formatMoney(computed.amount_ht_cts)} HT` : '—'}
                </span>
              </div>
              {selectedClient && selectedClient.tariff_mode !== 'colis' && (
                <span className="text-xs text-[var(--text-muted)]">
                  Astuce : mettez ce client au tarif « Au colis » (fiche client) pour que le prix se remplisse tout seul.
                </span>
              )}
            </Bloc>
          )}

          {/* ② Retrait | Livraison côte à côte, trajet entre les deux */}
          {(blocs.retrait || blocs.livraison) && (
            <div className={`grid gap-4 items-stretch ${blocs.retrait && blocs.livraison ? 'lg:grid-cols-2' : ''}`}>
              {blocs.retrait && (
                <Bloc titre="Retrait" droite={<span className="text-xs text-[var(--text-muted)]">vide = départ du dépôt</span>}>
                  <Field label="Adresse de retrait">
                    <AddressAutocomplete
                      value={form.pickup_address}
                      placeholder="Rue, ville…"
                      disabled={ro}
                      onChange={v => set('pickup_address', v)}
                      onSelect={s => set('pickup_address', s.address)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Qui remet">
                      <Input value={form.expediteur_nom} onChange={v => set('expediteur_nom', v)}
                        placeholder="Nom, société" disabled={ro} />
                    </Field>
                    <Field label="Téléphone">
                      <Input type="tel" value={form.expediteur_tel} onChange={v => set('expediteur_tel', v)}
                        placeholder="06…" disabled={ro} />
                    </Field>
                  </div>
                  <Creneau debut={form.creneau_retrait_debut} fin={form.creneau_retrait_fin}
                    onDebut={v => set('creneau_retrait_debut', v)} onFin={v => set('creneau_retrait_fin', v)}
                    disabled={ro} />
                </Bloc>
              )}

              {blocs.livraison && (
                <Bloc titre={blocs.titreLivraison}>
                  <Field label={prestation === 'mise_a_dispo' ? 'Adresse du lieu' : 'Adresse de livraison'}>
                    <AddressAutocomplete
                      value={form.delivery_address}
                      placeholder="Rue, ville…"
                      disabled={ro}
                      onChange={v => {
                        set('delivery_address', v)
                        // Saisie libre : on invalide les coordonnées tant qu'aucune suggestion n'est choisie.
                        setDeliveryCoords({ lat: null, lng: null })
                      }}
                      onSelect={s => {
                        set('delivery_address', s.address)
                        setDeliveryCoords({ lat: s.lat, lng: s.lng })
                      }}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={prestation === 'mise_a_dispo' ? 'Contact sur place' : 'Qui reçoit'}>
                      <Input value={form.destinataire_nom} onChange={v => set('destinataire_nom', v)}
                        placeholder="Nom, société" disabled={ro} />
                    </Field>
                    <Field label="Téléphone">
                      <Input type="tel" value={form.destinataire_tel} onChange={v => set('destinataire_tel', v)}
                        placeholder="06…" disabled={ro} />
                    </Field>
                  </div>
                  <Creneau debut={form.creneau_livraison_debut} fin={form.creneau_livraison_fin}
                    onDebut={v => set('creneau_livraison_debut', v)} onFin={v => set('creneau_livraison_fin', v)}
                    disabled={ro} libelleDebut={prestation === 'mise_a_dispo' ? 'Début' : undefined}
                    libelleFin={prestation === 'mise_a_dispo' ? 'Fin' : undefined} />
                </Bloc>
              )}
            </div>
          )}

          {blocs.retrait && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-[var(--r-pill)] border border-dashed border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-4 py-1.5">
              <Route size={15} className="text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Trajet</span>
              {calcLoading
                ? <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />
                : <span className="text-sm font-semibold text-[var(--text)]">{trajetTxt || '—'}</span>}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--text-muted)]">km</span>
                <div className="w-[5rem]">
                  <Input type="number" value={form.km} onChange={v => { set('km', v); setCalcError(null) }}
                    placeholder="0" disabled={ro} />
                </div>
                {!ro && (
                  <BoutonIcone icone={RefreshCw} libelle="Recalculer le trajet (IGN)" taille="sm"
                    disabled={calcLoading}
                    onClick={() => calculerTrajet(form.pickup_address.trim(), form.delivery_address.trim(), false)} />
                )}
              </div>
              {calcError && <span className="basis-full text-center text-xs text-[var(--warning)]">{calcError}</span>}
            </div>
          )}

          {/* ③ Marchandise : une ligne */}
          {blocs.marchandise && (
            <Bloc titre="Marchandise">
              <div className="grid gap-3 grid-cols-3 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
                <div className="col-span-3 lg:col-span-1">
                  <Field label="Nature">
                    <Input value={form.marchandise_desc} onChange={v => set('marchandise_desc', v)}
                      placeholder="Colis, palette, meuble, documents…" disabled={ro} />
                  </Field>
                </div>
                <Field label="Colis">
                  <Input type="number" value={form.nb_colis} onChange={v => set('nb_colis', v)}
                    placeholder="0" min={0} step={1} disabled={ro} />
                </Field>
                <Field label="Poids (kg)">
                  <Input type="number" value={form.poids_kg_reel} onChange={v => set('poids_kg_reel', v)}
                    placeholder="0" min={0} disabled={ro} />
                </Field>
                <Field label="Volume (m³)">
                  <Input type="number" value={form.volume_m3} onChange={v => set('volume_m3', v)}
                    placeholder="0" min={0} step={0.1} disabled={ro} />
                </Field>
              </div>
            </Bloc>
          )}

          {/* ④ Exécution (équipe) | Prix et facture (argent) */}
          <div className="grid gap-4 lg:grid-cols-2 items-stretch">
            <Bloc titre={blocs.releve ? 'Notes' : 'Exécution'}>
              {blocs.execution && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Chauffeur">
                    <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)}
                      disabled={ro} className={inputCls}>
                      <option value="">— À affecter —</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Véhicule">
                    <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}
                      disabled={ro} className={inputCls}>
                      <option value="">— À affecter —</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              {!blocs.releve && (
                <Field label="Consignes chauffeur (visibles dans Mes courses)">
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                    rows={3} disabled={ro} placeholder="Code, étage, appeler avant, 2 personnes…"
                    className={`${textareaCls} min-h-[4.5rem]`} />
                </Field>
              )}
              <Field label="Note interne (bureau seulement)">
                <textarea value={form.note_interne} onChange={e => set('note_interne', e.target.value)}
                  rows={2} disabled={ro} placeholder="Prix négocié, contexte client…"
                  className={`${textareaCls} min-h-[3.5rem]`} />
              </Field>
            </Bloc>

            <Bloc titre={blocs.releve ? 'Facture' : 'Prix et facture'}>
              <Field label="Libellé de facture">
                <Input value={form.description} onChange={v => set('description', v)}
                  placeholder={blocs.releve
                    ? `Vide = « Messagerie ${form.date ? libelleMois(form.date) : '…'} — colis livrés »`
                    : `Vide = « Livraison du ${form.date ? new Date(`${form.date}T00:00:00`).toLocaleDateString('fr-FR') : '…'} »`}
                  disabled={ro} />
              </Field>
              <MontantTab
                integre
                releve={blocs.releve}
                onTtcChange={!blocs.releve && (!selectedClient || selectedClient.tariff_mode === 'manuel' || selectedClient.tariff_mode === 'colis')
                  ? saisirTtc : undefined}
                extraLines={extraLines}
                setExtraLines={setExtraLines}
                form={form}
                set={set}
                tvaTouched={tvaTouched}
                onTvaChange={v => { set('tva_override', v); setTvaTouched(true) }}
                onTvaRateChange={r => { set('tva_rate', String(r)); setTvaTouched(false) }}
                selectedClient={selectedClient}
                tvaIntraClient={selectedClient ? selectedClient.tva_intra : null}
                computed={computed}
                delivery={delivery}
                isReadOnly={isMontantReadOnly}
                saving={saving}
                onSave={handleSave}
                onClose={onClose}
              />
              <Field label="Échéance de paiement">
                <div className="flex items-center gap-2">
                  <div className="w-[11rem]">
                    <Input type="date" value={form.echeance_le} onChange={v => set('echeance_le', v)} disabled={ro} />
                  </div>
                  {form.echeance_le && !ro && (
                    <button type="button" onClick={() => set('echeance_le', '')}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">Revenir au délai du client</button>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {form.echeance_le ? 'Échéance imposée (30 jours maximum après la facture).' : 'Vide = délai du client (30 jours maximum).'}
                </span>
              </Field>
            </Bloc>
          </div>

          {/* Ce qui manque, par étape : n'empêche pas d'enregistrer (sauf client / date). */}
          {!ro && (manques.partir.length + manques.facturer.length) > 0 && (
            <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg-card))] px-3 py-2 flex flex-col gap-1 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                <AlertTriangle size={13} className="text-[var(--warning)]" /> Il manque
              </span>
              {manques.partir.length > 0 && <Manque etape="pour partir" liste={manques.partir} />}
              {manques.facturer.length > 0 && <Manque etape="pour facturer" liste={manques.facturer} />}
            </div>
          )}

          {/* Barre d'actions FIXE en bas du tiroir : plus besoin de descendre. */}
          <div className="sticky -bottom-5 -mx-5 -mb-5 mt-1 px-5 py-3 flex items-center gap-2
            bg-[var(--bg-elevated)] border-t border-[var(--border)] z-10">
            {canSave && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : copie ? 'Créer la copie' : 'Enregistrer'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              {ro ? 'Fermer' : 'Annuler'}
            </Button>
            {tenteEnregistrer && manques.enregistrer.length > 0 && (
              <span className="text-xs text-[var(--danger)]">À compléter : {manques.enregistrer.join(', ')}</span>
            )}
            {!isEdit && !blocs.releve && canSave && (
              <label className="ml-3 flex items-center gap-2 cursor-pointer text-sm text-[var(--text-muted)]"
                title="Course passée saisie après coup : elle est créée « Livrée », prête à facturer.">
                <input type="checkbox" checked={!!form.deja_livree}
                  onChange={e => set('deja_livree', e.target.checked ? '1' : '')}
                  className="accent-[var(--brand)] w-4 h-4 shrink-0 cursor-pointer" />
                Déjà livrée <span className="hidden xl:inline text-xs">(saisie après coup)</span>
              </label>
            )}
            <span className="ml-auto flex items-center gap-2">
              {isEdit && can('livraisons.livraisons', 'create') && (
                <BoutonIcone icone={Copy} libelle="Dupliquer (nouvelle course pré-remplie)" onClick={dupliquer} />
              )}
              {canDelete && (
                <BoutonIcone icone={Trash2} libelle="Supprimer la livraison" onClick={() => setConfirmDelete(true)} />
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── Onglet Preuves & documents ──────────────────────────────────────── */}
      {tab === 'preuves' && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2 items-start">
            <Bloc titre="Preuve de livraison" icone={<Camera size={15} />}>
              <PodTab delivery={delivery ?? null} companyId={companyId} onSaved={onSaved} />
            </Bloc>
            <Bloc titre="Fichiers">
              <DocumentsPanel entityType="delivery" entityId={delivery?.id ?? null} />
            </Bloc>
          </div>
        </div>
      )}

      {/* ── Onglet Facturation : suivi, facture, envoi ──────────────────────── */}
      {tab === 'montant' && delivery && (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <Bloc titre="Suivi et actions">
            <SuiviTab
              delivery={delivery}
              transitioning={transitioning}
              onTransition={handleTransition}
              onRevenirALivree={handleRevenirALivree}
            />
          </Bloc>
          <div className="flex flex-col gap-4">
            <Bloc titre="Facture">
              <EtatFacture delivery={delivery} extraLines={extraLines} />
            </Bloc>
            <Bloc titre="Historique">
              <HistoriqueCourse delivery={delivery} />
            </Bloc>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette livraison ?"
        message={isInvoicedLike
          ? "Cette livraison est facturée. La supprimer ici ne touche PAS Pennylane : la facture devra être annulée séparément. Action irréversible."
          : 'Action irréversible.'}
        acknowledgeLabel={isInvoicedLike
          ? "Je comprends que cette livraison est facturée : la facture Pennylane devra être annulée séparément, et cette suppression est irréversible."
          : undefined}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />

      {/* Dernier rappel avant que la facture ne parte. Volontairement PAS un
          blocage : un chauffeur n'a pas toujours quelqu'un pour signer ni du
          réseau, et une course réelle ne doit jamais rester infacturable. */}
      <ConfirmDialog
        open={confirmSansPreuve}
        title="Facturer sans preuve de livraison ?"
        message={"Cette course n'a ni photo ni POD signé. "
          + "C'est le dernier moment pour en obtenir une : après, la facture est partie et le client est loin."}
        optionLabel="Aucun justificatif n'est attendu pour cette course"
        confirmLabel="Facturer quand même"
        onConfirm={facturerQuandMeme}
        onCancel={() => setConfirmSansPreuve(false)}
        loading={transitioning === 'facturee'}
      />

      <ConfirmDialog
        open={confirmAnnuler}
        title="Annuler cette livraison ?"
        message="La course passera au statut « Annulée ». C'est définitif : elle ne pourra plus être démarrée, livrée ni facturée."
        confirmLabel="Annuler la livraison"
        cancelLabel="Garder la livraison"
        onConfirm={async () => { setConfirmAnnuler(false); await executerTransition('annulee') }}
        onCancel={() => setConfirmAnnuler(false)}
        loading={transitioning === 'annulee'}
      />
    </Drawer>
  )
}

// ── Petits blocs de la fiche ──────────────────────────────────────────────────

function Manque({ etape, liste }: { etape: string; liste: string[] }) {
  return (
    <span className="text-[var(--text-muted)]">
      <span className="text-[var(--text)]">{etape} :</span> {liste.join(', ')}
    </span>
  )
}

/** Créneau « au plus tôt / au plus tard » ; résumé lisible à côté. */
function Creneau({ debut, fin, onDebut, onFin, disabled, libelleDebut = 'Au plus tôt', libelleFin = 'Au plus tard' }: {
  debut: string; fin: string
  onDebut: (v: string) => void; onFin: (v: string) => void
  disabled?: boolean; libelleDebut?: string; libelleFin?: string
}) {
  const invalide = !!debut && !!fin && fin <= debut
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-3">
        <Field label={libelleDebut}>
          <Input type="time" value={debut} onChange={onDebut} disabled={disabled} />
        </Field>
        <Field label={libelleFin}>
          <Input type="time" value={fin} onChange={onFin} disabled={disabled} />
        </Field>
      </div>
      {invalide && <span className="text-xs text-[var(--danger)]">La fin du créneau est avant son début.</span>}
    </div>
  )
}

/** Dates clés de la course, de sa création à son paiement (colonnes déjà en base). */
function HistoriqueCourse({ delivery }: { delivery: DeliveryRow }) {
  const evenements: Array<{ libelle: string; date: string | null | undefined }> = [
    { libelle: 'Créée', date: delivery.created_at },
    { libelle: 'Course prévue le', date: `${delivery.date}T12:00:00` },
    { libelle: 'Échec signalé', date: delivery.probleme_le },
    { libelle: 'Livrée', date: delivery.delivered_at },
    { libelle: 'Facturée', date: delivery.invoiced_at },
    { libelle: 'Facture envoyée au client', date: delivery.email_sent_at },
    { libelle: 'Payée', date: delivery.paid_at },
  ]
  const lignes = evenements
    .filter(e => e.date)
    .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
  return (
    <ul className="flex flex-col divide-y divide-[var(--border-soft)]">
      {lignes.map(e => (
        <li key={e.libelle} className="flex items-center justify-between py-2 text-sm">
          <span className="text-[var(--text-muted)]">{e.libelle}</span>
          <span className="font-mono text-xs text-[var(--text)]">
            {new Date(e.date!).toLocaleDateString('fr-FR')}
            {e.libelle !== 'Course prévue le' && ` · ${new Date(e.date!).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Facture : total + état Pennylane (onglet Facturation). */
function EtatFacture({ delivery, extraLines }: { delivery: DeliveryRow; extraLines: DeliveryExtraLine[] }) {
  const recap = recapMontant({
    ht_cts: effectiveHtCts(delivery),
    tva_cts: delivery.tva_cts ?? null,
    ttc_cts: effectiveTtcCts(delivery),
    extraLines,
    autoliquidation: !!delivery.autoliquidation,
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-[var(--text-muted)]">Total TTC</span>
        <span className="font-mono text-2xl font-semibold text-[var(--text)]">
          {recap.ttc_total_cts != null ? formatMoney(recap.ttc_total_cts) : '—'}
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)] text-right -mt-1.5">
        HT <span className="font-mono">{recap.ht_cts ? formatMoney(recap.ht_cts + recap.extras_ht_cts) : '—'}</span>
        {' · '}{delivery.autoliquidation ? 'autoliquidation' : 'TVA'}{' '}
        <span className="font-mono">{formatMoney((recap.tva_cts ?? 0) + recap.extras_tva_cts)}</span>
      </p>
      <EtatPennylane delivery={delivery} />
    </div>
  )
}

function EtatPennylane({ delivery }: { delivery: DeliveryRow | null }) {
  if (!delivery) return null
  return (
    <>
      {delivery.pennylane_invoice_id && (
        <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-2.5
          flex items-center justify-between text-sm">
          <span className="text-[var(--text-muted)]">N° facture</span>
          {delivery.pennylane_invoice_number
            ? <span className="font-mono text-xs">{delivery.pennylane_invoice_number}</span>
            : <span className="text-xs text-[var(--text-muted)] italic">— (en attente de finalisation)</span>
          }
        </div>
      )}
      {delivery.sync_pending && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)]
          bg-[var(--warning)]/10 border border-[var(--warning)]/30 text-xs">
          <Badge color="warning">Sync en attente</Badge>
          <span className="text-[var(--text-muted)]">Pennylane sera synchronisé dès que possible.</span>
        </div>
      )}
      {delivery.sync_error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-[var(--r-md)]
          bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-xs">
          <Badge color="danger">Anomalie</Badge>
          <span className="text-[var(--text-muted)]">{delivery.sync_error}</span>
        </div>
      )}
    </>
  )
}

const textareaCls = `w-full px-3 py-2 rounded-[var(--r-md)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg-card))]
  border border-[var(--border)] text-[var(--text)] text-sm
  leading-relaxed resize-y focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

// ── Onglet Montant ────────────────────────────────────────────────────────────

function MontantTab({
  form, set, tvaTouched, onTvaChange, onTvaRateChange,
  selectedClient, tvaIntraClient, computed, delivery,
  extraLines, setExtraLines,
  isReadOnly, saving, onSave, onClose, integre = false, releve = false, onTtcChange,
}: {
  /** Saisie par le TTC (prix « tout compris » d'une plateforme) → HT et TVA déduits. */
  onTtcChange?: (ttcCts: number) => void
  /** Relevé de messagerie : le HT vient de « colis × prix au colis », pas de saisie. */
  releve?: boolean
  /** Dans le bloc « Exécution & prix » de la fiche : sans boutons ni état Pennylane. */
  integre?: boolean
  form: typeof EMPTY_FORM
  set: (k: keyof typeof EMPTY_FORM, v: string) => void
  tvaTouched: boolean
  onTvaChange: (v: string) => void
  onTvaRateChange: (r: number) => void
  selectedClient: ClientTariff | null
  /** Numéro de TVA intracommunautaire du client — condition de l'autoliquidation. */
  tvaIntraClient: string | null
  computed: ReturnType<typeof computeAmount>
  delivery?: DeliveryRow | null
  extraLines: DeliveryExtraLine[]
  setExtraLines: Dispatch<SetStateAction<DeliveryExtraLine[]>>
  isReadOnly: boolean
  saving: boolean
  onSave: () => void
  onClose: () => void
}) {
  const { can } = usePermissions()
  const [corrigerTva, setCorrigerTva] = useState(false)
  const isEdit    = delivery != null
  const canMontant = can('livraisons.livraisons', isEdit ? 'update' : 'create')
  const mode = selectedClient?.tariff_mode ?? 'manuel'

  // Valeurs à afficher : préfère computed (live), sinon valeurs stockées.
  // En autoliquidation : TVA 0 partout (principale ET lignes supp.), TTC = HT.
  const autoliq = !!form.autoliquidation
  const recap = useMemo(() => recapMontant({
    ht_cts:  computed?.amount_ht_cts  ?? (delivery ? effectiveHtCts(delivery)  : null),
    tva_cts: computed?.tva_cts         ?? delivery?.tva_cts                     ?? null,
    ttc_cts: computed?.amount_ttc_cts ?? (delivery ? effectiveTtcCts(delivery) : null),
    extraLines,
    autoliquidation: autoliq,
  }), [computed, delivery, extraLines, autoliq])
  const displayHt = recap.ht_cts

  return (
    <div className="flex flex-col gap-4">

      {/* Info tarif — inutile en saisie manuelle dans la fiche (le champ suffit). */}
      {selectedClient && !releve && !(integre && mode === 'manuel') && (
        <div className="rounded-[var(--r-md)] bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3
          text-sm text-[var(--text-muted)]">
          Tarif : <span className="font-medium text-[var(--text)]">
            {mode === 'forfait' && 'Forfait fixe'}
            {mode === 'km'      && 'Au kilomètre'}
            {mode === 'palette' && 'À la palette'}
            {mode === 'colis'   && 'Au colis (messagerie)'}
            {mode === 'manuel'  && 'Saisie manuelle'}
          </span>
          {selectedClient.tariff_rate_cts != null && mode !== 'manuel' && (
            <span className="ml-2 font-mono">
              ({formatMoney(selectedClient.tariff_rate_cts)}
              {mode === 'km' ? '/km' : mode === 'palette' ? '/palette' : ''})
            </span>
          )}
        </div>
      )}


      {/* Champs de saisie selon le mode tarifaire */}
      {selectedClient && !releve && mode === 'km' && (
        <Field label="Distance (km) *">
          <Input type="number" value={form.km} onChange={v => set('km', v)}
            placeholder="0" disabled={isReadOnly} />
        </Field>
      )}
      {/* PIEGE CONNU, non declenche a ce jour : ce champ ecrit dans
          `deliveries.weight_kg`, une colonne qui porte partout ailleurs un
          POIDS EN KILOGRAMMES — c'est ce que lit le plan de chargement du
          chauffeur. Un client en tarif « palette » y mettrait donc un nombre
          de palettes, affiche ensuite comme des kilos.
          Aucun client n'est en mode palette aujourd'hui (28 sur 28 en
          « manuel »), donc rien ne ment pour l'instant. Le jour ou l'un y
          passe, il faudra une colonne `pallets` distincte : deux sens dans une
          meme colonne finissent toujours par se croiser. */}
      {selectedClient && !releve && mode === 'palette' && (
        <Field label="Nombre de palettes *">
          <Input type="number" value={form.pallets} onChange={v => set('pallets', v)}
            placeholder="0" disabled={isReadOnly} />
        </Field>
      )}
      {/* Prix HT | taux de TVA | prix TTC : une seule ligne alignée. */}
      {(selectedClient || integre) && (
        <div className="flex flex-col gap-2">
          <div className={`grid gap-3 items-start ${
            [!releve && (mode === 'manuel' || mode === 'colis'), !form.autoliquidation, !!onTtcChange && !form.autoliquidation].filter(Boolean).length >= 3
              ? 'grid-cols-3' : [!releve && (mode === 'manuel' || mode === 'colis'), !form.autoliquidation].filter(Boolean).length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {!releve && (mode === 'manuel' || mode === 'colis') && (
              <Field label={integre ? 'Prix HT (€)' : 'Montant HT (€) *'}>
                <Input type="number" value={form.manual_ht} onChange={v => set('manual_ht', v)}
                  placeholder="0.00" disabled={isReadOnly} />
              </Field>
            )}
            {!form.autoliquidation && (
              <Field label="Taux de TVA">
                <TvaRateInput
                  value={parseFloat(form.tva_rate || '20')}
                  onChange={onTvaRateChange}
                  disabled={isReadOnly}
                />
              </Field>
            )}
            {onTtcChange && !form.autoliquidation && (
              <Field label="Prix TTC (€)">
                <ChampTtc ttcCts={computed?.amount_ttc_cts ?? null} onCommit={onTtcChange} disabled={isReadOnly} />
              </Field>
            )}
          </div>
          {!form.autoliquidation && ((tvaTouched || corrigerTva) ? (
            <Field label={`Montant de TVA (€)${tvaTouched ? ' — corrigé à la main' : ''}`}>
              <Input
                type="number"
                value={form.tva_override}
                onChange={onTvaChange}
                placeholder="0.00"
                disabled={isReadOnly}
              />
            </Field>
          ) : !isReadOnly && (
            <button type="button" onClick={() => setCorrigerTva(true)}
              className="self-start text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text)]">
              Corriger le montant de TVA
            </button>
          ))}
        </div>
      )}

      {/* AUTOLIQUIDATION — avant les champs de TVA, parce qu'elle les annule. */}
      {(selectedClient || integre) && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer w-fit"
            title="Prestation intracommunautaire B2B (art. 259-1 du CGI). La TVA n'est pas facturée : le TTC vaut le HT.">
            <input
              type="checkbox"
              checked={!!form.autoliquidation}
              onChange={e => set('autoliquidation', e.target.checked ? '1' : '')}
              disabled={isReadOnly}
              className="accent-[var(--brand)] w-4 h-4 shrink-0 cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">Autoliquidation (TVA due par le preneur)</span>
          </label>

          {/* Le régime suppose un preneur ASSUJETTI. Sans numéro de TVA
              intracommunautaire au dossier client, la facture est contestable —
              on le dit sans bloquer : le régime relève de celui qui facture,
              pas du logiciel. */}
          {!!form.autoliquidation && !tvaIntraClient?.trim() && (
            <p className="text-xs text-[var(--warning)]">
              Ce client n'a pas de numéro de TVA intracommunautaire renseigné. L'autoliquidation
              suppose un preneur assujetti — à vérifier avant d'émettre la facture.
            </p>
          )}

          {!!form.autoliquidation && (
            <p className="text-xs text-[var(--text-muted)]">
              Mention sur la facture : « Autoliquidation — TVA due par le preneur, art. 259-1 du CGI »
            </p>
          )}
        </div>
      )}

      {/* Taux TVA + montant TVA éditable — masqués en autoliquidation : afficher
          un taux modifiable sous une case qui l'annule ne peut que tromper. */}
      {/* Lignes supplémentaires — attente, retour à vide, forfait…                  */}
      {/* Toutes sont regroupées avec la ligne principale sur la même facture.      */}
      {(selectedClient || integre) && (
        <ExtraLinesEditor
          lines={extraLines}
          onChange={setExtraLines}
          defaultTvaRate={parseFloat(form.tva_rate || '20')}
          tauxForce={recap.taux_extras_force}
          disabled={isReadOnly}
        />
      )}

      {/* Récapitulatif : HT, TVA et TTC (suppléments compris), le TTC en grand. */}
      {displayHt != null && (
        <div className="flex flex-col gap-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--text)_4%,transparent)] px-4 py-3">
          <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
            <span>Montant HT{extraLines.length > 0 ? ` (dont ${extraLines.length} supplément${extraLines.length > 1 ? 's' : ''})` : ''}</span>
            <span className="font-mono text-[var(--text)]">{formatMoney(displayHt + recap.extras_ht_cts)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
            <span>{autoliq ? 'TVA (autoliquidation)' : 'TVA'}</span>
            <span className="font-mono text-[var(--text)]">
              {formatMoney((recap.tva_cts ?? 0) + recap.extras_tva_cts)}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1.5 mt-0.5 border-t border-[var(--border-soft)]">
            <span className="text-sm font-medium text-[var(--text)]">Total TTC</span>
            <span className="font-mono text-xl font-semibold text-[var(--text)]">
              {recap.ttc_total_cts != null ? formatMoney(recap.ttc_total_cts) : '—'}
            </span>
          </div>
        </div>
      )}

      {!integre && <EtatPennylane delivery={delivery ?? null} />}

      {!integre && (
        <div className="flex items-center gap-2 pt-3 border-t border-[var(--border)]">
          {!isReadOnly && canMontant && (
            <Button variant="primary" onClick={onSave} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {isReadOnly ? 'Fermer' : 'Annuler'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Onglet Suivi ──────────────────────────────────────────────────────────────

const STATUS_TIMELINE: string[] = ['planifiee', 'en_cours', 'livree', 'facturee', 'payee']

function SuiviTab({
  delivery, transitioning, onTransition, onRevenirALivree,
}: {
  delivery: DeliveryRow
  transitioning: DeliveryStatus | null
  onTransition: (to: DeliveryStatus) => void
  onRevenirALivree: () => Promise<void>
}) {
  const nextStatuses = allowedNextStatuses(delivery.statut)
  const actionLabels = TRANSITION_ACTION_LABELS[delivery.statut] ?? {}
  const currentIdx   = STATUS_TIMELINE.indexOf(delivery.statut)
  const [preview, setPreview] = useState(false)
  const canPreviewInvoice = nextStatuses.includes('facturee')
  const { can } = usePermissions()
  // Course « facturée » sans facture (ancien fonctionnement) : seule sortie
  // possible, hors machine à états — voir estFacturationBloquee.
  const bloquee = estFacturationBloquee(delivery) && can('livraisons.livraisons', 'update')
  const [confirmRetour, setConfirmRetour] = useState(false)
  const [retourEnCours, setRetourEnCours] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-start pt-1" aria-label="Suivi de la course">
        {STATUS_TIMELINE.map((s, i) => {
          const reached   = currentIdx >= 0 && i <= currentIdx
          const isCurrent = delivery.statut === s
          const date = s === 'facturee' ? delivery.invoiced_at : s === 'payee' ? delivery.paid_at : null
          return (
            <li key={s} className="relative flex-1 min-w-0 flex flex-col items-center gap-1.5 text-center">
              {i > 0 && (
                <span aria-hidden="true"
                  className={`absolute top-[0.6875rem] right-1/2 w-full h-0.5 ${reached ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} />
              )}
              <span className={`relative z-10 grid place-items-center h-6 w-6 rounded-full border-2 transition-colors
                ${isCurrent
                  ? 'bg-[var(--brand)] border-[var(--brand)] text-white ring-4 ring-[var(--brand)]/20'
                  : reached ? 'bg-[var(--brand)] border-[var(--brand)] text-white'
                  : 'bg-[var(--bg-card)] border-[var(--border-strong)] text-transparent'}`}>
                <Check size={13} strokeWidth={3} />
              </span>
              <span className={`text-xs font-medium truncate max-w-full ${reached ? 'text-[var(--text)]' : 'text-[var(--text-disabled)]'}`}>
                {STATUS_LABELS[s]}
              </span>
              {date && (
                <span className="text-[0.6875rem] text-[var(--text-muted)]">{new Date(date).toLocaleDateString('fr-FR')}</span>
              )}
            </li>
          )
        })}
        {delivery.statut === 'annulee' && (
          <li className="flex flex-col items-center gap-1.5 pl-3">
            <span className="h-6 w-6 rounded-full bg-[var(--danger)]" />
            <Badge color="danger">Annulée</Badge>
          </li>
        )}
      </ol>

      {/* Course bloquée : pas d'« Encaisser » sur une course sans facture —
          il faut d'abord la remettre à « Livrée » et la refacturer. */}
      {nextStatuses.length > 0 && !bloquee && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
          {canPreviewInvoice && (
            <Button variant="secondary" onClick={() => setPreview(true)} disabled={transitioning !== null}>
              Prévisualiser la facture
            </Button>
          )}
          {nextStatuses.map(to => {
            const label    = actionLabels[to] ?? STATUS_LABELS[to]
            const isCancel = to === 'annulee'
            const isActive = transitioning === to
            return (
              <Button key={to}
                variant={isCancel ? 'secondary' : 'primary'}
                onClick={() => onTransition(to)}
                disabled={transitioning !== null}
                className={isCancel ? 'text-[var(--danger)] border-[var(--danger)]/40' : ''}>
                {isActive ? '…' : label}
              </Button>
            )
          })}
        </div>
      )}

      {bloquee && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--warning)]">
            Cette course est marquée « Facturée » mais aucune facture n'existe chez Pennylane.
            Remettez-la à « Livrée », corrigez la cause affichée plus bas, puis refacturez.
          </p>
          <Button variant="secondary" onClick={() => setConfirmRetour(true)} disabled={transitioning !== null}>
            Revenir à livrée
          </Button>
          <ConfirmDialog
            open={confirmRetour}
            title="Revenir à « Livrée » ?"
            message="Aucune facture Pennylane n'est rattachée à cette course. Elle repasse à « Livrée » (date de facturation et anomalie effacées) et pourra être facturée à nouveau."
            confirmLabel="Revenir à livrée"
            cancelLabel="Ne rien changer"
            onConfirm={async () => {
              setRetourEnCours(true)
              await onRevenirALivree()
              setRetourEnCours(false)
              setConfirmRetour(false)
            }}
            onCancel={() => setConfirmRetour(false)}
            loading={retourEnCours}
          />
        </div>
      )}

      {/* Envoi email au client — livraison facturée/payée uniquement. */}
      {(delivery.statut === 'facturee' || delivery.statut === 'payee') && (
        <EnvoiClientSection delivery={delivery} />
      )}

      {/* Pas de bouton Fermer ici : Montant est fusionné juste en dessous et
          porte déjà le sien, en bas de l'onglet combiné. */}

      {/* Modale d'aperçu — le bouton "Facturer" dedans déclenche la transition. */}
      <ApercuFacture
        open={preview}
        rows={[delivery]}
        invoicing={transitioning === 'facturee'}
        onFacturer={() => { setPreview(false); onTransition('facturee') }}
        onClose={() => setPreview(false)}
      />
    </div>
  )
}

// ── Envoi email client (facture Pennylane) ───────────────────────────────
// Réutilisable drawer + liste. Confirmation affichant l'email destinataire,
// puis invocation de l'Edge send-client-email. Aucun changement de layout.

function EnvoiClientSection({ delivery }: { delivery: DeliveryRow }) {
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentAt, setSentAt]   = useState<string | null>(delivery.email_sent_at ?? null)
  const email = delivery.clients?.email?.trim() || ''

  const handleSend = async () => {
    setSending(true)
    const { data, error } = await sendClientEmail(delivery.id)
    setSending(false)
    if (error || !data?.ok) {
      toast(data?.error ?? error?.message ?? 'Envoi échoué', 'error')
      return
    }
    setConfirm(false)
    setSentAt(new Date().toISOString())
    toast('Email envoyé')
  }

  return (
    <div className="pt-3 border-t border-[var(--border)] flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setConfirm(true)} disabled={!email}>
          <Mail size={14} />
          Envoyer au client
        </Button>
        {sentAt && (
          <span className="text-xs text-[var(--text-muted)]">
            Envoyée le {new Date(sentAt).toLocaleDateString('fr-FR')}
          </span>
        )}
      </div>
      {!email && (
        <span className="text-xs text-[var(--text-muted)]">
          Aucun email client — complète la fiche client pour activer l'envoi.
        </span>
      )}

      <ConfirmDialog
        open={confirm}
        title="Envoyer la facture au client ?"
        message={`La facture Pennylane sera envoyée à ${email}.`}
        confirmLabel="Envoyer"
        onConfirm={handleSend}
        onCancel={() => setConfirm(false)}
        loading={sending}
      />
    </div>
  )
}

// ── Onglet POD ────────────────────────────────────────────────────────────────

function PodTab({
  delivery,
  companyId,
  onSaved,
}: {
  delivery: DeliveryRow | null
  companyId: string | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const isReadOnly = delivery?.statut === 'annulee'

  // Valeurs POD — tracking local pour refléter l'enregistrement sans attendre un rechargement complet
  const [capturedAt, setCapturedAt]         = useState(delivery?.pod_captured_at ?? null)
  const [recipientSaved, setRecipientSaved] = useState(delivery?.pod_recipient_name ?? '')

  // Formulaire
  const [recipient, setRecipient] = useState(delivery?.pod_recipient_name ?? '')

  // Photo courante (depuis DB ou juste uploadée)
  const [photoDoc, setPhotoDoc]   = useState<DocumentRow | null>(null)
  const [photoUrl, setPhotoUrl]   = useState<string | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState(false)

  // Opérations async
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)

  // « Aucun justificatif requis » — état local pour un retour immédiat, la
  // valeur de référence restant celle de la base après rechargement.
  const [nonRequis, setNonRequis] = useState(delivery?.justif_non_requis ?? false)
  const [savingNonRequis, setSavingNonRequis] = useState(false)

  async function handleToggleNonRequis(coche: boolean) {
    if (!delivery) return
    setNonRequis(coche)          // optimiste
    setSavingNonRequis(true)
    const { error } = await updateDelivery(delivery.id, { justif_non_requis: coche })
    setSavingNonRequis(false)
    if (error) {
      setNonRequis(!coche)       // rollback : ne jamais laisser l'écran mentir
      toast(error.message, 'error')
      return
    }
    toast(coche ? 'Livraison retirée de l’alerte' : 'Livraison remise dans l’alerte')
    onSaved()
  }

  // Charge la photo POD la plus récente pour cette livraison
  useEffect(() => {
    if (!delivery) return
    setLoadingPhoto(true)
    listDocuments({ entity_type: 'delivery', entity_id: delivery.id, category: 'POD' })
      .then(async ({ data }) => {
        const latest = (data as DocumentRow[])?.[0] ?? null
        setPhotoDoc(latest)
        if (latest) {
          const url = await getDownloadUrl(latest)
          setPhotoUrl(url)
        } else {
          setPhotoUrl(null)
        }
      })
      .finally(() => setLoadingPhoto(false))
  }, [delivery?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !companyId || !delivery) return
    if (!file.type.startsWith('image/')) {
      toast('Seules les images sont acceptées pour la photo POD', 'error')
      return
    }
    setUploading(true)
    const { data, error } = await uploadDocument(file, companyId, {
      entity_type: 'delivery',
      entity_id:   delivery.id,
      category:    'POD',
    })
    setUploading(false)
    if (error) { toast(error.message, 'error'); return }
    if (data) {
      setPhotoDoc(data)
      const url = await getDownloadUrl(data)
      setPhotoUrl(url)
      toast('Photo ajoutée')
    }
  }

  const handleSave = async () => {
    if (!delivery) return
    if (!photoDoc)           { toast('Ajoutez d\'abord une photo de preuve', 'error'); return }
    if (!recipient.trim())   { toast('Le nom du réceptionnaire est requis', 'error'); return }
    setSaving(true)
    const { error } = await savePod(delivery.id, recipient.trim())
    setSaving(false)
    if (error) { toast((error as Error).message, 'error'); return }
    const now = new Date().toISOString()
    setCapturedAt(now)
    setRecipientSaved(recipient.trim())
    toast('Preuve de livraison enregistrée')
    onSaved()
  }

  if (!delivery) {
    return (
      <p className="text-sm text-[var(--text-muted)] italic py-4 text-center">
        Enregistre d'abord la livraison pour y rattacher une preuve.
      </p>
    )
  }

  const isCaptured = !!capturedAt

  const photoBlock = loadingPhoto ? (
    <div className="flex items-center justify-center py-6">
      <Loader2 size={20} className="animate-spin text-[var(--text-disabled)]" />
    </div>
  ) : photoUrl ? (
    <button type="button" onClick={() => ouvrirDocument(photoUrl, { titre: 'Preuve de livraison', type: 'image' })}
      className="block w-full text-left rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]
        hover:border-[var(--brand)] transition-colors">
      <img src={photoUrl} alt="Photo POD"
        className="w-full max-h-64 object-contain bg-[var(--bg-elevated)]" />
      <p className="px-3 py-1.5 text-xs text-[var(--text-muted)] text-center">
        Cliquer pour ouvrir en grand
      </p>
    </button>
  ) : (
    <p className="text-sm text-[var(--text-muted)] italic">Aucune photo trouvée</p>
  )

  if (isCaptured) {
    return (
      <div className="flex flex-col gap-4">
        {/* Bandeau succès */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)]
          bg-[var(--success)]/10 border border-[var(--success)]/30 text-sm">
          <span className="text-[var(--success)] font-semibold">✓</span>
          <span className="text-[var(--text)]">Preuve de livraison enregistrée</span>
        </div>

        {/* Méta */}
        <div className="flex flex-col gap-2 rounded-[var(--r-md)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg-card))] border border-[var(--border)] p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-muted)]">Réceptionnaire</span>
            <span className="font-medium text-[var(--text)]">{recipientSaved}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-muted)]">Horodatage</span>
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {new Date(capturedAt!).toLocaleString('fr-FR')}
            </span>
          </div>
        </div>

        {/* Photo */}
        {photoBlock}

        {/* Remplacement de la photo */}
        {!isReadOnly && (
          <div className="pt-2 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-muted)] mb-2">
              Remplacer la photo :
            </p>
            <input
              ref={fileRef}
              id="pod-file-replace"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            <label htmlFor="pod-file-replace"
              className={`inline-flex items-center gap-2 h-8 px-3 rounded-[var(--r-md)]
                border border-[var(--border)] bg-[var(--bg-elevated)] text-xs
                text-[var(--text-muted)] cursor-pointer
                hover:border-[var(--brand)] hover:text-[var(--brand)] transition-colors
                ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading
                ? <Loader2 size={12} className="animate-spin" />
                : <Camera size={12} />}
              {uploading ? 'Upload…' : 'Nouvelle photo'}
            </label>
          </div>
        )}
      </div>
    )
  }

  // ── Formulaire de capture ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nom du réceptionnaire">
        <input
          type="text"
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder="Prénom Nom du signataire"
          disabled={isReadOnly}
          className={inputCls}
        />
      </Field>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[var(--text-muted)]">
          Photo de preuve
        </label>
        <input
          ref={fileRef}
          id="pod-file-add"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading || isReadOnly}
          className="hidden"
        />
        <label htmlFor="pod-file-add"
          className={`flex items-center gap-2 h-9 px-3 rounded-[var(--r-md)]
            border border-[var(--border)] bg-[color-mix(in_srgb,var(--text)_5%,var(--bg-card))] text-sm
            text-[var(--text-muted)] cursor-pointer hover:border-[var(--brand)] transition-colors
            ${(uploading || isReadOnly) ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading
            ? <Loader2 size={14} className="animate-spin" />
            : <Camera size={14} />}
          {uploading
            ? 'Upload en cours…'
            : photoDoc ? 'Remplacer la photo' : 'Ajouter la photo de preuve'}
        </label>

        {/* Aperçu après upload */}
        {photoUrl && !loadingPhoto && (
          <div className="mt-2 rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]">
            <img src={photoUrl} alt="Aperçu POD"
              className="w-full max-h-48 object-contain bg-[var(--bg-elevated)]" />
          </div>
        )}
      </div>

      {isReadOnly ? (
        <p className="text-sm text-[var(--text-muted)] italic">
          La livraison est annulée — la preuve n'est pas modifiable.
        </p>
      ) : (
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving || !photoDoc || !recipient.trim()}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer la preuve'}
        </Button>
      )}

      {/* Échappatoire à l'alerte : certaines courses n'appellent aucun
          justificatif. Sans cette case, l'alerte reste allumée indéfiniment et
          finit par être ignorée en bloc — ce qui lui fait rater les vrais oublis. */}
      {!isReadOnly && delivery && (
        <label className="flex items-start gap-2 pt-3 border-t border-[var(--border)]
          text-sm text-[var(--text)] cursor-pointer">
          <input
            type="checkbox"
            checked={nonRequis}
            onChange={e => handleToggleNonRequis(e.target.checked)}
            disabled={savingNonRequis}
            className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
          />
          <span>
            Aucun justificatif requis pour cette course
            <span className="block text-xs text-[var(--text-muted)]">
              Retire cette livraison de l'alerte « sans justificatif ».
            </span>
          </span>
        </label>
      )}
    </div>
  )
}

// ── Sous-composants ───────────────────────────────────────────────────────────

const inputCls = 'field'
function Input({
  type = 'text', value, onChange, placeholder, disabled, min, step,
}: {
  type?: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean
  min?: number | string; step?: number | string
}) {
  return (
    <input type={type} value={value} placeholder={placeholder} disabled={disabled}
      min={min} step={step}
      onChange={e => onChange(e.target.value)} className={inputCls} />
  )
}

/** TTC saisissable : texte libre pendant la frappe, appliqué à la sortie du champ. */
function ChampTtc({ ttcCts, onCommit, disabled }: { ttcCts: number | null; onCommit: (cts: number) => void; disabled?: boolean }) {
  const affiche = ttcCts != null && ttcCts > 0 ? (ttcCts / 100).toFixed(2) : ''
  const [brut, setBrut] = useState<string | null>(null)
  return (
    <input type="text" inputMode="decimal" className="field" disabled={disabled}
      value={brut ?? affiche} placeholder="0.00"
      onChange={e => { if (/^[0-9]*[.,]?[0-9]*$/.test(e.target.value)) setBrut(e.target.value) }}
      onBlur={() => {
        if (brut != null) {
          const n = parseFloat(brut.replace(',', '.'))
          if (Number.isFinite(n) && n > 0) onCommit(Math.round(n * 100))
        }
        setBrut(null)
      }} />
  )
}
