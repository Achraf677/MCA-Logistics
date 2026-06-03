export type EcheanceStatus = 'ok' | 'soon' | 'overdue' | 'none'

export interface EcheanceResult {
  daysLeft: number | null
  status: EcheanceStatus
}

export function computeEcheance(
  date: string | null,
  today = new Date(),
  soonDays = 30
): EcheanceResult {
  if (!date) return { daysLeft: null, status: 'none' }

  const expiry = new Date(date)
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const expiryMidnight = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate())

  const msPerDay = 1000 * 60 * 60 * 24
  const daysLeft = Math.round((expiryMidnight.getTime() - todayMidnight.getTime()) / msPerDay)

  let status: EcheanceStatus
  if (daysLeft < 0) {
    status = 'overdue'
  } else if (daysLeft <= soonDays) {
    status = 'soon'
  } else {
    status = 'ok'
  }

  return { daysLeft, status }
}
