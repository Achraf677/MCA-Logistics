import { describe, it, expect } from 'vitest'
import { buildLettreVoiture, lvNumero } from './lettreVoiture.logic'
import type {
  LvDeliveryInput, LvCompanyInput, LvVehicleInput, LvDriverInput, LvClientInput,
} from './lettreVoiture.logic'

// ── Factories ────────────────────────────────────────────────────────────────
const baseDelivery = (over: Partial<LvDeliveryInput> = {}): LvDeliveryInput => ({
  date: '2026-07-19',
  pickup_address: '17 rue de la Chapelle, 67540 Ostwald',
  delivery_address: '4 Place Kléber, 67000 Strasbourg',
  description: 'Cartons de vin',
  expediteur_nom: 'Cave Trimbach',
  expediteur_siren: '552123456',
  destinataire_nom: 'Restaurant Le Kléber',
  marchandise_desc: null, // → fallback description
  nb_colis: 12,
  poids_kg_reel: 45.5,
  amount_ttc_cts: 12000,
  amount_ht_cts: 10000,
  lv_numero: null,
  ...over,
})

const baseCompany = (over: Partial<LvCompanyInput> = {}): LvCompanyInput => ({
  name: 'MCA Logistics',
  siren: '102898095',
  address: '17 rue de la Chapelle, 67540 Ostwald',
  licence_transport: '2020/68/0000123',
  ...over,
})

const veh: LvVehicleInput = { label: 'MOVANO', plate: 'FT-123-AB' }
const drv: LvDriverInput = { full_name: 'Achraf Chikri' }
const cli: LvClientInput = { name: 'Restaurant Le Kléber' }

// ── buildLettreVoiture ───────────────────────────────────────────────────────
describe('buildLettreVoiture', () => {
  it('composition nominale : toutes mentions renseignées → missing vide', () => {
    const { data, missing } = buildLettreVoiture({
      delivery: baseDelivery(),
      company: baseCompany(),
      vehicle: veh, driver: drv, client: cli,
    })
    expect(missing).toEqual([])
    expect(data.expediteur.nom).toBe('Cave Trimbach')
    expect(data.expediteur.siren).toBe('552123456')
    expect(data.destinataire.nom).toBe('Restaurant Le Kléber')
    expect(data.transporteur.licence).toBe('2020/68/0000123')
    expect(data.marchandise.nb_colis).toBe(12)
    expect(data.marchandise.poids_kg).toBe(45.5)
    // Fallback description quand marchandise_desc absent
    expect(data.marchandise.description).toBe('Cartons de vin')
    expect(data.vehicule_nom).toBe('MOVANO')
    expect(data.vehicule_immat).toBe('FT-123-AB')
    expect(data.chauffeur).toBe('Achraf Chikri')
    expect(data.prix_ttc_formate).toBeTruthy()
  })

  it('immatriculation : utilise vehicle.plate, jamais vehicle.label', () => {
    const { data } = buildLettreVoiture({
      delivery: baseDelivery(),
      company: baseCompany(),
      vehicle: { label: 'MOVANO', plate: 'EB-612-SK' },
      driver: drv, client: cli,
    })
    expect(data.vehicule_immat).toBe('EB-612-SK')
    expect(data.vehicule_nom).toBe('MOVANO')
  })

  it('vehicle.plate manquant (mais label présent) → mention manquante, vehicule_immat vide', () => {
    const { data, missing } = buildLettreVoiture({
      delivery: baseDelivery(),
      company: baseCompany(),
      vehicle: { label: 'MOVANO', plate: null },
      driver: drv, client: cli,
    })
    expect(missing).toContain('Immatriculation du véhicule')
    expect(data.vehicule_immat).toBe('')
    expect(data.vehicule_nom).toBe('MOVANO')
  })

  it('véhicule absent (vehicle_id null) → mention manquante, vehicule_nom null', () => {
    const { data, missing } = buildLettreVoiture({
      delivery: baseDelivery(),
      company: baseCompany(),
      vehicle: null, driver: drv, client: cli,
    })
    expect(missing).toContain('Immatriculation du véhicule')
    expect(data.vehicule_immat).toBe('')
    expect(data.vehicule_nom).toBeNull()
  })

  it('destinataire_nom vide → fallback sur nom client', () => {
    const { data, missing } = buildLettreVoiture({
      delivery: baseDelivery({ destinataire_nom: null }),
      company: baseCompany(), vehicle: veh, driver: drv, client: cli,
    })
    expect(data.destinataire.nom).toBe('Restaurant Le Kléber')
    expect(missing).toEqual([])
  })

  it('marchandise_desc vide + description vide → mention manquante', () => {
    const { missing } = buildLettreVoiture({
      delivery: baseDelivery({ marchandise_desc: null, description: null }),
      company: baseCompany(), vehicle: veh, driver: drv, client: cli,
    })
    expect(missing).toContain('Description de la marchandise')
  })

  it('licence DREAL absente → mention manquante bloquante', () => {
    const { missing } = buildLettreVoiture({
      delivery: baseDelivery(),
      company: baseCompany({ licence_transport: null }),
      vehicle: veh, driver: drv, client: cli,
    })
    expect(missing).toContain('Licence de transport (DREAL)')
  })

  it('nb_colis à 0 ou poids à 0 → mentions manquantes', () => {
    const { missing } = buildLettreVoiture({
      delivery: baseDelivery({ nb_colis: 0, poids_kg_reel: 0 }),
      company: baseCompany(), vehicle: veh, driver: drv, client: cli,
    })
    expect(missing).toContain('Nombre de colis (> 0)')
    expect(missing).toContain('Poids réel en kg (> 0)')
  })

  it('véhicule / chauffeur absents → mentions manquantes', () => {
    const { missing } = buildLettreVoiture({
      delivery: baseDelivery(),
      company: baseCompany(),
      vehicle: null, driver: null, client: cli,
    })
    expect(missing).toContain('Immatriculation du véhicule')
    expect(missing).toContain('Nom du chauffeur')
  })

  it('prix non obligatoire — HT seul (fallback) + fallback legacy montant_ttc_cts', () => {
    const r1 = buildLettreVoiture({
      delivery: baseDelivery({ amount_ttc_cts: null, amount_ht_cts: 8000 }),
      company: baseCompany(), vehicle: veh, driver: drv, client: cli,
    })
    expect(r1.data.prix_ttc_formate).toBeTruthy()
    expect(r1.missing).toEqual([])

    const r2 = buildLettreVoiture({
      delivery: baseDelivery({ amount_ttc_cts: null, amount_ht_cts: null, montant_ttc_cts: 9500 }),
      company: baseCompany(), vehicle: veh, driver: drv, client: cli,
    })
    expect(r2.data.prix_ttc_formate).toBeTruthy()
  })

  it('livraison entièrement vide → cumul de mentions manquantes', () => {
    const empty: LvDeliveryInput = {
      date: '2026-07-19', pickup_address: null, delivery_address: null,
      description: null, expediteur_nom: null, expediteur_siren: null,
      destinataire_nom: null, marchandise_desc: null, nb_colis: null,
      poids_kg_reel: null, amount_ttc_cts: null, amount_ht_cts: null,
      lv_numero: null,
    }
    const { missing } = buildLettreVoiture({
      delivery: empty,
      company: baseCompany({ siren: null, licence_transport: null }),
      vehicle: null, driver: null, client: null,
    })
    // On veut au minimum : expéditeur (nom + adresse), destinataire (nom + adresse),
    // SIREN transporteur, licence, description marchandise, colis, poids, immat, chauffeur.
    expect(missing.length).toBeGreaterThanOrEqual(10)
  })
})

// ── lvNumero ─────────────────────────────────────────────────────────────────
describe('lvNumero', () => {
  it('liste vide → LV-YYYY-1', () => {
    expect(lvNumero([], 2026)).toBe('LV-2026-1')
    expect(lvNumero(null as unknown as string[], 2026)).toBe('LV-2026-1')
  })

  it('max + 1 sur l\'année en cours', () => {
    expect(lvNumero(['LV-2026-1', 'LV-2026-2', 'LV-2026-3'], 2026)).toBe('LV-2026-4')
  })

  it('trous dans la séquence → prend max+1, pas le premier trou', () => {
    // Sémantique choisie : additif seul, jamais de reprise d'un ancien n° libéré.
    expect(lvNumero(['LV-2026-1', 'LV-2026-3'], 2026)).toBe('LV-2026-4')
  })

  it('numéros d\'autres années ignorés (reset annuel)', () => {
    expect(lvNumero(['LV-2025-99', 'LV-2025-100'], 2026)).toBe('LV-2026-1')
  })

  it('changement d\'année : 2026 sur base 2026 → 2027-1 sur base 2027', () => {
    expect(lvNumero(['LV-2026-7'], 2026)).toBe('LV-2026-8')
    expect(lvNumero(['LV-2026-7'], 2027)).toBe('LV-2027-1')
  })

  it('ignore entrées invalides (null, undefined, chaînes mal formées)', () => {
    const noisy = [null, undefined, 'LV-BAD', 'INVALID', 'LV-2026-abc', 'LV-2026-5']
    expect(lvNumero(noisy, 2026)).toBe('LV-2026-6')
  })

  it('robuste contre les grands numéros', () => {
    expect(lvNumero(['LV-2026-999'], 2026)).toBe('LV-2026-1000')
  })
})
