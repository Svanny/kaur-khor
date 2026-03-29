import type { ReactNode } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
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
import { DescriptionText, hasDescriptionText } from '@/components/system/description-text';

export function WorkspacePage({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-6', className)} {...props} />;
}

export function WorkspaceHero({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const showDescription = hasDescriptionText(description);

  return (
    <Card className={cn('hero-mesh relative overflow-hidden border-white/70', !showDescription && 'gap-4', className)}>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-64 bg-[radial-gradient(circle_at_top,rgba(189,124,81,0.2),transparent_60%)] lg:block" />
      <CardHeader className={cn('relative gap-4', !showDescription && 'gap-2')}>
        <div className={cn('flex flex-col gap-3', !showDescription && 'gap-2')}>
          {eyebrow ? (
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-primary/85">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex max-w-3xl flex-col gap-3">
            <CardTitle className="text-3xl tracking-[-0.04em] sm:text-4xl">
              {title}
            </CardTitle>
            {showDescription ? (
              <CardDescription className="max-w-2xl text-sm leading-6 sm:text-base">
                <DescriptionText as="div">
                  {description}
                </DescriptionText>
              </CardDescription>
            ) : null}
          </div>
        </div>
        {actions ? <CardAction className="static col-auto row-auto">{actions}</CardAction> : null}
      </CardHeader>
      {children ? <CardContent className="relative">{children}</CardContent> : null}
    </Card>
  );
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
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
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
      <p className="text-3xl font-semibold tracking-[-0.04em] text-foreground [font-variant-numeric:tabular-nums]">
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
  description,
  action,
  children,
  className,
  contentClassName,
  footer,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
}) {
  const showDescription = hasDescriptionText(description);
  const hasHeader = Boolean(title || showDescription || action);
  const hasContent = children != null;

  return (
    <Card className={cn('border-white/70', !showDescription && hasHeader && 'gap-4', className)}>
      {hasHeader ? (
        <CardHeader className={cn(!showDescription && 'gap-0')}>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {showDescription ? (
            <CardDescription>
              <DescriptionText as="div">{description}</DescriptionText>
            </CardDescription>
          ) : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      {hasContent ? (
        <CardContent className={cn('flex flex-col gap-6', !showDescription && hasHeader && 'pt-0', contentClassName)}>
          {children}
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
  return (
    <Alert variant={tone}>
      {icon}
      <AlertTitle>{title}</AlertTitle>
      {hasDescriptionText(description) ? (
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
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const showDescription = hasDescriptionText(description);

  return (
    <Empty className={cn('border-border/80 bg-card/45', !showDescription && 'gap-3 p-10')}>
      <EmptyHeader className={cn(!showDescription && 'gap-1')}>
        <EmptyMedia variant="icon">
          <Sparkles />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {showDescription ? (
          <EmptyDescription>
            <DescriptionText as="div">{description}</DescriptionText>
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
      <ArrowUpRight data-icon="inline-end" />
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
