import { describe, it, expect } from 'vitest'
import { compteursJustificatifs, etatJustificatif, filtrerJustificatifs, jourJustif, type JustifLigne } from './justificatifs.logic'

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
})
