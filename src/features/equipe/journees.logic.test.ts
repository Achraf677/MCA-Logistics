import { describe, it, expect } from 'vitest'
import {
  ecarts, nombresSaisis, versSaisie, anciennete, envoiAncien, filtrerJournees, optionsDistinctes,
  confirmationRetapee, motifValide, changementsHistorique, rapportParJour, nomFichierRapport,
  bornesPeriode, libellePeriode, tarifSaisiCts, tarifEnTexte, declares, totalRapport,
} from './journees.logic'
import { rapportParSalarie, type JourneeColis } from '../../shared/lib/journeesColis'

const j = (p: Partial<JourneeColis> = {}): JourneeColis => ({
  id: 'j1', company_id: 'c1', member_id: 'm1', date: '2026-10-12', client_id: 'cl1',
  colis_domicile: 10, colis_relais: 5, colis_litige: 0, litige_raison: null, note: null,
  statut: 'envoyee', domicile_valide: null, relais_valide: null, litige_valide: null,
  motif_refus: null, motif_modification: null, envoyee_le: null, valide_par: null, valide_le: null,
  created_at: '', updated_at: '', clients: { name: 'D FAST' }, team_members: { full_name: 'Mohammed' }, ...p,
})

describe('écarts déclaré → validé', () => {
  it('aucun écart quand identique', () => {
    expect(ecarts(declares(j()), { domicile: 10, relais: 5, litige: 0 })).toEqual([])
  })
  it('liste les champs qui changent', () => {
    expect(ecarts(declares(j()), { domicile: 9, relais: 5, litige: 1 })).toEqual([
      { champ: 'domicile', avant: 10, apres: 9 },
      { champ: 'litige', avant: 0, apres: 1 },
    ])
  })
})

describe('saisie des nombres validés', () => {
  it('entiers positifs seulement, vide refusé', () => {
    expect(nombresSaisis({ domicile: '3', relais: ' 0 ', litige: '12' })).toEqual({ domicile: 3, relais: 0, litige: 12 })
    expect(nombresSaisis({ domicile: '', relais: '0', litige: '0' })).toBeNull()
    expect(nombresSaisis({ domicile: '-1', relais: '0', litige: '0' })).toBeNull()
    expect(nombresSaisis({ domicile: '1,5', relais: '0', litige: '0' })).toBeNull()
  })
  it('pré-remplissage en texte', () => {
    expect(versSaisie({ domicile: 1, relais: 2, litige: 0 })).toEqual({ domicile: '1', relais: '2', litige: '0' })
  })
})

describe('ancienneté de l’envoi', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  it('libellés', () => {
    expect(anciennete(null, now)).toBe('date d’envoi inconnue')
    expect(anciennete('2026-10-12T11:59:40Z', now)).toBe('à l’instant')
    expect(anciennete('2026-10-12T11:15:00Z', now)).toBe('il y a 45 min')
    expect(anciennete('2026-10-12T09:00:00Z', now)).toBe('il y a 3 h')
    expect(anciennete('2026-10-10T09:00:00Z', now)).toBe('il y a 2 j')
  })
  it('signale au-delà de 48 h', () => {
    expect(envoiAncien('2026-10-10T11:00:00Z', now)).toBe(true)
    expect(envoiAncien('2026-10-11T11:00:00Z', now)).toBe(false)
    expect(envoiAncien(null, now)).toBe(false)
  })
})

describe('filtres', () => {
  const liste = [j(), j({ id: 'j2', member_id: 'm2', team_members: { full_name: 'Achraf' }, statut: 'validee' }),
    j({ id: 'j3', client_id: 'cl2', clients: { name: 'Autre' } })]
  it('salarié, client, statut', () => {
    expect(filtrerJournees(liste, { memberId: 'm2' }).map(x => x.id)).toEqual(['j2'])
    expect(filtrerJournees(liste, { clientId: 'cl2' }).map(x => x.id)).toEqual(['j3'])
    expect(filtrerJournees(liste, { statut: 'envoyee' }).map(x => x.id)).toEqual(['j1', 'j3'])
    expect(filtrerJournees(liste, {}).length).toBe(3)
  })
  it('options distinctes triées', () => {
    expect(optionsDistinctes(liste, 'member')).toEqual([{ id: 'm2', nom: 'Achraf' }, { id: 'm1', nom: 'Mohammed' }])
    expect(optionsDistinctes(liste, 'client').map(o => o.nom)).toEqual(['Autre', 'D FAST'])
  })
})

describe('garde de suppression', () => {
  it('nom retapé (accents, casse, espaces ignorés)', () => {
    expect(confirmationRetapee('  jérôme   martin ', 'Jerome Martin', '2026-10-12')).toBe(true)
    expect(confirmationRetapee('Jerome', 'Jerome Martin', '2026-10-12')).toBe(false)
  })
  it('date retapée en français ou ISO', () => {
    expect(confirmationRetapee('12/10/2026', 'X', '2026-10-12')).toBe(true)
    expect(confirmationRetapee('2026-10-12', 'X', '2026-10-12')).toBe(true)
    expect(confirmationRetapee('12/10/26', 'X', '2026-10-12')).toBe(false)
    expect(confirmationRetapee('', '', '2026-10-12')).toBe(false)
  })
  it('motif de 5 caractères minimum', () => {
    expect(motifValide('  ok  ')).toBe(false)
    expect(motifValide('Erreur de saisie')).toBe(true)
  })
})

describe('historique lisible', () => {
  it('seuls les champs suivis qui changent', () => {
    const c = changementsHistorique({
      avant: { statut: 'validee', domicile_valide: 10, updated_at: 'a' },
      apres: { statut: 'validee', domicile_valide: 8, updated_at: 'b' },
    })
    expect(c).toEqual([{ libelle: 'Domicile validé', avant: '10', apres: '8' }])
  })
  it('statut traduit, création sans « avant »', () => {
    const c = changementsHistorique({ avant: { statut: 'envoyee' }, apres: { statut: 'validee' } },
      s => (s === 'validee' ? 'Validée' : 'Envoyée'))
    expect(c).toEqual([{ libelle: 'Statut', avant: 'Envoyée', apres: 'Validée' }])
    expect(changementsHistorique({ avant: null, apres: { statut: 'envoyee' } })).toEqual([])
  })
})

describe('vue par jour', () => {
  it('regroupe par date, retient le validé, exclut les brouillons', () => {
    const lignes = rapportParJour([
      j({ date: '2026-10-02', statut: 'validee', domicile_valide: 8, relais_valide: 5, litige_valide: 0 }),
      j({ id: 'b', date: '2026-10-02', client_id: 'cl2', colis_domicile: 2, colis_relais: 0 }),
      j({ id: 'c', date: '2026-10-01', statut: 'brouillon' }),
      j({ id: 'd', date: '2026-10-01', statut: 'refusee', colis_litige: 1 }),
    ])
    expect(lignes).toEqual([
      { date: '2026-10-01', journees: 1, domicile: 10, relais: 5, litige: 1, nonValidees: 1 },
      { date: '2026-10-02', journees: 2, domicile: 10, relais: 5, litige: 0, nonValidees: 1 },
    ])
  })
})

describe('période et export', () => {
  it('nom du fichier', () => {
    expect(nomFichierRapport('2026-10')).toBe('rapport-colis-2026-10.csv')
  })
  it('bornes jour / mois', () => {
    expect(bornesPeriode('mois', '2026-02')).toEqual({ du: '2026-02-01', au: '2026-02-28' })
    expect(bornesPeriode('mois', '2028-02')).toEqual({ du: '2028-02-01', au: '2028-02-29' })
    expect(bornesPeriode('jour', '2026-10-12')).toEqual({ du: '2026-10-12', au: '2026-10-12' })
    expect(bornesPeriode('mois', '2026-13')).toBeNull()
    expect(bornesPeriode('jour', '')).toBeNull()
  })
  it('libellé', () => {
    expect(libellePeriode('mois', '2026-10')).toBe('octobre 2026')
    expect(libellePeriode('jour', '2026-10-12')).toBe('12/10/2026')
  })
})

describe('total général du rapport', () => {
  it('additionne le validé, signale les tarifs manquants', () => {
    const lignes = rapportParSalarie([
      j({ statut: 'validee', domicile_valide: 10, relais_valide: 5, litige_valide: 1 }),
      j({ id: 'k', member_id: 'm2', statut: 'validee', colis_domicile: 4, colis_relais: 0 }),
      j({ id: 'l', member_id: 'm2', statut: 'envoyee' }),
    ], [
      { id: 'm1', full_name: 'Mohammed', tarif_domicile_cts: 120, tarif_relais_cts: 80 },
      { id: 'm2', full_name: 'Achraf', tarif_domicile_cts: null, tarif_relais_cts: null },
    ])
    expect(totalRapport(lignes)).toEqual({
      domicile: 14, relais: 5, litige: 1, enAttente: 1, aCorriger: 0, du_cts: 1600, tarifsManquants: ['Achraf'],
    })
  })
})

describe('tarifs au colis', () => {
  it('euros → centimes, vide = null, illisible signalé', () => {
    expect(tarifSaisiCts('1,20')).toBe(120)
    expect(tarifSaisiCts('0.8')).toBe(80)
    expect(tarifSaisiCts('  ')).toBeNull()
    expect(tarifSaisiCts('abc')).toBe('invalide')
  })
  it('centimes → texte', () => {
    expect(tarifEnTexte(120)).toBe('1,20')
    expect(tarifEnTexte(null)).toBe('')
  })
})
