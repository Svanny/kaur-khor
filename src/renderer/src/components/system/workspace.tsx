import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ActionOpenExternalIcon } from '@icons/actions';
import { StatusInsightIcon } from '@icons/status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';
import { compactActionButtonClassName } from '@/components/system/compact-controls';
import { cn } from '@/lib/utils';
import { DescriptionText, hasDescriptionText, useDescriptionTextVisible } from '@/components/system/description-text';
import { FloatingTitleActionsIsland, headerActionSurfaceClassName, useFloatingTitleActions } from '@/components/system/floating-title-actions';
import { usePreferences } from '@/state/preferences';

export function WorkspacePage({
  className,
  fitViewport,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { fitViewport?: boolean }) {
  const { showFloatingTitleActions } = usePreferences();

  return (
    <div
      data-fit-viewport={fitViewport ? 'true' : undefined}
      className={cn(
        'flex w-full flex-col gap-6',
        showFloatingTitleActions && !fitViewport && 'pb-32 md:pb-36',
        fitViewport && 'min-h-0 flex-1',
        className,
      )}
      {...props}
    />
  );
}

export function useWorkspaceWindowMinHeight<T extends HTMLElement>(dependencyKey: string | number | boolean | null = null) {
  const ref = useRef<T | null>(null);
  const [minHeight, setMinHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const windowRoot = ref.current;
    const main = document.getElementById('main-content');
    if (!windowRoot || !main) {
      setMinHeight(null);
      return;
    }

    const updateMinHeight = () => {
      const mainBounds = main.getBoundingClientRect();
      const windowBounds = windowRoot.getBoundingClientRect();
      const nextMinHeight = Math.max(0, Math.floor(mainBounds.bottom - windowBounds.top - 20));
      setMinHeight((current) => (current === nextMinHeight ? current : nextMinHeight));
    };

    const frameId = window.requestAnimationFrame(updateMinHeight);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateMinHeight);
    observer?.observe(main);
    observer?.observe(windowRoot);
    window.addEventListener('resize', updateMinHeight);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', updateMinHeight);
    };
  }, [dependencyKey]);

  return {
    ref,
    style: minHeight != null ? { minHeight } : undefined,
  };
}

export function WorkspacePageTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('khmer-safe-display text-4xl font-semibold tracking-[-0.05em] text-foreground', className)}>
      {children}
    </span>
  );
}

interface WorkspaceTitleCardProps {
  eyebrow?: string;
  title: ReactNode;
  descriptor?: string;
  description?: string;
  actions?: ReactNode;
  floatingActions?: ReactNode;
  children?: ReactNode;
  className?: string;
  helperExemptReason?: string;
}

export function WorkspaceTitleCard({
  eyebrow,
  title,
  descriptor,
  description,
  actions,
  floatingActions,
  children,
  className,
  helperExemptReason,
}: WorkspaceTitleCardProps) {
  const descriptionVisible = useDescriptionTextVisible();
  const resolvedDescriptor = descriptor ?? description;
  const showDescription = hasDescriptionText(resolvedDescriptor, descriptionVisible);
  const { showFloatingTitleActions } = usePreferences();
  const resolvedFloatingActions = floatingActions ?? actions;
  const { anchorRef, visible } = useFloatingTitleActions(Boolean(resolvedFloatingActions) && showFloatingTitleActions);

  return (
    <div ref={anchorRef}>
      <Card
        className={cn('hero-mesh relative overflow-hidden border-white/70', !showDescription && 'gap-4', className)}
        data-helper-exempt={helperExemptReason ?? undefined}
      >
        <CardHeader className={cn('relative gap-4', !showDescription && 'gap-2')}>
          <div className={cn('flex flex-col gap-3', !showDescription && 'gap-2')}>
            {eyebrow ? (
              <p className="khmer-safe-eyebrow text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-primary/85">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex min-w-0 max-w-none flex-col gap-3">
              <CardTitle className="khmer-safe-display text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
                {title}
              </CardTitle>
              {showDescription ? (
                <CardDescription className="min-w-0 max-w-none text-sm leading-6 sm:text-base">
                  <DescriptionText as="div">
                    {resolvedDescriptor}
                  </DescriptionText>
                </CardDescription>
              ) : null}
            </div>
          </div>
          {actions ? <CardAction className={cn('static col-auto row-auto', headerActionSurfaceClassName)}>{actions}</CardAction> : null}
        </CardHeader>
        {children ? <CardContent className="relative">{children}</CardContent> : null}
      </Card>
      <FloatingTitleActionsIsland actions={resolvedFloatingActions} visible={visible} />
    </div>
  );
}

export function WorkspaceHero(props: WorkspaceTitleCardProps) {
  return <WorkspaceTitleCard {...props} />;
}

export function WorkspaceActionRow({
  className,
  children,
  wrap = true,
}: {
  className?: string;
  children: ReactNode;
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2',
        wrap ? 'flex-wrap' : 'max-w-full flex-nowrap overflow-x-auto overscroll-contain',
        className,
      )}
      data-nowrap={wrap ? undefined : 'true'}
    >
      {children}
    </div>
  );
}

export function MetricGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}
      {...props}
    />
  );
}

export function MetricCard({
  label,
  value,
  detail,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  emphasis?: ReactNode;
}) {
  return (
    <Card className="border-white/70">
      <CardHeader className="gap-1">
        <CardDescription className="khmer-safe-label text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </CardDescription>
        <CardTitle className="khmer-safe-display text-3xl tracking-[-0.04em]">{value}</CardTitle>
      </CardHeader>
      {detail || emphasis ? (
        <CardFooter className="justify-between gap-3 border-t border-border/60 pt-4 text-sm text-muted-foreground">
          <span>{detail}</span>
          {emphasis ? <span className="text-foreground">{emphasis}</span> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function WorkspacePanel({
  title,
  descriptor,
  hint,
  description,
  action,
  children,
  className,
  contentClassName,
  footer,
  forceDescription = false,
  helperExemptReason,
  hideWhenEmpty = false,
  style,
}: {
  title?: ReactNode;
  descriptor?: ReactNode;
  hint?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
  forceDescription?: boolean;
  helperExemptReason?: string;
  hideWhenEmpty?: boolean;
  style?: CSSProperties;
}) {
  const descriptionVisible = useDescriptionTextVisible();
  const resolvedDescriptor = descriptor ?? description;
  const showDescription = forceDescription
    ? resolvedDescriptor != null && resolvedDescriptor !== false && (typeof resolvedDescriptor !== 'string' || resolvedDescriptor.trim().length > 0)
    : hasDescriptionText(resolvedDescriptor, descriptionVisible);
  const showHint = hasDescriptionText(hint, descriptionVisible);
  const hasHeader = Boolean(title || showDescription || action);
  const hasContent = children != null;
  const hasFooter = footer != null;

  if (hideWhenEmpty && !hasContent && !hasFooter) {
    return null;
  }

  return (
    <Card
      className={cn('border-white/70', !showDescription && hasHeader && 'gap-4', className)}
      data-helper-exempt={helperExemptReason ?? undefined}
      style={style}
    >
      {hasHeader ? (
        <CardHeader className={cn(!showDescription && 'gap-0')}>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {showDescription ? (
            <CardDescription>
              {forceDescription ? resolvedDescriptor : <DescriptionText as="div">{resolvedDescriptor}</DescriptionText>}
            </CardDescription>
          ) : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      {hasContent ? (
        <CardContent className={cn('flex flex-col gap-6', !showDescription && hasHeader && 'pt-0', contentClassName)}>
          {children}
          {showHint ? <DescriptionText as="div" className="-mt-2 text-sm text-muted-foreground">{hint}</DescriptionText> : null}
        </CardContent>
      ) : null}
      {hasFooter ? <CardFooter className="border-t border-border/60">{footer}</CardFooter> : null}
    </Card>
  );
}

export function WorkspaceBanner({
  title,
  description,
  tone = 'default',
  icon,
  action,
}: {
  title: string;
  description: ReactNode;
  tone?: 'default' | 'destructive';
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const descriptionVisible = useDescriptionTextVisible();
  return (
    <Alert variant={tone}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {hasDescriptionText(description, descriptionVisible) ? (
        <AlertDescription>
          <DescriptionText as="div">{description}</DescriptionText>
        </AlertDescription>
      ) : null}
      {action ? <div data-slot="alert-action">{action}</div> : null}
    </Alert>
  );
}

export function WorkspaceEmpty({
  title,
  hint,
  description,
  action,
}: {
  title: string;
  hint?: string;
  description?: string;
  action?: ReactNode;
}) {
  const descriptionVisible = useDescriptionTextVisible();
  const resolvedHint = hint ?? description;
  const showDescription = hasDescriptionText(resolvedHint, descriptionVisible);

  return (
    <Empty className={cn('border-border/80 bg-card/45', !showDescription && 'gap-3 p-10')}>
      <EmptyHeader className={cn(!showDescription && 'gap-1')}>
        <EmptyMedia variant="icon">
          <StatusInsightIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {showDescription ? (
          <EmptyDescription>
            <DescriptionText as="div">{resolvedHint}</DescriptionText>
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn('khmer-safe-label text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground', className)}>
      {children}
    </p>
  );
}

export function ActionButtonLink({
  children,
  variant = 'outline',
}: {
  children: ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}) {
  return (
    <Button className={compactActionButtonClassName} variant={variant}>
      {children}
      <ActionOpenExternalIcon data-icon="inline-end" />
    </Button>
  );
}

export function StatusBadge({
  children,
  variant = 'outline',
}: {
  children: ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
}) {
  return (
    <Badge className="rounded-full px-3 py-1 text-xs font-medium" variant={variant}>
      {children}
    </Badge>
  );
}
