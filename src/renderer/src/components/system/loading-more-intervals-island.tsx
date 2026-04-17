import { useEffect, useState } from 'react';
import { StatusLoadingIcon } from '@icons/status';
import { cn } from '@/lib/utils';

const LOADING_ISLAND_MIN_VISIBLE_MS = 450;

export function LoadingMoreIntervalsIsland({
  className,
  visible,
}: {
  className?: string;
  currentBatch?: number | null;
  totalBatches?: number | null;
  visible: boolean;
}) {
  const [renderVisible, setRenderVisible] = useState(visible);
  const [visibleSince, setVisibleSince] = useState<number | null>(() => (visible ? Date.now() : null));

  useEffect(() => {
    if (visible) {
      setRenderVisible(true);
      setVisibleSince((current) => current ?? Date.now());
      return;
    }
    if (!renderVisible) {
      return;
    }
    const elapsed = visibleSince == null ? LOADING_ISLAND_MIN_VISIBLE_MS : Date.now() - visibleSince;
    const delay = Math.max(0, LOADING_ISLAND_MIN_VISIBLE_MS - elapsed);
    const timeout = window.setTimeout(() => {
      setRenderVisible(false);
      setVisibleSince(null);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [renderVisible, visible, visibleSince]);

  if (!renderVisible) {
    return null;
  }

  const label = 'Loading data';

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] md:bottom-6 md:left-[calc(var(--sidebar-width)+1.5rem)] md:group-data-[collapsible=icon]:left-[calc(var(--sidebar-width-icon)+1.5rem)]',
        className,
      )}
      data-slot="loading-more-intervals"
    >
      <div className="inline-flex items-center gap-3 rounded-[1.2rem] border border-[rgba(95,61,39,0.28)] bg-[rgba(63,39,25,0.96)] px-4 py-3 text-sm font-medium text-[rgba(255,248,241,0.98)] shadow-[0_20px_44px_rgba(48,31,20,0.28)] backdrop-blur-[14px]">
        <StatusLoadingIcon className="size-4 animate-spin text-[rgba(255,232,209,0.95)]" />
        <span>{label}</span>
      </div>
    </div>
  );
}
