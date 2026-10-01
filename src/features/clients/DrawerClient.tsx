import { useState, useEffect } from 'react'
import { Trash2, Plus, X, Archive } from 'lucide-react'
import { BoutonIcone } from '../../shared/ui/BoutonIcone'
import type { ReactNode } from 'react'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Badge } from '../../shared/ui/Badge'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useToast } from '../../shared/ui/useToast'
import {
  createClient, updateClient, deactivateClient, deleteClient,
  countDeliveriesForClient, countQuotesForClient, getClientDeliveries, getChoixExecution,
} from './clients.queries'
import {
  CLIENT_TYPE_LABELS, CLIENT_TYPE_COLORS, CLIENT_TYPES, champsProfessionnels, validateSiret,
  TARIFF_MODE_LABELS, computeEncours, paymentStatusOf,
} from './clients.logic'
import { formatMoney } from '../../shared/lib/money'
import { normalizeClientName } from '../../shared/lib/normalizeClientName'
import { PAYMENT_TERM_OPTIONS, paymentTermDays, resolvePaymentTermCode, delaiConforme } from '../../shared/lib/paymentTerms'
import { PAYS, estUE, autoliquidationParDefaut } from '../../shared/lib/pays'
import { SUPPLEMENTS_USUELS, lireSupplements } from '../../shared/lib/supplements'
import type { Supplement } from '../../shared/lib/supplements'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import type { Client, ClientInsert, DeliveryForEncours, TariffMode } from './clients.types'
import { useProfile } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { DocumentsPanel } from '../../shared/ui/DocumentsPanel'

interface DrawerClientProps {
  open: boolean
  onClose: () => void
  client?: Client | null
  onSaved: () => void
}

const EMPTY_FORM: Partial<ClientInsert> = {
  name: '', siret: '', tva_intra: '', address: '', city: '',
  postal_code: '', email: '', phone: '', type: null,
  payment_terms: 30, payment_terms_label: '30', notes: '', active: true,
  tariff_mode: 'manuel', tariff_rate_cts: null,
  pays: 'FR', retrait_adresse: '', retrait_contact: '', retrait_tel: '',
  chauffeur_habituel_id: null, vehicule_habituel_id: null, prestation_defaut: null,
  reference_obligatoire: false, supplements: [],
}

const PRESTATIONS_CLIENT: Array<[NonNullable<Client['prestation_defaut']>, string]> = [
  ['express', 'Express'], ['messagerie', 'Messagerie (relevé au colis)'], ['dediee', 'Course dédiée'],
  ['mise_a_dispo', 'Mise à disposition'], ['forfait', 'Forfait / relevé'],
]

type Tab = 'detail' | 'historique' | 'encours' | 'documents'

export function DrawerClient({ open, onClose, client, onSaved }: DrawerClientProps) {
  const { companyId } = useProfile()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('detail')
  const [form, setForm] = useState<Partial<ClientInsert>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [siretError, setSiretError] = useState('')
  // Un particulier n'a ni SIRET, ni TVA, ni delai de paiement negocie.
  const estPro = champsProfessionnels(form.type ?? null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deliveries, setDeliveries] = useState<(DeliveryForEncours & { date: string; description: string | null })[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)

  const isEdit = !!client

  // Chauffeurs / véhicules pour les « habituels ».
  const [choix, setChoix] = useState<{ chauffeurs: Array<{ id: string; full_name: string }>; vehicules: Array<{ id: string; label: string }> }>({ chauffeurs: [], vehicules: [] })
  useEffect(() => {
    if (!open) return
    getChoixExecution().then(setChoix)
  }, [open])

  useEffect(() => {
    if (client) {
      setForm({
        name: client.name, siret: client.siret ?? '', tva_intra: client.tva_intra ?? '',
        address: client.address ?? '', city: client.city ?? '', postal_code: client.postal_code ?? '',
        email: client.email ?? '', phone: client.phone ?? '', type: client.type,
        payment_terms: client.payment_terms,
        payment_terms_label: resolvePaymentTermCode(client.payment_terms_label, client.payment_terms),
        notes: client.notes ?? '', active: client.active,
        tariff_mode: client.tariff_mode ?? 'manuel',
        tariff_rate_cts: client.tariff_rate_cts,
        pays: client.pays ?? 'FR',
        retrait_adresse: client.retrait_adresse ?? '', retrait_contact: client.retrait_contact ?? '',
        retrait_tel: client.retrait_tel ?? '',
        chauffeur_habituel_id: client.chauffeur_habituel_id ?? null,
        vehicule_habituel_id: client.vehicule_habituel_id ?? null,
        prestation_defaut: client.prestation_defaut ?? null,
        reference_obligatoire: !!client.reference_obligatoire,
        supplements: lireSupplements(client.supplements),
      })
    } else {
      setForm(EMPTY_FORM)
    }
    setSiretError('')
    setTab('detail')
    setDeliveries([])
  }, [client, open])

  useEffect(() => {
    if ((tab === 'historique' || tab === 'encours') && client && deliveries.length === 0) {
      setDeliveriesLoading(true)
      getClientDeliveries(client.id).then(({ data }) => {
        const paymentTerms = client.payment_terms ?? 30
        setDeliveries((data ?? []).map(d => ({ ...d, payment_terms: paymentTerms })))
        setDeliveriesLoading(false)
      })
    }
  }, [tab, client, deliveries.length])

  const set = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.name?.trim()) { toast('Le nom est requis', 'error'); return }
    if (form.siret && !validateSiret(form.siret)) {
      setSiretError('SIRET invalide (14 chiffres)'); return
    }
    if (form.tariff_mode !== 'manuel' && !form.tariff_rate_cts) {
      toast('Le tarif est requis pour ce mode', 'error'); return
    }
    setSiretError('')
    setSaving(true)
    try {
      // Un particulier n'a ni SIRET ni TVA intracommunautaire. On les efface à
      // l'enregistrement plutôt que de les laisser en base sous des champs
      // devenus invisibles : une donnée qu'on ne peut plus ni voir ni corriger
      // finirait tôt ou tard sur une facture ou une lettre de voiture.
      const vide = (s: string | null | undefined) => (s ?? '').trim() || null
      const payload = {
        ...form,
        name: normalizeClientName(form.name!),
        pays: (form.pays ?? 'FR').toUpperCase(),
        retrait_adresse: vide(form.retrait_adresse),
        retrait_contact: vide(form.retrait_contact),
        retrait_tel: vide(form.retrait_tel),
        // Suppléments : lignes sans libellé écartées, doublons fusionnés.
        supplements: lireSupplements(form.supplements),
        ...(estPro ? {} : { siret: null, tva_intra: null }),
      }
      if (isEdit && client) {
        const { error } = await updateClient(client.id, payload)
        if (error) throw error
        toast('Client mis à jour')
      } else {
        if (!companyId) throw new Error('Profil non chargé')
        const { error } = await createClient({ ...payload, company_id: companyId } as ClientInsert)
        if (error) throw error
        toast('Client créé')
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      toast((e as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Désactivation (archive : active=false) — distincte de la suppression.
  const handleDeactivate = async () => {
    if (!client) return
    setDeactivating(true)
    const { error } = await deactivateClient(client.id)
    setDeactivating(false)
    if (error) { toast(error.message, 'error'); return }
    setConfirmDeactivate(false)
    toast(`${client.name} désactivé`)
    onSaved()
    onClose()
  }

  // Suppression définitive — président uniquement, interdite si le client a des livraisons.
  const handleDeleteClick = async () => {
    if (!client) return
    try {
      const [nLiv, nDevis] = await Promise.all([
        countDeliveriesForClient(client.id),
        countQuotesForClient(client.id),
      ])
      if (nLiv > 0 || nDevis > 0) {
        const parts: string[] = []
        if (nDevis > 0) parts.push(`${nDevis} devis`)
        if (nLiv > 0) parts.push(`${nLiv} livraison(s)`)
        toast(`Ce client a ${parts.join(' et ')} rattaché(s) : suppression impossible. Désactive-le plutôt pour le retirer des listes sans perdre l'historique.`, 'error')
        return
      }
      setConfirmDelete(true)
    } catch (e) {
      toast(`Vérification des éléments liés impossible : ${(e as Error).message}`, 'error')
    }
  }

  const handleDelete = async () => {
    if (!client) return
    setDeleting(true)
    const { error } = await deleteClient(client.id)
    setDeleting(false)
    if (error) {
      const err = error as { code?: string; message?: string }
      const isFk = err.code === '23503' || /foreign key/i.test(err.message ?? '')
      toast(isFk
        ? 'Ce client a des éléments liés : suppression impossible. Désactive-le plutôt.'
        : (err.message ?? 'Erreur'), 'error')
      return
    }
    setConfirmDelete(false)
    toast(`${client.name} supprimé`)
    onSaved()
    onClose()
  }

  const { can } = usePermissions()

  const encours = computeEncours(deliveries)

  return (
    <Drawer open={open} onClose={onClose} title={isEdit ? client!.name : 'Nouveau client'} width="max-w-[min(68rem,100vw)]">
      {/* Tabs */}
      {isEdit && (
        <div className="flex gap-1 mb-5 border-b border-[var(--border)] -mx-5 px-5">
          {(['detail', 'historique', 'encours', 'documents'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-[var(--fs-sm)] font-medium border-b-2 transition-colors -mb-px ${
                tab === t
                  ? 'border-[var(--brand)] text-[var(--brand)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {t === 'detail' ? 'Détail' : t === 'historique' ? 'Historique' : t === 'encours' ? 'Encours & paiements' : 'Documents'}
            </button>
          ))}
        </div>
      )}

      {/* ── Onglet Détail ── */}
      {tab === 'detail' && (
        <div className="flex flex-col gap-4">
          {isEdit && (
            <div className="flex items-center gap-2">
              <Badge color={client!.active ? 'success' : 'muted'}>
                {client!.active ? 'Actif' : 'Inactif'}
              </Badge>
              {client!.type && (
                <Badge color={CLIENT_TYPE_COLORS[client!.type] as 'info' | 'success' | 'warning' | 'muted' | 'purple'}>
                  {CLIENT_TYPE_LABELS[client!.type]}
                </Badge>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 items-start">
            {/* Colonne 1 : qui est le client, comment on le facture */}
            <div className="flex flex-col gap-4 min-w-0">
              <Bloc titre="Identité">
                <FieldGroup label="Nom *">
                  <Input value={form.name ?? ''} onChange={v => set('name', v)}
                    placeholder="Celui qui commande ET paie (la plateforme, pas le particulier)" />
                </FieldGroup>
                <FieldGroup label="Type">
                  <select value={form.type ?? ''} onChange={e => set('type', e.target.value || null)} className={inputClass}>
                    <option value="">— Non précisé —</option>
                    {CLIENT_TYPES.map(v => <option key={v} value={v}>{CLIENT_TYPE_LABELS[v]}</option>)}
                  </select>
                </FieldGroup>
                {/* SIRET et TVA n'ont de sens que pour un professionnel. */}
                {estPro && (
                  <div className="grid grid-cols-2 gap-3">
                    <FieldGroup label="SIRET" error={siretError}>
                      <Input value={form.siret ?? ''} onChange={v => { set('siret', v); setSiretError('') }} placeholder="14 chiffres" />
                    </FieldGroup>
                    <FieldGroup label="N° TVA intracommunautaire">
                      <Input value={form.tva_intra ?? ''} onChange={v => set('tva_intra', v)} placeholder="FR…" />
                    </FieldGroup>
                  </div>
                )}
                <FieldGroup label="Adresse">
                  <Input value={form.address ?? ''} onChange={v => set('address', v)} placeholder="Rue…" />
                </FieldGroup>
                <div className="grid grid-cols-3 gap-3">
                  <FieldGroup label="Code postal">
                    <Input value={form.postal_code ?? ''} onChange={v => set('postal_code', v)} />
                  </FieldGroup>
                  <FieldGroup label="Ville">
                    <Input value={form.city ?? ''} onChange={v => set('city', v)} />
                  </FieldGroup>
                  <FieldGroup label="Pays">
                    <select value={form.pays ?? 'FR'} onChange={e => set('pays', e.target.value)} className={inputClass}>
                      {PAYS.map(p => <option key={p.code} value={p.code}>{p.libelle}</option>)}
                    </select>
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="E-mail (factures)">
                    <Input type="email" value={form.email ?? ''} onChange={v => set('email', v)} />
                  </FieldGroup>
                  <FieldGroup label="Téléphone">
                    <Input type="tel" value={form.phone ?? ''} onChange={v => set('phone', v)} />
                  </FieldGroup>
                </div>
              </Bloc>

              <Bloc titre="Facturation">
                <FieldGroup label="Délai de paiement">
                  <select
                    value={form.payment_terms_label ?? '30'}
                    onChange={e => {
                      const code = e.target.value
                      set('payment_terms_label', code)
                      set('payment_terms', paymentTermDays(code))
                    }}
                    className={inputClass}
                  >
                    {PAYMENT_TERM_OPTIONS
                      .filter(o => o.conforme || o.code === (form.payment_terms_label ?? '30'))
                      .map(o => (
                        <option key={o.code} value={o.code}>{o.label}{o.conforme ? '' : ' — non conforme'}</option>
                      ))}
                  </select>
                  {!delaiConforme(form.payment_terms_label) && (
                    <span className="text-xs text-[var(--warning)]">
                      Transport : 30 jours maximum à compter de la facture (art. L441-11 C. com.).
                      Les factures partent plafonnées à 30 jours ; choisissez un délai conforme.
                    </span>
                  )}
                </FieldGroup>
                <Coche checked={!!form.reference_obligatoire}
                  onChange={v => set('reference_obligatoire', v)}
                  label="Référence client obligatoire"
                  aide="Une course sans sa référence (ODT, n° de commande) ne peut pas être facturée." />
                {estPro && autoliquidationParDefaut(form.pays, form.tva_intra) && (
                  <span className="text-xs text-[var(--text-muted)]">
                    Client UE hors France avec n° de TVA : ses courses partent en autoliquidation par défaut.
                  </span>
                )}
                {estPro && (form.pays ?? 'FR') !== 'FR' && !form.tva_intra?.trim() && estUE(form.pays) && (
                  <span className="text-xs text-[var(--warning)]">
                    Client UE sans n° de TVA : l'autoliquidation n'est pas possible.
                  </span>
                )}
              </Bloc>
            </div>

            {/* Colonne 2 : prix et habitudes, qui pré-remplissent ses courses */}
            <div className="flex flex-col gap-4 min-w-0">
              <Bloc titre="Tarif">
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Mode tarifaire">
                    <select value={form.tariff_mode ?? 'manuel'}
                      onChange={e => set('tariff_mode', e.target.value as TariffMode)} className={inputClass}>
                      {(Object.entries(TARIFF_MODE_LABELS) as [TariffMode, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </FieldGroup>
                  {form.tariff_mode !== 'manuel' && (
                    <FieldGroup label={
                      form.tariff_mode === 'forfait' ? 'Montant forfait (€ HT)' :
                      form.tariff_mode === 'km'      ? 'Prix / km (€ HT)' :
                      form.tariff_mode === 'colis'   ? 'Prix / colis (€ HT)' :
                                                       'Prix / palette (€ HT)'
                    }>
                      <Input type="number"
                        value={form.tariff_rate_cts ? String(form.tariff_rate_cts / 100) : ''}
                        onChange={v => set('tariff_rate_cts', v ? Math.round(parseFloat(v) * 100) : null)}
                        placeholder="0,00" />
                    </FieldGroup>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {form.tariff_mode === 'colis'
                    ? 'Messagerie : chaque mois, seul le nombre de colis livrés se saisit ; le prix se remplit tout seul.'
                    : form.tariff_mode === 'manuel' ? 'Prix saisi course par course.' : 'Le prix des courses se calcule tout seul.'}
                </span>
                <EditeurSupplements valeur={form.supplements ?? []} onChange={v => set('supplements', v)} />
              </Bloc>

              <Bloc titre="Habitudes (pré-remplissent ses courses)">
                <FieldGroup label="Prestation habituelle">
                  <select value={form.prestation_defaut ?? ''} onChange={e => set('prestation_defaut', e.target.value || null)} className={inputClass}>
                    <option value="">— Express (par défaut) —</option>
                    {PRESTATIONS_CLIENT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </FieldGroup>
                <FieldGroup label="Retrait habituel — adresse">
                  <AddressAutocomplete
                    value={form.retrait_adresse ?? ''}
                    placeholder="Dépôt du client, entrepôt…"
                    onChange={v => set('retrait_adresse', v)}
                    onSelect={s => set('retrait_adresse', s.address)}
                  />
                </FieldGroup>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Contact au retrait">
                    <Input value={form.retrait_contact ?? ''} onChange={v => set('retrait_contact', v)} placeholder="Nom" />
                  </FieldGroup>
                  <FieldGroup label="Téléphone au retrait">
                    <Input type="tel" value={form.retrait_tel ?? ''} onChange={v => set('retrait_tel', v)} placeholder="06…" />
                  </FieldGroup>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldGroup label="Chauffeur habituel">
                    <select value={form.chauffeur_habituel_id ?? ''} onChange={e => set('chauffeur_habituel_id', e.target.value || null)} className={inputClass}>
                      <option value="">— Aucun —</option>
                      {choix.chauffeurs.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                  </FieldGroup>
                  <FieldGroup label="Véhicule habituel">
                    <select value={form.vehicule_habituel_id ?? ''} onChange={e => set('vehicule_habituel_id', e.target.value || null)} className={inputClass}>
                      <option value="">— Aucun —</option>
                      {choix.vehicules.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                  </FieldGroup>
                </div>
              </Bloc>

              <Bloc titre="Notes">
                <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3}
                  className={`${inputClass} field-area resize-none`} placeholder="Notes internes…" />
              </Bloc>
            </div>
          </div>

          <div className="sticky -bottom-5 -mx-5 -mb-5 mt-1 px-5 py-3 flex items-center gap-2
            bg-[var(--bg-elevated)] border-t border-[var(--border)] z-10">
            {can('tiers.clients', isEdit ? 'update' : 'create') && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <span className="ml-auto flex items-center gap-2">
              {isEdit && client!.active && (
                <BoutonIcone icone={Archive} libelle="Désactiver (archiver) ce client" onClick={() => setConfirmDeactivate(true)} />
              )}
              {isEdit && can('tiers.clients', 'delete') && (
                <BoutonIcone icone={Trash2} libelle="Supprimer ce client" onClick={handleDeleteClick} />
              )}
            </span>
          </div>
        </div>
      )}

      {/* ── Onglet Historique ── */}
      {tab === 'historique' && (
        <div className="flex flex-col gap-3">
          {deliveriesLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)] text-[var(--fs-sm)]">
              Chargement…
            </div>
          ) : deliveries.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)] text-[var(--fs-sm)]">
              Aucune livraison
            </div>
          ) : (
            deliveries.map(d => {
              const amount = d.amount_ttc_cts ?? d.montant_ttc_cts ?? 0
              return (
                <div key={d.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-[var(--border)] last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[var(--fs-sm)] text-[var(--text)]">{d.description || '—'}</span>
                    <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">{formatDate(d.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge statut={d.statut} />
                    <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{formatMoney(amount)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Onglet Encours & paiements ── */}
      {tab === 'encours' && (
        <div className="flex flex-col gap-4">
          {deliveriesLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)] text-[var(--fs-sm)]">
              Chargement…
            </div>
          ) : (
            <>
              {/* Résumé encours */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-card)] rounded-[var(--r-md)] border border-[var(--border)] px-4 py-3">
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide mb-1">Encours total</p>
                  <p className="text-[var(--fs-lg)] font-semibold text-[var(--text)]">{formatMoney(encours.total_cts)}</p>
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)]">{encours.count} facture{encours.count > 1 ? 's' : ''}</p>
                </div>
                <div className="bg-[var(--bg-card)] rounded-[var(--r-md)] border border-[var(--border)] px-4 py-3">
                  <p className="text-[var(--fs-xs)] text-[var(--text-muted)] uppercase tracking-wide mb-1">Dont en retard</p>
                  <p className={`text-[var(--fs-lg)] font-semibold ${encours.overdue_cts > 0 ? 'text-[var(--danger)]' : 'text-[var(--text)]'}`}>
                    {formatMoney(encours.overdue_cts)}
                  </p>
                </div>
              </div>

              {/* Liste factures non payées */}
              {encours.count === 0 ? (
                <div className="flex items-center justify-center py-8 text-[var(--text-muted)] text-[var(--fs-sm)]">
                  Aucune facture en attente
                </div>
              ) : (
                <div className="flex flex-col">
                  {deliveries.filter(d => d.statut === 'facturee').map(d => {
                    const today = new Date()
                    const status = paymentStatusOf(d, today)
                    const amount = d.amount_ttc_cts ?? d.montant_ttc_cts ?? 0
                    return (
                      <div key={d.id} className="flex items-center justify-between gap-2 py-2.5 border-b border-[var(--border)] last:border-0">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[var(--fs-sm)] text-[var(--text)]">{d.description || '—'}</span>
                          <span className="text-[var(--fs-xs)] text-[var(--text-muted)]">
                            Facturé le {d.invoiced_at ? formatDate(d.invoiced_at) : '—'}
                            {d.invoiced_at && ` · Échéance ${formatDate(addDays(d.invoiced_at, d.payment_terms))}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PaymentBadge status={status} />
                          <span className="text-[var(--fs-sm)] font-medium text-[var(--text)]">{formatMoney(amount)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Onglet Documents ── */}
      {tab === 'documents' && (
        <DocumentsPanel entityType="client" entityId={client?.id ?? null} />
      )}

      <ConfirmDialog
        open={confirmDeactivate}
        title="Désactiver ce client ?"
        message={`${client?.name ?? ''} sera archivé (masqué des listes actives). Réversible.`}
        confirmLabel="Désactiver"
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        loading={deactivating}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce client ?"
        message="Action irréversible."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </Drawer>
  )
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

const STATUT_LABELS: Record<string, string> = {
  brouillon: 'Brouillon', validee: 'Validée', facturee: 'Facturée',
  payee: 'Payée', annulee: 'Annulée',
}

function StatusBadge({ statut }: { statut: string }) {
  const color =
    statut === 'payee'    ? 'success' :
    statut === 'facturee' ? 'warning' :
    statut === 'annulee'  ? 'muted'   : 'info'
  return <Badge color={color as 'success' | 'warning' | 'muted' | 'info'}>{STATUT_LABELS[statut] ?? statut}</Badge>
}

function PaymentBadge({ status }: { status: 'a_jour' | 'du' | 'en_retard' }) {
  if (status === 'a_jour') return <Badge color="success">À jour</Badge>
  if (status === 'en_retard') return <Badge color="danger">En retard</Badge>
  return <Badge color="warning">Dû</Badge>
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// ── Mini helpers ──────────────────────────────────────────────────────────────
const inputClass = 'field'
function Input({ type = 'text', value, onChange, placeholder, className = '' }: {
  type?: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <input
      type={type} value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
    />
  )
}

function FieldGroup({ label, children, error, className = '' }: {
  label: string; children: React.ReactNode; error?: string; className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">{label}</label>
      {children}
      {error && <span className="text-[var(--danger)] text-xs">{error}</span>}
    </div>
  )
}

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] p-3.5 flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{titre}</h3>
      {children}
    </section>
  )
}

function Coche({ checked, onChange, label, aide }: { checked: boolean; onChange: (v: boolean) => void; label: string; aide?: string }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="accent-[var(--brand)] w-4 h-4 mt-0.5 shrink-0 cursor-pointer" />
      <span className="text-sm text-[var(--text)]">
        {label}
        {aide && <span className="block text-xs text-[var(--text-muted)]">{aide}</span>}
      </span>
    </label>
  )
}

/**
 * Catalogue de suppléments du client : libellé + prix HT. Proposé en un clic
 * dans chaque fiche livraison de ce client (plus de saisie libre répétée).
 */
function EditeurSupplements({ valeur, onChange }: { valeur: Supplement[]; onChange: (v: Supplement[]) => void }) {
  const maj = (i: number, patch: Partial<Supplement>) => onChange(valeur.map((s, j) => j === i ? { ...s, ...patch } : s))
  const deja = new Set(valeur.map(s => s.label.trim().toLowerCase()))
  const usuels = SUPPLEMENTS_USUELS.filter(l => !deja.has(l.toLowerCase()))
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Suppléments facturables</span>
      {valeur.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={s.label} onChange={e => maj(i, { label: e.target.value })} placeholder="Libellé" className={`${inputClass} flex-1`} />
          <input type="number" min={0} step={0.01}
            value={s.prix_ht_cts ? String(s.prix_ht_cts / 100) : ''}
            onChange={e => maj(i, { prix_ht_cts: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0 })}
            placeholder="€ HT" className={`${inputClass} w-[6.5rem]`} />
          <button type="button" aria-label="Retirer" onClick={() => onChange(valeur.filter((_, j) => j !== i))}
            className="p-1.5 rounded-[var(--r-sm)] text-[var(--text-muted)] hover:text-[var(--danger)]">
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        {usuels.map(l => (
          <button key={l} type="button" onClick={() => onChange([...valeur, { label: l, prix_ht_cts: 0 }])}
            className="h-7 px-2.5 rounded-[var(--r-pill)] border border-[var(--border)] text-xs text-[var(--text-muted)] hover:border-[var(--brand)] hover:text-[var(--text)] inline-flex items-center gap-1">
            <Plus size={11} /> {l}
          </button>
        ))}
        <button type="button" onClick={() => onChange([...valeur, { label: '', prix_ht_cts: 0 }])}
          className="h-7 px-2.5 rounded-[var(--r-pill)] border border-dashed border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center gap-1">
          <Plus size={11} /> Autre
        </button>
      </div>
    </div>
  )
}
