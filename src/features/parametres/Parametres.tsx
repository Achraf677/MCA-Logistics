import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Building2, LogOut, MapPin, PlugZap, ShieldCheck, Truck, UserRound, Wallet, PackageOpen } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import { Badge } from '../../shared/ui/Badge'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { BlocFiche } from './BlocFiche'
import { PennylaneDepot } from './PennylaneDepot'
import { useProfile, supabase } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { libelleRole } from '../../shared/permissions/roles'
import { getCompany, updateCompany } from './parametres.queries'
import type { CompanyData } from './parametres.queries'
import { ThemeSelector } from '../../shared/theme/ThemeSelector'
import { GestionCategories } from './GestionCategories'
import { GestionProduits } from './GestionProduits'
import { GmailConnect } from './GmailConnect'
import { erreursSociete, avertissementsSociete, echeanceSociete, libelleEcheance, champsModifies } from './parametres.logic'
import type { EcheanceStatus } from '../../shared/lib/echeances'

type Volet = 'societe' | 'documents' | 'finance' | 'flotte' | 'espace'
const VOLETS_VALIDES: Volet[] = ['societe', 'documents', 'finance', 'flotte', 'espace']
// Anciens liens (?volet=apparence / compte) : ces deux volets n'en font plus qu'un.
const ANCIENS_VOLETS: Record<string, Volet> = { apparence: 'espace', compte: 'espace' }

// L'IBAN / BIC de la société vivent dans Système › Cartes bancaires, l'e-mail de dépôt Pennylane dans le volet Connexions.
type Form = Omit<CompanyData, 'id' | 'iban' | 'bic' | 'pennylane_depot_email'>
type BlocId = 'identite' | 'depot' | 'colis' | 'conformite'

const VIDE: Form = {
  name: '', siren: '', siret: '', tva_intra: '',
  address: '', depot_lat: null, depot_lng: null,
  depart_colis_adresse: '', depart_colis_lat: null, depart_colis_lng: null,
  capital_cts: null,
  transport_license_expiry: null, rc_pro_expiry: null,
  licence_transport: '',
}

const depuisBase = (d: CompanyData): Form => ({
  name: d.name ?? '', siren: d.siren ?? '', siret: d.siret ?? '', tva_intra: d.tva_intra ?? '',
  address: d.address ?? '', depot_lat: d.depot_lat, depot_lng: d.depot_lng,
  depart_colis_adresse: d.depart_colis_adresse ?? '', depart_colis_lat: d.depart_colis_lat, depart_colis_lng: d.depart_colis_lng,
  capital_cts: d.capital_cts,
  transport_license_expiry: d.transport_license_expiry, rc_pro_expiry: d.rc_pro_expiry,
  licence_transport: d.licence_transport ?? '',
})

const COULEUR_ECHEANCE: Record<EcheanceStatus, 'success' | 'warning' | 'danger' | 'muted'> = { ok: 'success', soon: 'warning', overdue: 'danger', none: 'muted' }

export function Parametres() {
  const { companyId, loading: profileLoading, profile } = useProfile()
  const { can } = usePermissions()
  const { toast } = useToast()
  const peutModifier = can('systeme.parametres', 'update')
  const [initial, setInitial] = useState<Form>(VIDE)
  const [form, setForm] = useState<Form>(VIDE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [enEdition, setEnEdition] = useState<BlocId[]>([])
  const [depotEmail, setDepotEmail] = useState('')
  const [params, setParams] = useSearchParams()
  const brut = params.get('volet') ?? 'societe'
  const volet: Volet = VOLETS_VALIDES.includes(brut as Volet) ? (brut as Volet) : (ANCIENS_VOLETS[brut] ?? 'societe')
  const choisirVolet = (v: Volet) => {
    const next = new URLSearchParams(params)
    next.set('volet', v)
    setParams(next, { replace: true })
  }
  const ouvrir = (b: BlocId) => setEnEdition(e => e.includes(b) ? e : [...e, b])

  useEffect(() => {
    if (profileLoading) return
    if (!companyId) { setLoading(false); return }
    getCompany(companyId).then(({ data }) => {
      if (data) { const f = depuisBase(data as CompanyData); setInitial(f); setForm(f); setDepotEmail((data as CompanyData).pennylane_depot_email ?? '') }
      setLoading(false)
    })
  }, [companyId, profileLoading])

  const modifies = useMemo(() => champsModifies(initial, form), [initial, form])
  const dirty = modifies.length > 0
  const erreursBrutes = useMemo(() => erreursSociete({ ...form, pennylane_depot_email: null }), [form])
  // Une valeur déjà enregistrée n'est jamais bloquante : seules les saisies modifiées sont contrôlées.
  const erreurs = useMemo(() => Object.fromEntries(
    Object.entries(erreursBrutes).filter(([k]) => modifies.includes(k as keyof Form)),
  ), [erreursBrutes, modifies])
  const avertissements = useMemo(() => avertissementsSociete({ ...form, pennylane_depot_email: null }), [form])

  // Changements non enregistrés : le navigateur prévient avant de fermer / recharger l'onglet.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => ({ ...p, [k]: v }))

  const handleLogout = async () => {
    setLogoutLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) { toast(error.message, 'error'); setLogoutLoading(false) }
    // Succès : onAuthStateChange → user=null → LoginPage
  }

  const annuler = () => { setForm(initial); setEnEdition([]) }

  const handleSave = async () => {
    if (!companyId || !peutModifier || Object.keys(erreurs).length > 0) return
    setSaving(true)

    // Filet de sécurité : adresse saisie sans coordonnées → géocodage (Edge `geocode`, BAN). Un échec n'empêche pas l'enregistrement.
    let { depot_lat, depot_lng } = form
    const address = form.address?.trim() ?? ''
    if (address && (depot_lat == null || depot_lng == null)) {
      const { data } = await supabase.functions.invoke('geocode', { body: { address } })
      if (data?.ok && typeof data.lat === 'number' && typeof data.lng === 'number') {
        depot_lat = data.lat
        depot_lng = data.lng
      } else {
        toast('Adresse non localisée — enregistrée sans coordonnées', 'error')
      }
    }

    let { depart_colis_lat, depart_colis_lng } = form
    const departColis = form.depart_colis_adresse?.trim() ?? ''
    if (!departColis) { depart_colis_lat = null; depart_colis_lng = null }
    else if (depart_colis_lat == null || depart_colis_lng == null) {
      const { data } = await supabase.functions.invoke('geocode', { body: { address: departColis } })
      if (data?.ok && typeof data.lat === 'number' && typeof data.lng === 'number') {
        depart_colis_lat = data.lat
        depart_colis_lng = data.lng
      } else {
        toast('Départ des tournées de colis non localisé — enregistré sans coordonnées', 'error')
      }
    }

    const { error } = await updateCompany(companyId, {
      name:      form.name.trim() || undefined,
      siren:     form.siren?.replace(/\s/g, '') || null,
      siret:     form.siret?.replace(/\s/g, '') || null,
      tva_intra: form.tva_intra?.replace(/\s/g, '').toUpperCase() || null,
      address:   form.address || null,
      depot_lat,
      depot_lng,
      depart_colis_adresse: departColis || null,
      depart_colis_lat,
      depart_colis_lng,
      capital_cts: form.capital_cts,
      transport_license_expiry: form.transport_license_expiry || null,
      rc_pro_expiry:            form.rc_pro_expiry || null,
      licence_transport:        form.licence_transport?.trim() || null,
    })
    if (error) toast((error as Error).message, 'error')
    else {
      toast('Paramètres enregistrés')
      const apres = { ...form, depot_lat, depot_lng, depart_colis_lat, depart_colis_lng }
      setForm(apres)
      setInitial(apres)
      setEnEdition([])
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <Shell pageTitle="Paramètres">
        <div className="space-y-4">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div>
      </Shell>
    )
  }

  const volets: Array<{ key: Volet; label: string; icone: ReactNode }> = [
    { key: 'societe',   label: 'Société',    icone: <Building2 size={16} /> },
    { key: 'documents', label: 'Connexions', icone: <PlugZap size={16} /> },
    { key: 'finance',   label: 'Finance',    icone: <Wallet size={16} /> },
    { key: 'flotte',    label: 'Flotte',     icone: <Truck size={16} /> },
    { key: 'espace',    label: 'Mon espace', icone: <UserRound size={16} /> },
  ]
  const eLicence = echeanceSociete(form.transport_license_expiry)
  const eRc = echeanceSociete(form.rc_pro_expiry)
  const nbErreurs = Object.keys(erreurs).length
  const edite = (b: BlocId) => enEdition.includes(b)
  const barreVisible = dirty || enEdition.length > 0
  const capital = form.capital_cts != null ? `${(form.capital_cts / 100).toLocaleString('fr-FR')} €` : ''
  const vigilance = (e: ReturnType<typeof echeanceSociete>, date: string | null) => date
    ? <span className="inline-flex items-center gap-2 flex-wrap">{new Date(date).toLocaleDateString('fr-FR')} <Badge color={COULEUR_ECHEANCE[e.status]}>{libelleEcheance(e)}</Badge></span>
    : ''

  return (
    <Shell pageTitle="Paramètres">
      <div className="flex flex-col md:flex-row gap-5 items-stretch md:items-start w-full min-w-0">
        {/* Volets : colonne à gauche (PC), rangée défilante (mobile) */}
        <nav className="md:w-52 shrink-0 min-w-0 flex md:flex-col gap-1 overflow-x-auto md:sticky md:top-4
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {volets.map(v => {
            const estActif = v.key === volet
            return (
              <button key={v.key} type="button" onClick={() => choisirVolet(v.key)} aria-current={estActif ? 'page' : undefined}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-[var(--r-md)] text-left whitespace-nowrap text-sm transition-colors
                  ${estActif ? 'bg-[var(--brand-soft)] text-[var(--text)] font-medium' : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text)]'}`}>
                <span className={estActif ? 'text-[var(--brand)]' : ''}>{v.icone}</span>
                {v.label}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {volet === 'societe' && (
            <>
              <div className="flex flex-col gap-3 min-w-0">
                  <BlocFiche titre="Identité légale" icone={<Building2 size={15} />} enEdition={edite('identite')} onModifier={() => ouvrir('identite')} peutModifier={peutModifier}
                    lignes={[
                      { libelle: 'Raison sociale', valeur: form.name },
                      { libelle: 'SIREN', valeur: form.siren },
                      { libelle: 'SIRET', valeur: form.siret },
                      { libelle: 'N° de TVA', valeur: form.tva_intra },
                      { libelle: 'Capital social', valeur: capital },
                    ]}>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <Champ label="Raison sociale" requis error={erreurs.name}>
                      <input className="field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="MCA Logistics" />
                    </Champ>
                      <Champ label="SIREN" error={erreurs.siren}>
                        <input className="field" inputMode="numeric" value={form.siren ?? ''} onChange={e => set('siren', e.target.value)} placeholder="123456789" />
                      </Champ>
                      <Champ label="SIRET" error={erreurs.siret}>
                        <input className="field" inputMode="numeric" value={form.siret ?? ''} onChange={e => set('siret', e.target.value)} placeholder="12345678900001" />
                      </Champ>
                    <Champ label="N° TVA intracommunautaire" error={erreurs.tva_intra}>
                      <input className="field" value={form.tva_intra ?? ''} onChange={e => set('tva_intra', e.target.value)} placeholder="FR12345678901" />
                    </Champ>
                    <Champ label="Capital social (€)">
                      <input type="number" className="field"
                        value={form.capital_cts != null ? form.capital_cts / 100 : ''}
                        onChange={e => set('capital_cts', e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                        placeholder="7200" />
                    </Champ>
                    </div>
                    {avertissements.map(a => <p key={a} className="text-xs text-[var(--warning)]">{a}</p>)}
                  </BlocFiche>

                  <BlocFiche titre="Conformité transport" icone={<ShieldCheck size={15} />} enEdition={edite('conformite')} onModifier={() => ouvrir('conformite')} peutModifier={peutModifier}
                    lignes={[
                      { libelle: 'N° de licence', valeur: form.licence_transport },
                      { libelle: 'Licence : échéance', valeur: vigilance(eLicence, form.transport_license_expiry) },
                      { libelle: 'RC pro : échéance', valeur: vigilance(eRc, form.rc_pro_expiry) },
                    ]}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Champ label="N° de licence de transport (DREAL)">
                      <input className="field" value={form.licence_transport ?? ''} onChange={e => set('licence_transport', e.target.value)} placeholder="Ex. 2020/68/0000123" />
                    </Champ>
                      <Champ label="Licence : échéance">
                        <input type="date" className="field" value={form.transport_license_expiry ?? ''} onChange={e => set('transport_license_expiry', e.target.value || null)} />
                      </Champ>
                      <Champ label="Assurance RC pro : échéance">
                        <input type="date" className="field" value={form.rc_pro_expiry ?? ''} onChange={e => set('rc_pro_expiry', e.target.value || null)} />
                      </Champ>
                    </div>
                  </BlocFiche>

                  <BlocFiche titre="Adresse du dépôt" icone={<MapPin size={15} />} enEdition={edite('depot')} onModifier={() => ouvrir('depot')} peutModifier={peutModifier}
                    lignes={[{ libelle: 'Adresse', valeur: form.address }]}>
                    <AddressAutocomplete
                      label="Adresse du dépôt"
                      value={form.address ?? ''}
                      placeholder="17 rue de la Chapelle, 67540 Ostwald"
                      onChange={v => setForm(p => ({ ...p, address: v, depot_lat: null, depot_lng: null }))}
                      onSelect={s => setForm(p => ({ ...p, address: s.address, depot_lat: s.lat, depot_lng: s.lng }))}
                    />
                  </BlocFiche>

                  <BlocFiche titre="Départ des tournées de colis" icone={<PackageOpen size={15} />} enEdition={edite('colis')} onModifier={() => ouvrir('colis')} peutModifier={peutModifier}
                    lignes={[{ libelle: 'Centre de tri', valeur: form.depart_colis_adresse }]}>
                    <AddressAutocomplete
                      label="Centre de tri (départ et retour)"
                      value={form.depart_colis_adresse ?? ''}
                      placeholder="La Poste, allée de l'Écoparc Rhénan, 67550 Vendenheim"
                      onChange={v => setForm(p => ({ ...p, depart_colis_adresse: v, depart_colis_lat: null, depart_colis_lng: null }))}
                      onSelect={s => setForm(p => ({ ...p, depart_colis_adresse: s.address, depart_colis_lat: s.lat, depart_colis_lng: s.lng }))}
                    />
                    <p className="text-xs text-[var(--text-muted)]">Point de départ et de retour de l'itinéraire calculé dans Ma tournée. Vide : le dépôt.</p>
                  </BlocFiche>
              </div>

              {/* Barre d'actions : seulement quand un bloc est ouvert ou qu'il y a un changement */}
              {barreVisible && (
                <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1 pt-2 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent">
                  <div className="flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-4 pr-16 md:pr-4">
                    <span className="text-xs text-[var(--text-muted)] flex-1 min-w-[10rem]">
                      {nbErreurs > 0 ? `${nbErreurs} champ${nbErreurs > 1 ? 's' : ''} à corriger avant d'enregistrer.`
                        : dirty ? `${modifies.length} modification${modifies.length > 1 ? 's' : ''} non enregistrée${modifies.length > 1 ? 's' : ''}.`
                        : 'Rien n\'a changé.'}
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button variant="secondary" onClick={annuler} disabled={saving}>Annuler</Button>
                      <Button variant="primary" onClick={handleSave} disabled={saving || !dirty || nbErreurs > 0}>
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {volet === 'documents' && companyId && (
            <div className="flex flex-col gap-3">
              <GmailConnect />
              <PennylaneDepot companyId={companyId} valeur={depotEmail} peutModifier={peutModifier} onChange={setDepotEmail} />
            </div>
          )}

          {volet === 'finance' && (
            <Bloc titre="Catégories de charges" icone={<Wallet size={15} />}>
              <p className="text-xs text-[var(--text-muted)] -mt-1">Renommer, masquer, supprimer si vides.</p>
              <GestionCategories />
            </Bloc>
          )}

          {volet === 'flotte' && (
            <Bloc titre="Articles et familles des dépenses véhicule" icone={<Truck size={15} />}>
              <p className="text-xs text-[var(--text-muted)] -mt-1">Unité, stock, périodicité.</p>
              <GestionProduits />
            </Bloc>
          )}

          {volet === 'espace' && (
            <div className="flex flex-col gap-3">
              <Bloc titre="Mon compte" icone={<UserRound size={15} />}
                droite={<Button variant="secondary" size="compact" onClick={handleLogout} disabled={logoutLoading}>
                  <LogOut size={13} />{logoutLoading ? 'Déconnexion…' : 'Se déconnecter'}
                </Button>}>
                <div className="flex items-center gap-3">
                  <AvatarInitiales nom={profile?.full_name ?? '?'} taille="lg" />
                  <div className="min-w-0 flex-1 grid sm:grid-cols-3 gap-x-6 gap-y-1">
                    <div className="min-w-0"><p className="text-xs text-[var(--text-muted)]">Nom</p><p className="text-sm text-[var(--text)] truncate">{profile?.full_name ?? '—'}</p></div>
                    <div className="min-w-0"><p className="text-xs text-[var(--text-muted)]">E-mail</p><p className="text-sm text-[var(--text)] truncate">{profile?.email ?? '—'}</p></div>
                    <div className="min-w-0"><p className="text-xs text-[var(--text-muted)]">Rôle</p><p className="text-sm text-[var(--text)]">{libelleRole(profile?.role)}</p></div>
                  </div>
                </div>
              </Bloc>
              <Bloc titre="Apparence">
                <p className="text-xs text-[var(--text-muted)] -mt-1">Le thème s'applique tout de suite, sur cet appareil.</p>
                <ThemeSelector />
              </Bloc>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
