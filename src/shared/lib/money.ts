export function centimesToEuros(cts: number): number {
  return cts / 100
}

export function eurosToCentimes(euros: number): number {
  return Math.round(euros * 100)
}

export function formatMoney(cts: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cts / 100)
}

export function addTva(ht_cts: number, rate: number): number {
  return Math.round(ht_cts * (1 + rate))
}
