import { useState, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Building2, ClipboardCheck, LogOut, ShieldCheck, Truck, ScanLine, UserRound, Wallet, FileCheck2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Shell } from '../../app/Shell'
import { Button } from '../../shared/ui/Button'
import { Skeleton } from '../../shared/ui/Skeleton'
import { useToast } from '../../shared/ui/useToast'
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete'
import { ChiffreCarte } from '../../shared/ui/ChiffreCarte'
import { AvatarInitiales } from '../../shared/ui/AvatarInitiales'
import { Bloc, Champ } from '../../shared/ui/FicheSaisie'
import { useProfile, supabase } from '../../app/providers'
import { usePermissions } from '../../shared/permissions/usePermissions'
import { libelleRole } from '../../shared/permissions/roles'
import { getCompany, updateCompany } from './parametres.queries'
import type { CompanyData } from './parametres.queries'
import { ThemeSelector } from '../../shared/theme/ThemeSelector'
import { GestionCategories } from './GestionCategories'
import { GestionProduits } from './GestionProduits'
import { GmailConnect } from './GmailConnect'
import { TestLectureAuto } from './TestLectureAuto'
import {
  erreursSociete, avertissementsSociete, completudeSociete, echeanceSociete, libelleEcheance, champsModifies,
} from './parametres.logic'

type Volet = 'societe' | 'finance' | 'flotte' | 'documents' | 'espace'
const VOLETS_VALIDES: Volet[] = ['societe', 'finance', 'flotte', 'documents', 'espace']
// Anciens liens (?volet=apparence / compte) : ces deux volets n'en font plus qu'un.
const ANCIENS_VOLETS: Record<string, Volet> = { apparence: 'espace', compte: 'espace' }

type Form = Omit<CompanyData, 'id'>

const VIDE: Form = {
  name: '', siren: '', siret: '', tva_intra: '',
  address: '', depot_lat: null, depot_lng: null,
  depart_colis_adresse: '', depart_colis_lat: null, depart_colis_lng: null,
  capital_cts: null, iban: '', bic: '',
  transport_license_expiry: null, rc_pro_expiry: null,
  licence_transport: '', pennylane_depot_email: '',
}

const depuisBase = (d: CompanyData): Form => ({
  name: d.name ?? '', siren: d.siren ?? '', siret: d.siret ?? '', tva_intra: d.tva_intra ?? '',
  address: d.address ?? '', depot_lat: d.depot_lat, depot_lng: d.depot_lng,
  depart_colis_adresse: d.depart_colis_adresse ?? '', depart_colis_lat: d.depart_colis_lat, depart_colis_lng: d.depart_colis_lng,
  capital_cts: d.capital_cts, iban: d.iban ?? '', bic: d.bic ?? '',
  transport_license_expiry: d.transport_license_expiry, rc_pro_expiry: d.rc_pro_expiry,
  licence_transport: d.licence_transport ?? '', pennylane_depot_email: d.pennylane_depot_email ?? '',
})

const TON: Record<string, 'warning' | 'danger' | undefined> = { soon: 'warning', overdue: 'danger', ok: undefined, none: 'warning' }

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
  const [params, setParams] = useSearchParams()
  const brut = params.get('volet') ?? 'societe'
  const volet: Volet = VOLETS_VALIDES.includes(brut as Volet) ? (brut as Volet) : (ANCIENS_VOLETS[brut] ?? 'societe')
  const choisirVolet = (v: Volet, ancre?: string) => {
    const next = new URLSearchParams(params)
    next.set('volet', v)
    setParams(next, { replace: true })
    if (ancre) setTimeout(() => document.getElementById(ancre)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  useEffect(() => {
    if (profileLoading) return
    if (!companyId) { setLoading(false); return }
    getCompany(companyId).then(({ data }) => {
      if (data) { const f = depuisBase(data as CompanyData); setInitial(f); setForm(f) }
      setLoading(false)
    })
  }, [companyId, profileLoading])

  const modifies = useMemo(() => champsModifies(initial, form), [initial, form])
  const dirty = modifies.length > 0
  const erreursBrutes = useMemo(() => erreursSociete(form), [form])
  // Une valeur déjà enregistrée n'est jamais bloquante : seules les saisies modifiées sont contrôlées.
  const erreurs = useMemo(() => Object.fromEntries(
    Object.entries(erreursBrutes).filter(([k]) => modifies.includes(k as keyof Form)),
  ), [erreursBrutes, modifies])
  const avertissements = useMemo(() => avertissementsSociete(form), [form])
  const completude = useMemo(() => completudeSociete(form), [form])

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
      iban:      form.iban?.replace(/\s/g, '').toUpperCase() || null,
      bic:       form.bic?.replace(/\s/g, '').toUpperCase() || null,
      transport_license_expiry: form.transport_license_expiry || null,
      rc_pro_expiry:            form.rc_pro_expiry || null,
      licence_transport:        form.licence_transport?.trim() || null,
      pennylane_depot_email:    form.pennylane_depot_email?.trim() || null,
    })
    if (error) toast((error as Error).message, 'error')
    else {
      toast('Paramètres enregistrés')
      const apres = { ...form, depot_lat, depot_lng, depart_colis_lat, depart_colis_lng }
      setForm(apres)
      setInitial(apres)
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <Shell pageTitle="Paramètres">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div>
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-14" />)}
        </div>
      </Shell>
    )
  }

  const volets: Array<{ key: Volet; label: string; icone: ReactNode }> = [
    { key: 'societe',   label: 'Société',        icone: <Building2 size={16} /> },
    { key: 'finance',   label: 'Finance',        icone: <Wallet size={16} /> },
    { key: 'flotte',    label: 'Flotte',         icone: <Truck size={16} /> },
    { key: 'documents', label: 'Documents & IA', icone: <ScanLine size={16} /> },
    { key: 'espace',    label: 'Mon espace',     icone: <UserRound size={16} /> },
  ]
  const eLicence = echeanceSociete(form.transport_license_expiry)
  const eRc = echeanceSociete(form.rc_pro_expiry)
  const nbErreurs = Object.keys(erreurs).length

  return (
    <Shell pageTitle="Paramètres">
      <div className="flex flex-col gap-5 w-full min-w-0">

        {/* Tuiles : un clic mène au bloc concerné */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <ChiffreCarte libelle="Fiche société" icone={<ClipboardCheck size={13} />}
            valeur={`${completude.remplis} / ${completude.total}`}
            ton={completude.manquants.length ? 'warning' : undefined}
            detail={completude.manquants.length ? `Manque : ${completude.manquants.slice(0, 2).join(', ')}${completude.manquants.length > 2 ? '…' : ''}` : 'Fiche complète'}
            titre="Voir la fiche société" actif={false} onClick={() => choisirVolet('societe')} />
          <ChiffreCarte libelle="Licence" icone={<ShieldCheck size={13} />}
            valeur={libelleEcheance(eLicence)} ton={TON[eLicence.status]} detail="Licence de transport"
            titre="Aller à la conformité" actif={false} onClick={() => choisirVolet('societe', 'bloc-conformite')} />
          <ChiffreCarte libelle="RC pro" icone={<FileCheck2 size={13} />}
            valeur={libelleEcheance(eRc)} ton={TON[eRc.status]} detail="Assurance transport"
            titre="Aller à la conformité" actif={false} onClick={() => choisirVolet('societe', 'bloc-conformite')} />
        </div>

        <div className="flex flex-col md:flex-row gap-5 items-stretch md:items-start">
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
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                  <div className="flex flex-col gap-4 min-w-0">
                    <Bloc titre="Identité légale">
                      <Champ label="Raison sociale" requis error={erreurs.name}>
                        <input className="field" value={form.name} onChange={e => set('name', e.target.value)} placeholder="MCA Logistics" disabled={!peutModifier} />
                      </Champ>
                      <div className="grid grid-cols-2 gap-3">
                        <Champ label="SIREN" error={erreurs.siren}>
                          <input className="field" inputMode="numeric" value={form.siren ?? ''} onChange={e => set('siren', e.target.value)} placeholder="123456789" disabled={!peutModifier} />
                        </Champ>
                        <Champ label="SIRET" error={erreurs.siret}>
                          <input className="field" inputMode="numeric" value={form.siret ?? ''} onChange={e => set('siret', e.target.value)} placeholder="12345678900001" disabled={!peutModifier} />
                        </Champ>
                      </div>
                      <Champ label="N° TVA intracommunautaire" error={erreurs.tva_intra}>
                        <input className="field" value={form.tva_intra ?? ''} onChange={e => set('tva_intra', e.target.value)} placeholder="FR12345678901" disabled={!peutModifier} />
                      </Champ>
                      <Champ label="Capital social (€)">
                        <input type="number" className="field" disabled={!peutModifier}
                          value={form.capital_cts != null ? form.capital_cts / 100 : ''}
                          onChange={e => set('capital_cts', e.target.value ? Math.round(parseFloat(e.target.value) * 100) : null)}
                          placeholder="7200" />
                      </Champ>
                      {avertissements.map(a => <p key={a} className="text-xs text-[var(--warning)]">{a}</p>)}
                    </Bloc>

                    <Bloc titre="Pennylane">
                      <Champ label="E-mail de dépôt des justificatifs" error={erreurs.pennylane_depot_email}>
                        <input type="email" className="field" value={form.pennylane_depot_email ?? ''} onChange={e => set('pennylane_depot_email', e.target.value)}
                          placeholder="depot@exemple.pennylane.tech" disabled={!peutModifier} />
                      </Champ>
                      <p className="text-xs text-[var(--text-muted)]">
                        Adresse de Pennylane qui reçoit les tickets et factures validés dans Finance › Justificatifs.
                      </p>
                    </Bloc>
                  </div>

                  <div className="flex flex-col gap-4 min-w-0">
                    <Bloc titre="Dépôt">
                      <AddressAutocomplete
                        label="Adresse du dépôt"
                        value={form.address ?? ''}
                        placeholder="17 rue de la Chapelle, 67540 Ostwald"
                        onChange={v => setForm(p => ({ ...p, address: v, depot_lat: null, depot_lng: null }))}
                        onSelect={s => setForm(p => ({ ...p, address: s.address, depot_lat: s.lat, depot_lng: s.lng }))}
                      />
                      {form.depot_lat != null && form.depot_lng != null && (
                        <p className="text-xs text-[var(--text-muted)] font-mono">Position : {form.depot_lat.toFixed(5)}, {form.depot_lng.toFixed(5)}</p>
                      )}
                    </Bloc>

                    <Bloc titre="Tournées de colis">
                      <AddressAutocomplete
                        label="Départ des tournées (centre de tri)"
                        value={form.depart_colis_adresse ?? ''}
                        placeholder="La Poste, allée de l'Écoparc Rhénan, 67550 Vendenheim"
                        onChange={v => setForm(p => ({ ...p, depart_colis_adresse: v, depart_colis_lat: null, depart_colis_lng: null }))}
                        onSelect={s => setForm(p => ({ ...p, depart_colis_adresse: s.address, depart_colis_lat: s.lat, depart_colis_lng: s.lng }))}
                      />
                      <p className="text-xs text-[var(--text-muted)]">
                        Point de départ et de retour de l'itinéraire calculé dans Ma tournée. Vide : le dépôt.
                      </p>
                    </Bloc>
                  </div>

                  <div className="flex flex-col gap-4 min-w-0">
                    <Bloc titre="Informations bancaires">
                      <Champ label="IBAN" error={erreurs.iban}>
                        <input className="field" value={form.iban ?? ''} onChange={e => set('iban', e.target.value.replace(/\s/g, ''))}
                          placeholder="FR7616958000019515253956892" disabled={!peutModifier} />
                      </Champ>
                      <Champ label="BIC / SWIFT" error={erreurs.bic}>
                        <input className="field" value={form.bic ?? ''} onChange={e => set('bic', e.target.value)} placeholder="QNTOFRP1XXX" disabled={!peutModifier} />
                      </Champ>
                      {form.iban && !erreurs.iban && (
                        <p className="text-xs text-[var(--text-muted)] font-mono break-all">{form.iban.replace(/(.{4})/g, '$1 ').trim()}</p>
                      )}
                    </Bloc>

                    <div id="bloc-conformite">
                      <Bloc titre="Conformité transport">
                        <Champ label="N° de licence de transport (DREAL)">
                          <input className="field" value={form.licence_transport ?? ''} onChange={e => set('licence_transport', e.target.value)}
                            placeholder="Ex. 2020/68/0000123" disabled={!peutModifier} />
                        </Champ>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-3">
                          <Champ label="Licence : échéance">
                            <input type="date" className="field" value={form.transport_license_expiry ?? ''} disabled={!peutModifier}
                              onChange={e => set('transport_license_expiry', e.target.value || null)} />
                          </Champ>
                          <Champ label="Assurance RC pro : échéance">
                            <input type="date" className="field" value={form.rc_pro_expiry ?? ''} disabled={!peutModifier}
                              onChange={e => set('rc_pro_expiry', e.target.value || null)} />
                          </Champ>
                        </div>
                      </Bloc>
                    </div>
                  </div>
                </div>

                {/* Barre d'actions fixe */}
                <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1 pt-2 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent">
                  <div className="flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] py-2.5 pl-4 pr-16 md:pr-4">
                    <span className="text-xs text-[var(--text-muted)] flex-1 min-w-[10rem]">
                      {!peutModifier ? "Lecture seule : tu n'as pas le droit de modifier les paramètres."
                        : nbErreurs > 0 ? `${nbErreurs} champ${nbErreurs > 1 ? 's' : ''} à corriger avant d'enregistrer.`
                        : dirty ? `${modifies.length} modification${modifies.length > 1 ? 's' : ''} non enregistrée${modifies.length > 1 ? 's' : ''}.`
                        : 'Aucune modification.'}
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <Button variant="secondary" onClick={() => setForm(initial)} disabled={!dirty || saving}>Annuler</Button>
                      <Button variant="primary" onClick={handleSave} disabled={saving || !dirty || nbErreurs > 0 || !peutModifier}>
                        {saving ? 'Enregistrement…' : 'Enregistrer'}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
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

            {volet === 'documents' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <GmailConnect />
                <Bloc titre="Lecture automatique des photos" icone={<ScanLine size={15} />}>
                  <TestLectureAuto />
                </Bloc>
              </div>
            )}

            {volet === 'espace' && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <Bloc titre="Apparence">
                  <p className="text-xs text-[var(--text-muted)] -mt-1">Le thème s'applique tout de suite, sur cet appareil.</p>
                  <ThemeSelector />
                </Bloc>
                <Bloc titre="Mon compte" icone={<UserRound size={15} />}>
                  <div className="flex items-center gap-3">
                    <AvatarInitiales nom={profile?.full_name ?? '?'} taille="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text)] truncate">{profile?.full_name ?? '—'}</p>
                      <p className="text-xs text-[var(--text-muted)] truncate">{profile?.email ?? ''}</p>
                      <p className="text-xs text-[var(--text-muted)]">{libelleRole(profile?.role)}</p>
                    </div>
                  </div>
                  <div>
                    <Button variant="secondary" onClick={handleLogout} disabled={logoutLoading}>
                      <LogOut size={14} />
                      {logoutLoading ? 'Déconnexion…' : 'Se déconnecter'}
                    </Button>
                  </div>
                </Bloc>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  )
}
