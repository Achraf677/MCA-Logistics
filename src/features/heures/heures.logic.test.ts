import { describe, it, expect } from 'vitest'
import { dureeNetteMinutes, passeMinuit, dureeLigne, moisEnCours, kpiSummary } from './heures.logic'
import type { WorkHourRow } from './heures.types'

describe('durée nette', () => {
  it('journée normale, pause déduite', () => {
    expect(dureeNetteMinutes('08:00', '17:30', 60)).toBe(510)
    expect(dureeNetteMinutes('08:00:00', '12:00:00', 0)).toBe(240)
  })
  it('journée qui passe minuit (+24 h)', () => {
    expect(passeMinuit('22:00', '02:00')).toBe(true)
    expect(dureeNetteMinutes('22:00', '02:00', 30)).toBe(210)
  })
  it('heures manquantes ou pause trop longue → null', () => {
    expect(dureeNetteMinutes('', '10:00', 0)).toBeNull()
    expect(dureeNetteMinutes('08:00', '08:00', 0)).toBeNull()
    expect(dureeNetteMinutes('08:00', '09:00', 90)).toBeNull()
  })
  it('ligne de nuit : la valeur négative de la base est ignorée', () => {
    const r = { start_time: '22:00:00', end_time: '02:00:00', break_minutes: 0, total_minutes: -1200 }
    expect(dureeLigne(r)).toBe(240)
    expect(kpiSummary([{ ...r, id: '1', member_id: 'a', delivery_id: null } as WorkHourRow]).totalMinutes).toBe(240)
  })
})

describe('période par défaut', () => {
  it('mois en cours en dates locales', () => {
    expect(moisEnCours(new Date(2026, 9, 12))).toEqual({ date_from: '2026-10-01', date_to: '2026-10-31' })
    expect(moisEnCours(new Date(2028, 1, 3))).toEqual({ date_from: '2028-02-01', date_to: '2028-02-29' })
  })
})
