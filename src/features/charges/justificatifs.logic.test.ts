import { describe, it, expect } from 'vitest'
import { CRITERES_VIDES, compterParType, compteursJustificatifs, estIncomplet, moisPresents, nbCriteresActifs, sectionsATraiter, typeJustif, etapesSuivi, etatJustificatif, filtrerJustificatifs, initiales, jourJustif, type JustifLigne } from './justificatifs.logic'

const t = (o: Partial<JustifLigne> & { id?: string; uploaded_by?: string }): JustifLigne & { id?: string; uploaded_by?: string } =>
  ({ statut: 'a_traiter', created_at: '2026-10-20T08:00:00Z', ...o })

const liste = [
  t({ id: 'a', statut: 'a_traiter', moyen_paiement: 'personnel', montant_ttc_cts: 1250, note: 'Péage A35', uploaded_by: 'u1' }),
  t({ id: 'b', statut: 'traite', moyen_paiement: 'personnel', montant_ttc_cts: 800, rembourse_le: '2026-10-21' }),
  t({ id: 'c', statut: 'traite', moyen_paiement: 'personnel', montant_ttc_cts: 600 }),
  t({ id: 'd', statut: 'traite', moyen_paiement: 'carte_societe', montant_ttc_cts: 900 }),
  t({ id: 'e', statut: 'ignore', moyen_paiement: 'personnel', montant_ttc_cts: 500 }),
]

describe('justificatifs', () => {
  it('compteurs : à rembourser = poche, ni refusé ni remboursé', () => {
    expect(compteursJustificatifs(liste)).toEqual({ a_traiter: 1, valides: 3, refuses: 1, a_rembourser: 2 })
  })
  it('filtre par statut', () => {
    expect(filtrerJustificatifs(liste, 'valides', '').map(x => x.id)).toEqual(['b', 'c', 'd'])
    expect(filtrerJustificatifs(liste, 'a_rembourser', '').map(x => x.id)).toEqual(['a', 'c'])
  })
  it('recherche dans la note et le nom du déclarant', () => {
    expect(filtrerJustificatifs(liste, 'a_traiter', 'péage').map(x => x.id)).toEqual(['a'])
    expect(filtrerJustificatifs(liste, 'a_traiter', 'lucas', { u1: 'Lucas Martin' }).map(x => x.id)).toEqual(['a'])
    expect(filtrerJustificatifs(liste, 'a_traiter', 'xyz')).toEqual([])
  })
  it('jour : date de dépense sinon jour d’envoi', () => {
    expect(jourJustif({ date_depense: '2026-10-18', created_at: '2026-10-20T08:00:00Z' })).toBe('2026-10-18')
    expect(jourJustif({ created_at: '2026-10-20T08:00:00Z' })).toBe('2026-10-20')
  })
  it('un seul état affiché', () => {
    expect(etatJustificatif({ statut: 'a_traiter', created_at: 'x' }).libelle).toBe('À traiter')
    expect(etatJustificatif({ statut: 'traite', moyen_paiement: 'personnel', created_at: 'x' }).libelle).toBe('À rembourser')
    expect(etatJustificatif({ statut: 'traite', moyen_paiement: 'personnel', rembourse_le: '2026-10-21', created_at: 'x' }).libelle).toBe('Remboursé')
    expect(etatJustificatif({ statut: 'traite', moyen_paiement: 'carte_societe', created_at: 'x' }).libelle).toBe('Validé')
    expect(etatJustificatif({ statut: 'ignore', created_at: 'x' }).ton).toBe('danger')
  })
  it('frise : à traiter → validé → Pennylane → remboursé', () => {
    const e = etapesSuivi({ statut: 'a_traiter', moyen_paiement: 'personnel', created_at: '2026-10-20T08:00:00Z' })
    expect(e.map(x => [x.cle, x.etat])).toEqual([['envoye', 'fait'], ['valide', 'attente'], ['pennylane', 'attente'], ['rembourse', 'attente']])
    const f = etapesSuivi({ statut: 'traite', moyen_paiement: 'carte_societe', created_at: '2026-10-20T08:00:00Z', traite_at: '2026-10-21T08:00:00Z', pennylane_envoye_le: '2026-10-21T08:01:00Z' })
    expect(f.map(x => [x.cle, x.etat])).toEqual([['envoye', 'fait'], ['valide', 'fait'], ['pennylane', 'fait']])
  })
  it('frise : un refus s’arrête là', () => {
    const e = etapesSuivi({ statut: 'ignore', created_at: '2026-10-20T08:00:00Z', traite_at: '2026-10-21T08:00:00Z' })
    expect(e.map(x => [x.cle, x.etat])).toEqual([['envoye', 'fait'], ['refuse', 'refuse']])
  })
  it('initiales', () => {
    expect(initiales('Lucas Martin')).toBe('LM')
    expect(initiales('')).toBe('?')
  })
})

describe('familles, filtres interactifs et sections', () => {
  const base = { statut: 'a_traiter', created_at: '2026-10-05T08:00:00Z', date_depense: '2026-10-05', montant_ttc_cts: 1000 }
  const l = [
    { id: 'n1', ...base, moyen_paiement: 'personnel', uploaded_by: 'u1' },
    { id: 'n2', ...base, moyen_paiement: 'personnel', uploaded_by: 'u2', montant_ttc_cts: 5000 },
    { id: 'c1', ...base, moyen_paiement: 'carte_societe', uploaded_by: 'u1', carte: 'qonto_4103' },
    { id: 'c2', ...base, moyen_paiement: 'carte_societe', uploaded_by: 'u1', date_depense: '2026-09-30' },
    { id: 'k1', ...base, moyen_paiement: 'carte_carburant', uploaded_by: 'u2', carte: 'edenred_9156', vehicle_id: 'v1' },
    { id: 'x1', ...base, moyen_paiement: null, uploaded_by: 'u2' },
  ]
  it('famille d\'un justificatif', () => {
    expect(l.map(typeJustif)).toEqual(['note_de_frais', 'note_de_frais', 'cb', 'cb', 'carburant', 'autre'])
    expect(compterParType(l)).toEqual({ note_de_frais: 2, cb: 2, carburant: 1, autre: 1 })
  })
  it('filtres combinables', () => {
    const f = (c: Partial<typeof CRITERES_VIDES>) => filtrerJustificatifs(l, 'a_traiter', '', {}, { ...CRITERES_VIDES, ...c }).map(x => x.id)
    expect(f({ type: 'cb' })).toEqual(['c1', 'c2'])
    expect(f({ declarant: 'u2' })).toEqual(['n2', 'k1', 'x1'])
    expect(f({ type: 'cb', declarant: 'u1', mois: '2026-10' })).toEqual(['c1'])
    expect(f({ carte: 'edenred_9156' })).toEqual(['k1'])
    expect(f({ incomplets: true })).toEqual(['c2', 'x1'])
    expect(nbCriteresActifs({ ...CRITERES_VIDES, type: 'cb', incomplets: true })).toBe(2)
  })
  it('incomplet : carte, véhicule, montant', () => {
    expect(estIncomplet({ ...base, moyen_paiement: 'carte_carburant', carte: 'edenred_9156' })).toBe(true)
    expect(estIncomplet({ ...base, moyen_paiement: 'personnel' })).toBe(false)
    expect(estIncomplet({ ...base, moyen_paiement: 'personnel', montant_ttc_cts: null })).toBe(true)
  })
  it('mois présents, récents d\'abord', () => {
    expect(moisPresents(l)).toEqual(['2026-10', '2026-09'])
  })
  it('sections : notes de frais par salarié (le plus dû d\'abord), sections vides omises', () => {
    const nom = (t: { uploaded_by?: string | null }) => (t.uploaded_by === 'u1' ? 'Lucas' : 'Ana')
    const s = sectionsATraiter(l, nom)
    expect(s.map(x => x.cle)).toEqual(['note_de_frais', 'cb', 'carburant', 'autre'])
    expect(s[0].parSalarie?.map(g => [g.libelle, g.totalCts])).toEqual([['Ana', 5000], ['Lucas', 1000]])
    expect(sectionsATraiter(l.filter(x => x.id === 'c1'), nom).map(x => x.cle)).toEqual(['cb'])
  })
})
