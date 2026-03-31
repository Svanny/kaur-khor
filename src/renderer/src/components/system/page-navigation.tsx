import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { WorkspacePageTitle } from '@/components/system/workspace';

export function RouteBackButton({
  className,
  disabled,
  onClick,
}: {
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const { t } = usePreferences();
  const { canGoBack, goBack } = useNavigationHistory();
  const shouldRender = onClick != null || disabled != null || canGoBack;
  const isDisabled = disabled ?? (onClick ? false : !canGoBack);

  if (!shouldRender) {
    return null;
  }

  return (
    <Button
      aria-label={t('stockSessionBack')}
      className={cn('size-10 rounded-full p-0', className)}
      disabled={isDisabled}
      title={t('stockSessionBack')}
      type="button"
      variant="ghost"
      onClick={onClick ?? goBack}
    >
      <ArrowLeft className="size-4" />
    </Button>
  );
}

export function PageTitleWithBack({
  children,
  className,
  titleClassName,
}: {
  children: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  const { canGoBack } = useNavigationHistory();

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      {canGoBack ? <RouteBackButton /> : null}
      <WorkspacePageTitle className={titleClassName}>{children}</WorkspacePageTitle>
    </div>
  );
}
