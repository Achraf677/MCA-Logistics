interface SkeletonProps {
  className?: string
  rows?: number
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded-[var(--r-md)] bg-[var(--bg-card)] animate-pulse ${className}`}
      aria-hidden="true"
    />
  )
}

export function SkeletonTable({ rows = 5 }: SkeletonProps) {
  return (
    <div className="flex flex-col gap-2" aria-label="Chargement…" aria-busy="true">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

export function SkeletonCards({ rows = 4 }: SkeletonProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Chargement…" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  )
}

export function SkeletonKpis({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  )
}
