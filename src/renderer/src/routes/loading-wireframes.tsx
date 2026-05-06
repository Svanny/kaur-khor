import type { ReactNode } from 'react';
import { WorkspaceActionRow, WorkspaceTitleCard } from '@/components/system/workspace';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SkuPageHero } from './sku-page-hero';

export function WireframeRows({
  chartHeightClassName = 'h-28',
  rowCount,
}: {
  chartHeightClassName?: string;
  rowCount: number;
}) {
  return Array.from({ length: rowCount }, (_, index) => (
    <div key={`wireframe-row-${index}`} className="space-y-3 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-40 rounded-full" />
        <Skeleton className="h-4 w-24 rounded-full" />
      </div>
      <Skeleton className={`w-full rounded-[1.4rem] ${chartHeightClassName}`} />
    </div>
  ));
}

export function WireframeRailCards({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div
      key={`wireframe-rail-${index}`}
      className="rounded-[1.4rem] border border-border/60 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(48,31,20,0.07)]"
    >
      <Skeleton className="h-4 w-28 rounded-full" />
      <Skeleton className="mt-4 h-6 w-40 rounded-full" />
      <Skeleton className="mt-2 h-4 w-full rounded-full" />
      <Skeleton className="mt-2 h-4 w-4/5 rounded-full" />
    </div>
  ));
}

export function WorkspaceTitleCardWireframe({
  actions,
  children,
  descriptor,
  eyebrow,
  title,
}: {
  actions?: ReactNode;
  children?: ReactNode;
  descriptor: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <WorkspaceTitleCard
      actions={actions}
      descriptor={descriptor}
      eyebrow={eyebrow}
      title={title}
    >
      {children}
    </WorkspaceTitleCard>
  );
}

export function DetailHeroWireframe({
  actionCount = 4,
  badgeCount = 3,
  headlineWidthClassName = 'w-72',
  ribbonCount = 6,
  showBody = true,
  summaryWidthClassName = 'w-[34rem]',
  title,
}: {
  actionCount?: number;
  badgeCount?: number;
  headlineWidthClassName?: string;
  ribbonCount?: number;
  showBody?: boolean;
  summaryWidthClassName?: string;
  title: string;
}) {
  return (
    <SkuPageHero
      actions={
        <WorkspaceActionRow>
          {Array.from({ length: actionCount }, (_, index) => (
            <Skeleton key={`wireframe-action-${index}`} className="h-10 w-28 rounded-full" />
          ))}
        </WorkspaceActionRow>
      }
      badges={
        <>
          {Array.from({ length: badgeCount }, (_, index) => (
            <Skeleton key={`wireframe-badge-${index}`} className="h-7 w-24 rounded-md" />
          ))}
        </>
      }
      title={title}
    >
      {showBody ? (
        <>
          <div className="mt-7 text-center">
            <Skeleton className="mx-auto h-4 w-28 rounded-full" />
            <Skeleton className={`mx-auto mt-4 h-12 max-w-full rounded-full ${headlineWidthClassName}`} />
            <Skeleton className={`mx-auto mt-4 h-5 max-w-full rounded-full ${summaryWidthClassName}`} />
          </div>

          <div className="mt-6 overflow-hidden rounded-[1rem] border border-border/70 bg-white shadow-[0_10px_24px_rgba(48,31,20,0.06)]">
            <div className="border-b border-border/60 px-4 py-3">
              <Skeleton className="h-4 w-28 rounded-full" />
            </div>
            <div className="grid divide-y divide-border/60 bg-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
              {Array.from({ length: ribbonCount }, (_, index) => (
                <div key={`wireframe-ribbon-${index}`} className="bg-white px-4 py-3">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="mt-2 h-6 w-16 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </SkuPageHero>
  );
}

export function WireframeRightRailLayout({
  children,
  railCount,
  showRightRailCards,
}: {
  children: ReactNode;
  railCount: number;
  showRightRailCards: boolean;
}) {
  return (
    <div className={rightRailLayoutClassName(showRightRailCards)}>
      <div className="grid min-w-0 gap-6">{children}</div>
      {showRightRailCards ? (
        <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] p-4`}>
          <div className="space-y-4">
            <WireframeRailCards count={railCount} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
