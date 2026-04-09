import type { ReactNode } from 'react';
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
import { cn } from '@/lib/utils';
import { DescriptionText, hasDescriptionText, useDescriptionTextVisible } from '@/components/system/description-text';
import { FloatingTitleActionsIsland, headerActionSurfaceClassName, useFloatingTitleActions } from '@/components/system/floating-title-actions';
import { usePreferences } from '@/state/preferences';

export function WorkspacePage({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { showFloatingTitleActions } = usePreferences();

  return (
    <div
      className={cn(
        'flex flex-col gap-6',
        showFloatingTitleActions && 'pb-32 md:pb-36',
        className,
      )}
      {...props}
    />
  );
}

export function WorkspacePageTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('text-4xl font-semibold tracking-[-0.05em] text-foreground', className)}>
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
}: WorkspaceTitleCardProps) {
  const descriptionVisible = useDescriptionTextVisible();
  const resolvedDescriptor = descriptor ?? description;
  const showDescription = hasDescriptionText(resolvedDescriptor, descriptionVisible);
  const { showFloatingTitleActions } = usePreferences();
  const resolvedFloatingActions = floatingActions ?? actions;
  const { anchorRef, visible } = useFloatingTitleActions(Boolean(resolvedFloatingActions) && showFloatingTitleActions);

  return (
    <div ref={anchorRef}>
      <Card className={cn('hero-mesh relative overflow-hidden border-white/70', !showDescription && 'gap-4', className)}>
        <CardHeader className={cn('relative gap-4', !showDescription && 'gap-2')}>
          <div className={cn('flex flex-col gap-3', !showDescription && 'gap-2')}>
            {eyebrow ? (
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-primary/85">
                {eyebrow}
              </p>
            ) : null}
            <div className="flex min-w-0 max-w-none flex-col gap-3">
              <CardTitle className="text-3xl tracking-[-0.04em] sm:text-4xl">
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
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)}>{children}</div>;
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
        <CardDescription className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </CardDescription>
        <CardTitle className="text-3xl tracking-[-0.04em]">{value}</CardTitle>
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

export function MetricStrip({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid gap-0 overflow-hidden rounded-[1.5rem] border border-border/50 bg-background/35 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
      {...props}
    />
  );
}

export function MetricStripItem({
  label,
  value,
  detail,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 px-5 py-4 sm:px-6 sm:py-5',
        'border-t border-border/50 first:border-t-0 sm:odd:border-t-0 xl:border-t-0 xl:border-l xl:first:border-l-0',
        className,
      )}
    >
      <p className="text-[0.72rem] font-medium tracking-[0.08em] text-muted-foreground/80">
        {label}
      </p>
      <p
        className={cn(
          'min-w-0 max-w-full text-3xl font-semibold leading-none tracking-[-0.04em] text-foreground [font-variant-numeric:tabular-nums]',
          valueClassName,
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="min-w-0 text-sm leading-5 text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
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
}) {
  const descriptionVisible = useDescriptionTextVisible();
  const resolvedDescriptor = descriptor ?? description;
  const showDescription = forceDescription
    ? resolvedDescriptor != null && resolvedDescriptor !== false && (typeof resolvedDescriptor !== 'string' || resolvedDescriptor.trim().length > 0)
    : hasDescriptionText(resolvedDescriptor, descriptionVisible);
  const showHint = hasDescriptionText(hint, descriptionVisible);
  const hasHeader = Boolean(title || showDescription || action);
  const hasContent = children != null;

  return (
    <Card className={cn('border-white/70', !showDescription && hasHeader && 'gap-4', className)}>
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
      {footer ? <CardFooter className="border-t border-border/60">{footer}</CardFooter> : null}
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
    <p className={cn('text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground', className)}>
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
    <Button className="rounded-full px-4" variant={variant}>
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
