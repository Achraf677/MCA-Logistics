import { useState, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Trash2, Loader2, Camera, Plus, X, Mail, Copy, RefreshCw, Search, Zap, AlertTriangle, MapPin } from 'lucide-react'
import { DocumentsPanel } from '../../shared/ui/DocumentsPanel'
import { LettreVoitureTab } from './LettreVoitureTab'
import { ApercuFacture } from './ApercuFacture'
import { uploadDocument, listDocuments, getDownloadUrl } from '../../shared/lib/documents.queries'
// Regle unique « sans justificatif » — la meme que l'alerte de la cloche.
import { isLivraisonSansJustif } from '../../shared/lib/livraisonsSansJustif'
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
import { formatMoney, addTva, centimesToEuros } from '../../shared/lib/money'
import { TvaRateInput } from '../../shared/ui/TvaRateInput'
import { autoliquidationParDefaut } from '../../shared/lib/pays'
import { lireSupplements, SUPPLEMENTS_USUELS } from '../../shared/lib/supplements'
import type { Supplement } from '../../shared/lib/supplements'
import {
  STATUS_LABELS, STATUS_COLORS,
  TRANSITION_ACTION_LABELS, libelleDelaiPaiement,
  allowedNextStatuses,
  computeAmount,
  effectiveHtCts, effectiveTtcCts,
  tauxTvaInitial, montantsAEcrire, recapMontant, estFacturationBloquee,
  isoLocal, trajet, PRESTATIONS, PRESTATION_LABELS, PRESTATION_AIDES, blocsPrestation,
  heureSaisie, libelleCreneau, libelleDuree, manquesFiche,
  moisDe, finDeMois, libelleMois, resumeMessagerie,
} from './livraisons.logic'
import type { ClientTariff, Prestation } from './livraisons.logic'
import {
  createDelivery, updateDelivery, transitionDelivery, deleteDelivery,
  getActiveClients, getActiveVehicles, getActiveDrivers, savePod,
  listDeliveryTemplates, createDeliveryTemplate, sendClientEmail,
  getClientLookup, revenirALivree,
} from './livraisons.queries'
import type { DeliveryTemplateLite } from './livraisons.queries'
import type { DeliveryExtraLine, DeliveryRow, DeliveryStatus } from './livraisons.types'

// ── Types locaux ──────────────────────────────────────────────────────────────

/**
 * 3 onglets en modification : la course (tout ce qui se saisit, prix compris),
 * les preuves (photo, lettre de voiture, fichiers) et la facturation (suivi).
 * Les anciennes clés ('documents', 'pod', 'lv') restent acceptées en entrée.
 */
type Tab = 'detail' | 'preuves' | 'montant'
type SousPreuve = 'pod' | 'lv' | 'fichiers'
type TabDemande = Tab | 'documents' | 'pod' | 'lv'

interface Props {
  open: boolean
  onClose: () => void
  delivery?: DeliveryRow | null
  onSaved: () => void
  /** Onglet pré-sélectionné à l'ouverture (ex 'lv' depuis la liste Bons de livraison). Défaut 'detail'. */
  initialTab?: TabDemande
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
  // Arrêts : qui remet / qui reçoit (colonnes de la lettre de voiture).
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
}
type Form = typeof EMPTY_FORM

/**
 * Champs que l'onglet « Lettre de voiture » écrit AUSSI, de son côté. Ils ne
 * sont renvoyés à l'enregistrement de la fiche que s'ils ont été modifiés ici :
 * sinon une saisie faite dans la LV serait écrasée par la valeur chargée à
 * l'ouverture.
 */
const CHAMPS_PARTAGES_LV = [
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
  }
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function DrawerLivraison({ open, onClose, delivery: deliveryProp, onSaved, initialTab = 'detail' }: Props) {
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
  const [sousPreuve, setSousPreuve] = useState<SousPreuve>('pod')
  const [form, setForm]         = useState<Form>(EMPTY_FORM)
  /** Valeurs à l'ouverture : seuls les champs partagés avec la LV modifiés ici sont réécrits. */
  const formInitial = useRef<Form>(EMPTY_FORM)
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

  // Modèles de course — chargés uniquement en CRÉATION (pré-remplissage).
  const [templates, setTemplates]     = useState<DeliveryTemplateLite[]>([])
  const [templateId, setTemplateId]   = useState('')

  // « Enregistrer comme modèle » — champ inline (libellé) + état de création.
  const [saveAsTplOpen, setSaveAsTplOpen] = useState(false)
  const [tplLabel, setTplLabel]           = useState('')
  const [savingTpl, setSavingTpl]         = useState(false)

  // ── Référentiels ─────────────────────────────────────────────────────────────

  // Client de la course courante : s'il est INACTIF, il n'est pas dans la
  // liste des actifs — sans lui, `computed` restait nul et l'enregistrement
  // effaçait les montants. On le charge à part et on l'ajoute à la liste.
  const clientCourantId = deliveryProp?.client_id ?? null
  useEffect(() => {
    if (!open) return
    let annule = false
    ;(async () => {
      const { data } = await getActiveClients()
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

  // ── Modèles de course (création uniquement) ────────────────────────────────────

  useEffect(() => {
    if (!open || delivery) { setTemplates([]); return }
    setTemplateId('')
    listDeliveryTemplates().then(({ data }) => setTemplates(data ?? []))
  }, [open, delivery])

  // Pré-remplit le formulaire depuis un modèle, sans toucher à la date ni au statut.
  // PIÈGE TVA : le modèle stocke un TAUX (tva_rate, en %) ; le form attend un MONTANT
  // de TVA en euros (tva_override). On convertit, puis setTvaTouched(true) pour figer.
  const applyTemplate = (id: string) => {
    setTemplateId(id)
    if (!id) return
    const t = templates.find(x => x.id === id)
    if (!t) return
    const tvaCts = t.amount_ht_cts != null && t.tva_rate != null
      ? Math.round(t.amount_ht_cts * t.tva_rate / 100)
      : null
    setForm(p => ({
      ...p,
      client_id:        t.client_id ?? '',
      vehicle_id:       t.vehicle_id ?? '',
      driver_id:        t.driver_id ?? '',
      description:      t.description ?? '',
      pickup_address:   t.pickup_address ?? '',
      delivery_address: t.delivery_address ?? '',
      km:               t.km != null ? String(t.km) : '',
      empty_km:         t.empty_km != null ? String(t.empty_km) : '',
      pallets:          t.weight_kg != null ? String(t.weight_kg) : '',
      manual_ht:        t.amount_ht_cts != null ? String(centimesToEuros(t.amount_ht_cts)) : '',
      tva_override:     tvaCts != null ? String(centimesToEuros(tvaCts)) : '',
    }))
    setTvaTouched(true)
  }

  // Crée un modèle (delivery_templates) depuis les champs ACTUELS du form.
  // PIÈGE TVA (inverse) : le form porte tva_override = MONTANT TVA (€) et manual_ht = HT (€) ;
  // le modèle veut tva_rate = TAUX en %. On déduit le taux brut puis on le SNAPPE au taux légal.
  const handleSaveAsTemplate = async () => {
    const label = tplLabel.trim()
    if (!label) { toast('Le libellé du modèle est requis', 'error'); return }
    if (!companyId) { toast('Profil non chargé', 'error'); return }

    const rawRate = (form.tva_override && parseFloat(form.manual_ht) > 0)
      ? parseFloat(form.tva_override) / parseFloat(form.manual_ht) * 100 : 20
    const tva_rate = Math.round(rawRate * 100) / 100

    setSavingTpl(true)
    const { error } = await createDeliveryTemplate({
      company_id:       companyId,
      label,
      client_id:        form.client_id || null,
      description:      form.description || null,
      pickup_address:   form.pickup_address || null,
      delivery_address: form.delivery_address || null,
      amount_ht_cts:    form.manual_ht ? Math.round(parseFloat(form.manual_ht) * 100) : null,
      tva_rate,
      type:             deliveryProp?.type ?? null,
      weight_kg:        form.pallets  ? Number(form.pallets)  : null,
      km:               form.km       ? Number(form.km)       : null,
      empty_km:         form.empty_km ? Number(form.empty_km) : null,
      vehicle_id:       form.vehicle_id || null,
      driver_id:        form.driver_id || null,
    })
    setSavingTpl(false)
    if (error) { toast((error as Error).message ?? 'Erreur', 'error'); return }
    toast(`Modèle « ${label} » enregistré`)
    setSaveAsTplOpen(false)
    setTplLabel('')
  }

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
      trajetCle.current = `${f.pickup_address.trim()}|${f.delivery_address.trim()}`
      setDeliveryCoords({ lat: deliveryProp.delivery_lat ?? null, lng: deliveryProp.delivery_lng ?? null })
      setExtraLines(Array.isArray(deliveryProp.extra_lines) ? deliveryProp.extra_lines : [])
    } else {
      const f = { ...EMPTY_FORM, date: aujourdhui() }
      setForm(f)
      formInitial.current = f
      trajetCle.current = '|'
      setDeliveryCoords({ lat: null, lng: null })
      setExtraLines([])
    }
    setCalcError(null)
    // Même lot de rendu que setForm : le recalcul auto de la TVA sait ainsi
    // si le formulaire affiché est déjà celui de CETTE course.
    setFormPour(deliveryProp?.id ?? 'nouvelle')
    setSaveAsTplOpen(false)
    setTplLabel('')
    const demande: TabDemande = initialTab
    if (demande === 'lv' || demande === 'pod' || demande === 'documents') {
      setTab('preuves')
      setSousPreuve(demande === 'documents' ? 'fichiers' : demande)
    } else {
      setTab(demande)
      setSousPreuve('pod')
    }
  }, [deliveryProp, open, initialTab])

  const set = (k: keyof Form, v: string) => setForm(p => ({ ...p, [k]: v }))

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
    setForm(p => ({ ...p, date: aujourdhui(), reference_client: '' }))
    formInitial.current = EMPTY_FORM
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
    if (!selectedClient) return null
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
      selectedClient.tariff_mode === 'colis' ? { tariff_mode: 'manuel', tariff_rate_cts: null } : selectedClient,
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
    if (tvaTouched || !selectedClient) return
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

      // Champs partagés avec l'onglet Lettre de voiture : seulement s'ils ont
      // bougé ici (voir CHAMPS_PARTAGES_LV).
      const partages: Record<string, string | number | null> = {}
      for (const k of CHAMPS_PARTAGES_LV) {
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
        weight_kg:        nombreOuNull(form.pallets),
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
          statut:      blocs.releve ? 'livree' : 'planifiee',
          ...(blocs.releve ? { delivered_at: new Date().toISOString(), justif_non_requis: true } : {}),
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
          <Badge color="muted">{PRESTATION_LABELS[prestation]}</Badge>
          {delivery!.urgent && <Badge color="danger">Urgent</Badge>}
          <span className="text-sm text-[var(--text)]">
            {blocs.releve
              ? `${libelleMois(delivery!.date)} · ${resumeMessagerie(delivery!.nb_colis, delivery!.prix_unitaire_cts) ?? ''}`
              : trajet(delivery!.pickup_address, delivery!.delivery_address).court}
          </span>
          {delivery!.reference_client && (
            <span className="text-xs text-[var(--text-muted)]">Réf. {delivery!.reference_client}</span>
          )}
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
          {/* Pré-remplissage depuis un modèle — création uniquement, masqué si aucun modèle. */}
          {!isEdit && templates.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)] shrink-0">Partir d'un modèle</span>
              <select value={templateId} onChange={e => applyTemplate(e.target.value)} className={`${inputCls} max-w-[20rem]`}>
                <option value="">— Aucun —</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {/* Colonne 1 : l'ordre et les arrêts */}
            <div className="flex flex-col gap-4 min-w-0">
              <Bloc titre="Ordre">
                <Field label="Prestation">
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Prestation">
                    {PRESTATIONS.map(p => (
                      <button key={p} type="button" role="radio" aria-checked={prestation === p}
                        disabled={ro}
                        onClick={() => choisirPrestation(p)}
                        title={PRESTATION_AIDES[p]}
                        className={`h-8 px-3 rounded-[var(--r-pill)] border text-xs transition-colors disabled:opacity-60
                          ${prestation === p
                            ? 'bg-[var(--brand)] border-[var(--brand)] text-white font-medium'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--text)]'}`}>
                        {PRESTATION_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">{PRESTATION_AIDES[prestation]}</span>
                </Field>

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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={selectedClient?.reference_obligatoire ? 'Référence client *' : 'Référence client'}>
                    <Input value={form.reference_client} onChange={v => set('reference_client', v)}
                      placeholder="ODT, n° de commande…" disabled={ro} />
                  </Field>
                  {blocs.releve ? (
                    <Field label="Mois relevé *">
                      <Input type="month" value={moisDe(form.date)} disabled={ro}
                        onChange={v => v && set('date', finDeMois(v))} />
                    </Field>
                  ) : (
                  <Field label="Date *" error={tenteEnregistrer && !form.date ? 'La date est requise' : undefined}>
                    <div className="flex gap-2">
                      <Input type="date" value={form.date} onChange={v => set('date', v)} disabled={ro} />
                      <button type="button" disabled={ro}
                        onClick={() => set('urgent', form.urgent ? '' : '1')}
                        aria-pressed={!!form.urgent}
                        title="Course urgente"
                        className={`shrink-0 h-[calc(36rem/14)] px-2.5 rounded-[var(--r-md)] border text-xs flex items-center gap-1 transition-colors disabled:opacity-60
                          ${form.urgent
                            ? 'bg-[var(--danger)]/15 border-[var(--danger)] text-[var(--danger)] font-medium'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                        <Zap size={13} /> Urgent
                      </button>
                    </div>
                  </Field>
                  )}
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
                  <div className="flex items-baseline justify-between gap-3 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)] px-3 py-2">
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

              {blocs.retrait && (
                <Bloc titre="Retrait">
                  <AddressAutocomplete
                    value={form.pickup_address}
                    placeholder="Rue, ville… (vide = départ du dépôt)"
                    disabled={ro}
                    onChange={v => set('pickup_address', v)}
                    onSelect={s => set('pickup_address', s.address)}
                  />
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
                  {form.delivery_address.trim() && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <MapPin size={12} />
                      {deliveryCoords.lat != null ? 'Adresse localisée' : 'Sera localisée à l’enregistrement'}
                    </span>
                  )}
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

              {blocs.retrait && (
                <div className="flex flex-wrap items-center gap-3 px-1">
                  <span className="text-xs uppercase tracking-wide font-medium text-[var(--text-muted)]">Trajet</span>
                  {calcLoading
                    ? <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />
                    : <span className="text-sm text-[var(--text)]">{trajetTxt || '—'}</span>}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-[var(--text-muted)]">km</span>
                    <div className="w-[5.5rem]">
                      <Input type="number" value={form.km} onChange={v => { set('km', v); setCalcError(null) }}
                        placeholder="0" disabled={ro} />
                    </div>
                    {!ro && (
                      <BoutonIcone icone={RefreshCw} libelle="Recalculer le trajet (IGN)" taille="sm"
                        disabled={calcLoading}
                        onClick={() => calculerTrajet(form.pickup_address.trim(), form.delivery_address.trim(), false)} />
                    )}
                  </div>
                  {calcError && <span className="basis-full text-xs text-[var(--warning)]">{calcError}</span>}
                </div>
              )}
            </div>

            {/* Colonne 2 : marchandise, exécution & prix, consignes */}
            <div className="flex flex-col gap-4 min-w-0">
              {blocs.marchandise && (
                <Bloc titre="Marchandise">
                  <Field label="Nature">
                    <Input value={form.marchandise_desc} onChange={v => set('marchandise_desc', v)}
                      placeholder="Colis, palette, meuble, documents…" disabled={ro} />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
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

              <Bloc titre={blocs.releve ? 'Facture' : 'Exécution & prix'}>
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
                <Field label="Libellé de facture">
                  <Input value={form.description} onChange={v => set('description', v)}
                    placeholder={blocs.releve
                      ? `Vide = « Messagerie ${form.date ? libelleMois(form.date) : '…'} — colis livrés »`
                      : `Vide = « Livraison du ${form.date ? new Date(`${form.date}T00:00:00`).toLocaleDateString('fr-FR') : '…'} »`}
                    disabled={ro} />
                  {form.reference_client.trim() && (
                    <span className="text-xs text-[var(--text-muted)]">La référence client est ajoutée sur la facture.</span>
                  )}
                </Field>
                <MontantTab
                  integre
                  releve={blocs.releve}
                  catalogue={selectedClient?.supplements ?? []}
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
              </Bloc>

              <Bloc titre={blocs.releve ? 'Note' : 'Consignes'}>
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
            </div>
          </div>

          {/* Ce qui manque, par étape : n'empêche pas d'enregistrer (sauf client / date). */}
          {!ro && (manques.partir.length + manques.lv.length + manques.facturer.length) > 0 && (
            <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 flex flex-col gap-1 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                <AlertTriangle size={13} className="text-[var(--warning)]" /> Il manque
              </span>
              {manques.partir.length > 0 && <Manque etape="pour partir" liste={manques.partir} />}
              {manques.lv.length > 0 && <Manque etape="pour la lettre de voiture" liste={manques.lv} />}
              {manques.facturer.length > 0 && <Manque etape="pour facturer" liste={manques.facturer} />}
            </div>
          )}

          {/* Enregistrer comme modèle (déplié à la demande). */}
          {saveAsTplOpen && (
            <div className="flex flex-wrap items-end gap-2 rounded-[var(--r-md)] border border-[var(--border)] p-3">
              <div className="flex-1 min-w-[12rem]">
                <Field label="Libellé du modèle *">
                  <Input value={tplLabel} onChange={setTplLabel} placeholder="Nom du modèle…" />
                </Field>
              </div>
              <Button variant="primary" onClick={handleSaveAsTemplate} disabled={savingTpl}>
                {savingTpl ? 'Création…' : 'Créer le modèle'}
              </Button>
              <Button variant="secondary" onClick={() => { setSaveAsTplOpen(false); setTplLabel('') }} disabled={savingTpl}>
                Annuler
              </Button>
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
            <span className="ml-auto flex items-center gap-2">
              {canSave && !saveAsTplOpen && (
                <BoutonIcone icone={Plus} libelle="Enregistrer comme modèle" onClick={() => setSaveAsTplOpen(true)} />
              )}
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
          <div className="flex gap-1.5">
            {([['pod', 'Preuve de livraison'], ['lv', 'Lettre de voiture'], ['fichiers', 'Fichiers']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setSousPreuve(k)}
                className={`h-8 px-3 rounded-[var(--r-pill)] border text-xs transition-colors
                  ${sousPreuve === k
                    ? 'bg-[var(--brand)] border-[var(--brand)] text-white font-medium'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="max-w-[48rem]">
            {sousPreuve === 'pod' && (
              <PodTab delivery={delivery ?? null} companyId={companyId} onSaved={onSaved} />
            )}
            {sousPreuve === 'lv' && (
              <LettreVoitureTab delivery={delivery ?? null} companyId={companyId} onSaved={onSaved} />
            )}
            {sousPreuve === 'fichiers' && (
              <DocumentsPanel entityType="delivery" entityId={delivery?.id ?? null} />
            )}
          </div>
        </div>
      )}

      {/* ── Onglet Facturation : suivi, facture, envoi ──────────────────────── */}
      {tab === 'montant' && delivery && (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <SuiviTab
            delivery={delivery}
            transitioning={transitioning}
            onTransition={handleTransition}
            onRevenirALivree={handleRevenirALivree}
          />
          <EtatFacture delivery={delivery} extraLines={extraLines} />
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
        message={"Cette course n'a ni photo, ni POD signé, ni lettre de voiture archivée. "
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

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] p-3.5 flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{titre}</h3>
      {children}
    </section>
  )
}

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
  const resume = libelleCreneau(debut, fin)
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
      {invalide
        ? <span className="text-xs text-[var(--danger)]">La fin du créneau est avant son début.</span>
        : resume && <span className="text-xs text-[var(--text-muted)]">Créneau : {resume}</span>}
    </div>
  )
}

/**
 * Choix du client avec RECHERCHE : la liste déroulante de 30+ noms ne se
 * parcourait qu'à l'œil. Liste dans le flux (pas en position absolue) : le
 * tiroir défile, une liste flottante y serait rognée.
 */
function ChoixClient({ clients, value, onChange, disabled }: {
  clients: Array<{ id: string; label: string }>
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const choisi = clients.find(c => c.id === value) ?? null
  const [ouvert, setOuvert] = useState(false)
  const [q, setQ] = useState('')
  const filtres = useMemo(() => {
    const t = q.trim().toLowerCase()
    const tries = [...clients].sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    return t ? tries.filter(c => c.label.toLowerCase().includes(t)) : tries
  }, [clients, q])

  if (!ouvert) {
    return (
      <button type="button" disabled={disabled}
        onClick={() => { setQ(''); setOuvert(true) }}
        className={`${inputCls} text-left flex items-center justify-between gap-2 disabled:opacity-60`}>
        <span className={choisi ? 'text-[var(--text)] truncate' : 'text-[var(--text-disabled)]'}>
          {choisi?.label ?? 'Choisir un client…'}
        </span>
        <Search size={14} className="text-[var(--text-muted)] shrink-0" />
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un client…"
        className={inputCls}
        onKeyDown={e => {
          if (e.key === 'Escape') setOuvert(false)
          if (e.key === 'Enter' && filtres[0]) { e.preventDefault(); onChange(filtres[0].id); setOuvert(false) }
        }} />
      <ul className="max-h-[14rem] overflow-y-auto rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--bg)]">
        {filtres.length === 0 && <li className="px-3 py-2 text-xs text-[var(--text-muted)]">Aucun client</li>}
        {filtres.map(c => (
          <li key={c.id}>
            <button type="button" onClick={() => { onChange(c.id); setOuvert(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--bg-card-hover)]
                ${c.id === value ? 'text-[var(--brand)] font-medium' : 'text-[var(--text)]'}`}>
              {c.label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOuvert(false)} className="self-start text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
        Fermer la liste
      </button>
    </div>
  )
}

/** Facture : récapitulatif des montants + état Pennylane (onglet Facturation). */
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
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
        <InfoRow label="Prix HT"><span className="font-mono">{recap.ht_cts ? formatMoney(recap.ht_cts) : '—'}</span></InfoRow>
        {extraLines.length > 0 && (
          <InfoRow label={`Suppléments (${extraLines.length}) — HT`}><span className="font-mono">{formatMoney(recap.extras_ht_cts)}</span></InfoRow>
        )}
        <InfoRow label={delivery.autoliquidation ? 'TVA (autoliquidation)' : 'TVA'}>
          <span className="font-mono">{formatMoney((recap.tva_cts ?? 0) + recap.extras_tva_cts)}</span>
        </InfoRow>
        <InfoRow label="Total TTC">
          <span className="font-mono font-semibold text-[var(--text)]">
            {recap.ttc_total_cts != null ? formatMoney(recap.ttc_total_cts) : '—'}
          </span>
        </InfoRow>
      </div>
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

const textareaCls = `w-full px-3 py-2 rounded-[var(--r-md)] bg-[var(--bg)]
  border border-[var(--border)] text-[var(--text)] text-sm
  leading-relaxed resize-y focus:outline-none focus:border-[var(--brand)]
  transition-colors disabled:opacity-50 disabled:cursor-not-allowed`

// ── Onglet Montant ────────────────────────────────────────────────────────────

function MontantTab({
  form, set, tvaTouched, onTvaChange, onTvaRateChange,
  selectedClient, tvaIntraClient, computed, delivery,
  extraLines, setExtraLines,
  isReadOnly, saving, onSave, onClose, integre = false, releve = false, catalogue = [],
}: {
  /** Suppléments du client (fiche client), ajoutés en un clic. */
  catalogue?: Supplement[]
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

      {!selectedClient && (
        <p className="text-sm text-[var(--text-muted)] italic">
          Choisissez d'abord le client : le prix suit son tarif.
        </p>
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
      {selectedClient && !releve && (mode === 'manuel' || mode === 'colis') && (
        <Field label={integre ? 'Prix HT (€)' : 'Montant HT (€) *'}>
          <Input type="number" value={form.manual_ht} onChange={v => set('manual_ht', v)}
            placeholder="0.00" disabled={isReadOnly} />
        </Field>
      )}

      {/* AUTOLIQUIDATION — avant les champs de TVA, parce qu'elle les annule. */}
      {selectedClient && (
        <div className="rounded-[var(--r-md)] border border-[var(--border)] p-3 flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.autoliquidation}
              onChange={e => set('autoliquidation', e.target.checked ? '1' : '')}
              disabled={isReadOnly}
              className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">
              Autoliquidation — TVA due par le preneur
              <span className="block text-xs text-[var(--text-muted)]">
                Prestation intracommunautaire B2B (art. 259-1 du CGI). La TVA n'est
                pas facturée : le TTC vaut le HT.
              </span>
            </span>
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
            <p className="text-xs text-[var(--text-muted)] font-mono">
              Mention portée sur la facture : « Autoliquidation — TVA due par le preneur,
              art. 259-1 du CGI »
            </p>
          )}
        </div>
      )}

      {/* Taux TVA + montant TVA éditable — masqués en autoliquidation : afficher
          un taux modifiable sous une case qui l'annule ne peut que tromper. */}
      {selectedClient && !form.autoliquidation && (
        <div className="grid grid-cols-2 gap-3 items-start">
          <Field label="Taux TVA">
            <TvaRateInput
              value={parseFloat(form.tva_rate || '20')}
              onChange={onTvaRateChange}
              disabled={isReadOnly}
            />
          </Field>
          <Field label={`Montant TVA (€)${tvaTouched ? ' ✎' : ' — auto'}`}>
            <Input
              type="number"
              value={form.tva_override}
              onChange={onTvaChange}
              placeholder="0.00"
              disabled={isReadOnly}
            />
          </Field>
        </div>
      )}

      {/* Lignes supplémentaires — attente, retour à vide, forfait…                  */}
      {/* Toutes sont regroupées avec la ligne principale sur la même facture.      */}
      {selectedClient && (
        <ExtraLinesEditor
          catalogue={catalogue}
          lines={extraLines}
          onChange={setExtraLines}
          defaultTvaRate={parseFloat(form.tva_rate || '20')}
          tauxForce={recap.taux_extras_force}
          disabled={isReadOnly}
        />
      )}

      {/* Récapitulatif HT / TVA / TTC */}
      {displayHt != null && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
          <InfoRow label="Montant HT">
            <span className="font-mono">{formatMoney(displayHt)}</span>
          </InfoRow>
          <InfoRow label={autoliq ? 'TVA (autoliquidation)' : 'TVA'}>
            <span className="font-mono">{recap.tva_cts != null ? formatMoney(recap.tva_cts) : '—'}</span>
          </InfoRow>
          {extraLines.length > 0 && (
            <>
              <InfoRow label={`Lignes supp. (${extraLines.length}) — HT`}>
                <span className="font-mono">{formatMoney(recap.extras_ht_cts)}</span>
              </InfoRow>
              <InfoRow label={autoliq ? 'Lignes supp. — TVA (0 %)' : 'Lignes supp. — TVA'}>
                <span className="font-mono">{formatMoney(recap.extras_tva_cts)}</span>
              </InfoRow>
            </>
          )}
          <InfoRow label="Total TTC">
            <span className="font-mono font-semibold text-[var(--text)]">
              {recap.ttc_total_cts != null ? formatMoney(recap.ttc_total_cts) : '—'}
            </span>
          </InfoRow>
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
      <div className="flex flex-col py-1">
        {STATUS_TIMELINE.map((s, i) => {
          const reached   = currentIdx >= 0 && i <= currentIdx
          const isCurrent = delivery.statut === s
          return (
            <div key={s} className="flex items-start gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <div className={`w-3 h-3 rounded-full flex-shrink-0
                  ${isCurrent
                    ? 'bg-[var(--brand)] ring-2 ring-[var(--brand)]/30'
                    : reached ? 'bg-[var(--brand)]' : 'bg-[var(--border)]'}`} />
                {i < STATUS_TIMELINE.length - 1 && (
                  <div className={`w-0.5 h-8 mt-0.5
                    ${reached && i < currentIdx ? 'bg-[var(--brand)]/40' : 'bg-[var(--border)]'}`} />
                )}
              </div>
              <div className="pb-4">
                <span className={`text-sm font-medium
                  ${reached ? 'text-[var(--text)]' : 'text-[var(--text-disabled)]'}`}>
                  {STATUS_LABELS[s]}
                </span>
                {isCurrent && <span className="ml-2 text-xs text-[var(--brand)]">← actuel</span>}
                {s === 'facturee' && delivery.invoiced_at && (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {new Date(delivery.invoiced_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
                {s === 'payee' && delivery.paid_at && (
                  <span className="ml-2 text-xs text-[var(--text-muted)]">
                    {new Date(delivery.paid_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {delivery.statut === 'annulee' && (
          <div className="mt-1 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[var(--danger)]" />
            <Badge color="danger">Annulée</Badge>
          </div>
        )}
      </div>

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

// ── Envoi email client (facture Pennylane + lettre de voiture) ───────────────────────────────
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
    toast(data.data?.bl_attached
      ? 'Email envoyé (facture + lettre de voiture)'
      : 'Email envoyé (facture — lettre de voiture non jointe)')
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
        message={`La facture Pennylane${delivery.lv_pdf_url ? ' et la lettre de voiture seront envoyées' : ' sera envoyée'} à ${email}.`}
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
    <a href={photoUrl} target="_blank" rel="noopener noreferrer"
      className="block rounded-[var(--r-md)] overflow-hidden border border-[var(--border)]
        hover:border-[var(--brand)] transition-colors">
      <img src={photoUrl} alt="Photo POD"
        className="w-full max-h-64 object-contain bg-[var(--bg-elevated)]" />
      <p className="px-3 py-1.5 text-xs text-[var(--text-muted)] text-center">
        Cliquer pour ouvrir en grand
      </p>
    </a>
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
        <div className="flex flex-col gap-2 rounded-[var(--r-md)] bg-[var(--bg)] border border-[var(--border)] p-3">
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
        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
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
            border border-[var(--border)] bg-[var(--bg)] text-sm
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

function Field({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {label}
      </label>
      {children}
      {error && <span className="text-[var(--danger)] text-xs">{error}</span>}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  )
}

// ── Éditeur de lignes supplémentaires ────────────────────────────────────────
// Section repliée par défaut si aucune ligne. Bouton « + Ajouter » toujours
// visible (sauf verrouillage post-facturation). Chaque ligne : label, quantité,
// HT unitaire, taux TVA, croix pour supprimer. Aucun stockage intermédiaire :
// on écrit directement dans le state parent (extraLines), sauvegardé avec la
// livraison via le champ JSONB `extra_lines`.

function ExtraLinesEditor({
  lines, onChange, defaultTvaRate, tauxForce = null, disabled, catalogue = [],
}: {
  /** Suppléments du client ; sans catalogue, les libellés usuels (prix à saisir). */
  catalogue?: Supplement[]
  lines: DeliveryExtraLine[]
  onChange: Dispatch<SetStateAction<DeliveryExtraLine[]>>
  defaultTvaRate: number
  /** Taux imposé à l'affichage (0 en autoliquidation) : champ TVA figé. */
  tauxForce?: number | null
  disabled: boolean
}) {
  const addLine = () => {
    onChange(prev => [...prev, {
      label: '',
      quantity: 1,
      amount_ht_cts: 0,
      tva_rate: Number.isFinite(defaultTvaRate) ? defaultTvaRate : 20,
    }])
  }
  const updateLine = (i: number, patch: Partial<DeliveryExtraLine>) => {
    onChange(prev => prev.map((l, j) => j === i ? { ...l, ...patch } : l))
  }
  const removeLine = (i: number) => {
    onChange(prev => prev.filter((_, j) => j !== i))
  }
  const ajouter = (s: Supplement) => {
    onChange(prev => [...prev, {
      label: s.label,
      quantity: 1,
      amount_ht_cts: s.prix_ht_cts,
      tva_rate: Number.isFinite(defaultTvaRate) ? defaultTvaRate : 20,
    }])
  }
  const proposes: Supplement[] = catalogue.length > 0
    ? catalogue
    : SUPPLEMENTS_USUELS.map(label => ({ label, prix_ht_cts: 0 }))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
          Lignes supplémentaires
        </span>
        {!disabled && (
          <Button variant="ghost" size="compact" onClick={addLine}>
            <Plus size={13} />
            Ajouter une ligne
          </Button>
        )}
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-1.5">
          {proposes.map(s => (
            <button key={s.label} type="button" onClick={() => ajouter(s)}
              title={s.prix_ht_cts ? `${formatMoney(s.prix_ht_cts)} HT` : 'Prix à saisir'}
              className="h-7 px-2.5 rounded-[var(--r-pill)] border border-[var(--border)] text-xs text-[var(--text-muted)]
                hover:border-[var(--brand)] hover:text-[var(--text)] inline-flex items-center gap-1">
              <Plus size={11} /> {s.label}
              {s.prix_ht_cts > 0 && <span className="font-mono">{formatMoney(s.prix_ht_cts)}</span>}
            </button>
          ))}
        </div>
      )}
      {lines.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)] italic">
          {catalogue.length > 0
            ? 'Suppléments de ce client : un clic les ajoute à la facture.'
            : 'Suppléments usuels (prix à saisir) — fixez les prix de ce client dans sa fiche.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <ExtraLineRow
              key={i}
              line={line}
              tauxForce={tauxForce}
              disabled={disabled}
              onUpdate={patch => updateLine(i, patch)}
              onRemove={() => removeLine(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ligne extra (édition inline) ────────────────────────────────────────────
// Saisie libre : le HT et la Qté sont conservés en texte local pendant la
// frappe (rawHt/rawQty) pour ne pas être re-formatés à chaque touche. On
// n'écrit dans l'état parent qu'au onBlur, après normalisation (« , » → « . »).
// Bénéfices : on peut taper « 2,01 », les zéros de fin ne disparaissent pas,
// et l'input ne devient jamais rouge pendant la saisie.
//
// La sync inverse (parent → local) n'est pas mise en place volontairement :
// les seuls changements externes à `line` passent par onUpdate ou remove/add
// (via ExtraLinesEditor), et remove/add démontent/remontent la ligne — ce qui
// suffit à réinitialiser les états locaux avec les bonnes valeurs.

function ExtraLineRow({
  line, tauxForce, disabled, onUpdate, onRemove,
}: {
  line: DeliveryExtraLine
  tauxForce: number | null
  disabled: boolean
  onUpdate: (patch: Partial<DeliveryExtraLine>) => void
  onRemove: () => void
}) {
  const [rawHt, setRawHt] = useState<string>(() =>
    line.amount_ht_cts ? (line.amount_ht_cts / 100).toFixed(2).replace('.', ',') : '',
  )
  const [rawQty, setRawQty] = useState<string>(() =>
    String(line.quantity ?? 1),
  )

  // Autorise chiffres + un séparateur optionnel (« , » ou « . ») + chiffres.
  // La regex accepte aussi la chaîne vide et un caractère isolé « , » / « . »
  // pour ne pas bloquer la frappe intermédiaire.
  const DECIMAL_RE = /^[0-9]*[.,]?[0-9]*$/

  const commitHt = () => {
    const s = rawHt.trim().replace(',', '.')
    if (s === '' || s === '.') {
      onUpdate({ amount_ht_cts: 0 })
      setRawHt('')
      return
    }
    const n = parseFloat(s)
    if (!Number.isFinite(n) || n < 0) {
      // Reset visuel à la dernière valeur valide connue si saisie corrompue.
      setRawHt(line.amount_ht_cts ? (line.amount_ht_cts / 100).toFixed(2).replace('.', ',') : '')
      return
    }
    const cts = Math.round(n * 100)
    onUpdate({ amount_ht_cts: cts })
    setRawHt((cts / 100).toFixed(2).replace('.', ','))
  }

  const commitQty = () => {
    const s = rawQty.trim().replace(',', '.')
    if (s === '' || s === '.') {
      onUpdate({ quantity: 1 })
      setRawQty('1')
      return
    }
    const n = parseFloat(s)
    if (!Number.isFinite(n) || n < 1) {
      onUpdate({ quantity: 1 })
      setRawQty('1')
      return
    }
    onUpdate({ quantity: n })
    setRawQty(String(n))
  }

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            type="text"
            value={line.label}
            onChange={v => onUpdate({ label: v })}
            placeholder="Ex. : Attente 30 min"
            disabled={disabled}
          />
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Supprimer la ligne"
            className="p-1.5 rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--danger)]
              hover:bg-[var(--danger)]/10 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Qté">
          <input
            type="text"
            inputMode="decimal"
            value={rawQty}
            onChange={e => {
              const v = e.target.value
              if (DECIMAL_RE.test(v)) setRawQty(v)
            }}
            onBlur={commitQty}
            placeholder="1"
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label="HT unit. (€)">
          <input
            type="text"
            inputMode="decimal"
            value={rawHt}
            onChange={e => {
              const v = e.target.value
              if (DECIMAL_RE.test(v)) setRawHt(v)
            }}
            onBlur={commitHt}
            placeholder="0,00"
            disabled={disabled}
            className={inputCls}
          />
        </Field>
        <Field label={tauxForce != null ? 'TVA % (autoliq.)' : 'TVA %'}>
          {/* En autoliquidation le taux propre de la ligne est conservé en
              base (si la coche est retirée, il revient) mais la facture part
              à 0 % : on affiche 0, non modifiable. */}
          <TvaRateInput
            value={tauxForce ?? line.tva_rate}
            onChange={r => onUpdate({ tva_rate: r })}
            disabled={disabled || tauxForce != null}
          />
        </Field>
      </div>
    </div>
  )
}
