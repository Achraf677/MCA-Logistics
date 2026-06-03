import type { Client } from './clients.types'

export const CLIENT_TYPE_LABELS: Record<NonNullable<Client['type']>, string> = {
  medical:    'Médical',
  ecommerce:  'E-commerce',
  retail:     'Retail / Palettes',
  particulier:'Particulier',
}

export const CLIENT_TYPE_COLORS: Record<NonNullable<Client['type']>, string> = {
  medical:    'info',
  ecommerce:  'success',
  retail:     'warning',
  particulier:'muted',
}

export function validateSiret(siret: string): boolean {
  return /^\d{14}$/.test(siret.replace(/\s/g, ''))
}

export function getTypeLabel(type: Client['type']): string {
  return type ? CLIENT_TYPE_LABELS[type] : '—'
}

export function countByType(clients: Client[]): Record<string, number> {
  return clients.reduce((acc, c) => {
    const key = c.type ?? 'non_defini'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
