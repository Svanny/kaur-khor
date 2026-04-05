import { cn } from '@/lib/utils';

export const RIGHT_RAIL_ASIDE_CLASS_NAME = 'grid gap-4 lg:sticky lg:top-6 lg:self-start';

export function rightRailLayoutClassName(showRightRailCards: boolean) {
  return cn(
    'grid gap-6',
    showRightRailCards && 'lg:grid-cols-[minmax(0,1fr)_320px]',
  );
}
