import { describe, it, expect } from 'vitest'
import { kpiSummaryUnifie } from './encaissement.logic'

describe('kpiSummaryUnifie', () => {
  it('« non identifié » n’est pas additionné aux autres entrées (double comptage)', () => {
    const k = kpiSummaryUnifie([
      { key: 'a', date: '2026-10-01', libelle: 'Client X', montant_cts: 1000, nature: 'client' },
      { key: 'b', date: '2026-10-01', libelle: 'Virement', montant_cts: 1000, nature: 'non_identifie' },
      { key: 'c', date: '2026-10-01', libelle: 'Apport', montant_cts: 500, nature: 'apport' },
    ] as never)
    expect(k).toEqual({ totalClientsCts: 1000, totalAutresCts: 500, totalNonIdentifieCts: 1000, nbNonIdentifies: 1 })
  })
})
