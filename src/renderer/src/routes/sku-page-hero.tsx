import type { ReactNode } from 'react';
import { FloatingTitleActionsIsland, headerActionSurfaceClassName, useFloatingTitleActions } from '@/components/system/floating-title-actions';
import { RouteBackButton } from '@/components/system/page-navigation';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { usePreferences } from '@/state/preferences';

export function SkuPageHero({
  title,
  actions,
  badges,
  onBack,
  children,
}: {
  title: string;
  actions?: ReactNode;
  badges?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const { showFloatingTitleActions } = usePreferences();
  const { anchorRef, visible } = useFloatingTitleActions(Boolean(actions) && showFloatingTitleActions);

  return (
    <div ref={anchorRef}>
      <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem]`}>
        <div className="border-b border-border/60 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <RouteBackButton onClick={onBack} />
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-[-0.04em] text-foreground">{title}</h1>
              </div>
            </div>
            {actions ? (
              <div className={`flex flex-wrap items-center justify-start gap-2 lg:justify-end ${headerActionSurfaceClassName}`}>
                {actions}
              </div>
            ) : null}
          </div>
        </div>

        {(badges || children) ? (
          <div className="px-6 py-5">
            {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
            {children}
          </div>
        ) : null}
      </section>
      <FloatingTitleActionsIsland actions={actions} visible={visible} />
    </div>
  );
}
