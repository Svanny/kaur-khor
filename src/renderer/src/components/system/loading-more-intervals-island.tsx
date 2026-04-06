import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingMoreIntervalsIsland({
  className,
  currentBatch,
  totalBatches,
  visible,
}: {
  className?: string;
  currentBatch?: number | null;
  totalBatches?: number | null;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  const showsBatchProgress =
    typeof currentBatch === 'number' &&
    typeof totalBatches === 'number' &&
    totalBatches > 1;
  const label = 'Loading data';
  const progressLabel = showsBatchProgress
    ? `[${Math.max(1, currentBatch)}/${totalBatches}]`
    : null;

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] md:bottom-6 md:left-[calc(var(--sidebar-width)+1.5rem)] md:group-data-[collapsible=icon]:left-[calc(var(--sidebar-width-icon)+1.5rem)]',
        className,
      )}
      data-slot="loading-more-intervals"
    >
      <div className="inline-flex items-center gap-3 rounded-[1.2rem] border border-[rgba(95,61,39,0.28)] bg-[rgba(63,39,25,0.96)] px-4 py-3 text-sm font-medium text-[rgba(255,248,241,0.98)] shadow-[0_20px_44px_rgba(48,31,20,0.28)] backdrop-blur-[14px]">
        <LoaderCircle className="size-4 animate-spin text-[rgba(255,232,209,0.95)]" />
        <span>{label}</span>
        {progressLabel ? <span className="pl-2 text-right tabular-nums">{progressLabel}</span> : null}
      </div>
    </div>
  );
}
