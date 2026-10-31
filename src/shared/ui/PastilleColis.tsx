import { Package } from 'lucide-react'

export function PastilleColis({ n, grand = false }: { n: number; grand?: boolean }) {
  const plusieurs = n > 1
  return (
    <span className={`shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full font-bold tabular-nums leading-none ${
      grand ? 'px-3.5 py-1.5 text-2xl' : 'px-3 py-1 text-xl'} ${
      plusieurs ? 'bg-[var(--brand)] text-white shadow-sm' : 'bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-[var(--text)]'}`}
      aria-label={`${n} colis`}>
      <Package size={grand ? 20 : 16} aria-hidden /> {n}
      <span className={`font-semibold opacity-80 ${grand ? 'text-base' : 'text-sm'}`}>colis</span>
    </span>
  )
}
