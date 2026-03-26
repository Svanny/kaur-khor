import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export function PageSection({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export function Surface({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-border/80 bg-card/90 p-5 shadow-[0_1px_0_rgba(255,255,255,0.75),0_20px_60px_rgba(76,58,40,0.08)] backdrop-blur xl:p-6',
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <Surface
      className={cn(
        'relative overflow-hidden bg-gradient-to-br from-card via-card to-accent/35',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-64 bg-[radial-gradient(circle_at_top,rgba(188,128,83,0.26),transparent_55%)] lg:block" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl space-y-2">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {(actions || aside) ? (
          <div className="flex w-full flex-col gap-4 xl:max-w-sm xl:items-end">
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
            {aside}
          </div>
        ) : null}
      </div>
    </Surface>
  );
}

export function MetricStrip({
  items,
  className,
}: {
  items: Array<{ label: string; value: ReactNode; caption?: string }>;
  className?: string;
}) {
  return (
    <Surface className={cn('grid gap-0 overflow-hidden p-0 md:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((item, index) => (
        <div key={item.label} className="flex min-h-30 flex-col justify-between gap-3 p-5 xl:p-6">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {item.label}
            </p>
            <p className="text-3xl font-semibold tracking-tight">{item.value}</p>
          </div>
          {item.caption ? (
            <p className="text-sm leading-6 text-muted-foreground">{item.caption}</p>
          ) : null}
          {index < items.length - 1 ? (
            <Separator className="absolute hidden md:block" />
          ) : null}
        </div>
      ))}
    </Surface>
  );
}

export function SaveHeader({
  title,
  description,
  hasChanges,
  isSaving,
  backLabel,
  cancelLabel,
  saveLabel,
  savedLabel,
  unsavedLabel,
  onBack,
  onCancel,
  onSave,
  formId,
}: {
  title: string;
  description?: string;
  hasChanges: boolean;
  isSaving: boolean;
  backLabel?: string;
  cancelLabel: string;
  saveLabel: string;
  savedLabel: string;
  unsavedLabel: string;
  onBack: () => void;
  onCancel: () => void;
  onSave?: () => void;
  formId?: string;
}) {
  return (
    <Surface className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button className="h-10 rounded-full px-4" size="sm" type="button" variant="outline" onClick={onBack}>
              <ArrowLeft className="size-4" />
              <span>{backLabel ?? cancelLabel}</span>
            </Button>
            <Badge
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                hasChanges
                  ? 'bg-accent text-accent-foreground'
                  : 'border-border bg-background text-muted-foreground',
              )}
              variant="outline"
            >
              <CheckCircle2 className="mr-1 size-3.5" />
              {hasChanges ? unsavedLabel : savedLabel}
            </Badge>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button className="rounded-full px-5" type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className="rounded-full px-5"
            disabled={!hasChanges || isSaving}
            form={formId}
            type={formId ? 'submit' : 'button'}
            onClick={formId ? undefined : onSave}
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </Surface>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Surface className="flex flex-col items-start gap-4 border-dashed">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </Surface>
  );
}
