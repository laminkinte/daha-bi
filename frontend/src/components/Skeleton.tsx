export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--gridline)] ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-3 w-16" />
      <Skeleton className="mt-4 h-48 w-full" />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3">
      <div className="flex-1">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-2 h-3 w-24" />
      </div>
      <Skeleton className="h-7 w-16" />
    </div>
  );
}
