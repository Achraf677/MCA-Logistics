import { describe, it, expect } from 'vitest'
import {
  nombreColis, manquesPourEnvoyer, colisRetenus, estCorrigee, totauxJournees, remunerationCts,
  rapportParSalarie, rapportCsv, bornesMois, salariePeutModifier, type JourneeColis,
} from './journeesColis'

function j(p: Partial<JourneeColis>): JourneeColis {
  return {
    id: 'j', company_id: 'c', member_id: 'm1', date: '2026-10-12', client_id: 'cl',
    colis_domicile: 0, colis_relais: 0, colis_litige: 0, litige_raison: null, note: null,
    statut: 'envoyee', domicile_valide: null, relais_valide: null, litige_valide: null,
    motif_refus: null, motif_modification: null, envoyee_le: null, valide_par: null, valide_le: null,
    created_at: '', updated_at: '', ...p,
  }
}

describe('journée de colis', () => {
  it('saisie de nombres', () => {
    expect(nombreColis('')).toBe(0)
    expect(nombreColis('12')).toBe(12)
    expect(nombreColis('1,5')).toBeNull()
    expect(nombreColis(-1)).toBeNull()
  })
  it('manques pour envoyer', () => {
    expect(manquesPourEnvoyer({ colis_domicile: 0, colis_relais: 0, colis_litige: 0, litige_raison: '' }, 0))
      .toEqual(['Aucun colis déclaré', "Photo du compteur de l'appareil"])
    expect(manquesPourEnvoyer({ colis_domicile: 10, colis_relais: 2, colis_litige: 1, litige_raison: ' ' }, 1))
      .toEqual(['Raison du litige'])
    expect(manquesPourEnvoyer({ colis_domicile: 10, colis_relais: 0, colis_litige: 0, litige_raison: '' }, 2)).toEqual([])
  })
  it('validée = verrouillée pour le salarié', () => {
    expect(salariePeutModifier(j({ statut: 'validee' }))).toBe(false)
    expect(salariePeutModifier(j({ statut: 'refusee' }))).toBe(true)
    expect(salariePeutModifier(null)).toBe(true)
  })
  it('nombres retenus et correction', () => {
    const v = j({ statut: 'validee', colis_domicile: 100, colis_relais: 20, domicile_valide: 98, relais_valide: 20, litige_valide: 0 })
    expect(colisRetenus(v)).toEqual({ domicile: 98, relais: 20, litige: 0 })
    expect(estCorrigee(v)).toBe(true)
    expect(estCorrigee(j({ statut: 'envoyee', colis_domicile: 5 }))).toBe(false)
  })
  it('totaux : brouillons exclus, jours distincts, validé séparé', () => {
    const t = totauxJournees([
      j({ date: '2026-10-01', statut: 'validee', colis_domicile: 10, colis_relais: 5, domicile_valide: 10, relais_valide: 5 }),
      j({ date: '2026-10-01', statut: 'validee', colis_domicile: 3, domicile_valide: 3, relais_valide: 0 }),
      j({ date: '2026-10-02', statut: 'envoyee', colis_domicile: 7 }),
      j({ date: '2026-10-03', statut: 'refusee', colis_relais: 2 }),
      j({ date: '2026-10-04', statut: 'brouillon', colis_domicile: 50 }),
    ])
    expect(t.jours).toBe(3)
    expect(t.domicile).toBe(20)
    expect(t.valides).toEqual({ domicile: 13, relais: 5, litige: 0, jours: 1 })
    expect(t.enAttente).toBe(1)
    expect(t.aCorriger).toBe(1)
  })
  it('rémunération au colis', () => {
    expect(remunerationCts({ domicile: 10, relais: 4 }, { tarif_domicile_cts: 150, tarif_relais_cts: 80 })).toBe(1820)
    expect(remunerationCts({ domicile: 10, relais: 4 }, { tarif_domicile_cts: 150, tarif_relais_cts: null })).toBeNull()
    expect(remunerationCts({ domicile: 10, relais: 0 }, { tarif_domicile_cts: 150, tarif_relais_cts: null })).toBe(1500)
  })
  it('rapport et CSV', () => {
    const lignes = rapportParSalarie(
      [j({ member_id: 'm1', statut: 'validee', colis_domicile: 10, domicile_valide: 10, relais_valide: 0 })],
      [{ id: 'm1', full_name: 'Lucas', tarif_domicile_cts: 150, tarif_relais_cts: 80 },
       { id: 'm2', full_name: 'Sans journée', tarif_domicile_cts: null, tarif_relais_cts: null }],
    )
    expect(lignes).toHaveLength(1)
    expect(lignes[0].du_cts).toBe(1500)
    expect(rapportCsv(lignes, 'octobre 2026').split('\n')[1]).toBe('"octobre 2026";"Lucas";"1";"10";"0";"0";"0";"0";"15,00"')
  })
  it('bornes du mois', () => {
    expect(bornesMois('2026-02-14')).toEqual({ du: '2026-02-01', au: '2026-02-28' })
    expect(bornesMois('2026-10-31')).toEqual({ du: '2026-10-01', au: '2026-10-31' })
  })
})
