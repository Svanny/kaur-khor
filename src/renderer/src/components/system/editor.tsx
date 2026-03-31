import type { ReactNode } from 'react';
import { Save } from 'lucide-react';
import { DescriptionText, hasDescriptionText } from '@/components/system/description-text';
import { RouteBackButton } from '@/components/system/page-navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function EditorHeader({
  backLabel,
  cancelLabel,
  saveLabel,
  title,
  titleMeta,
  description,
  statusDetail,
  statusLabel,
  meta,
  disableCancel,
  disableSave,
  isSaving,
  formId,
  onBack,
  onCancel,
  onSave,
}: {
  backLabel?: string;
  cancelLabel: string;
  saveLabel: string;
  title?: string;
  titleMeta?: ReactNode;
  description?: string;
  statusDetail?: string;
  statusLabel?: string;
  meta?: ReactNode;
  disableCancel?: boolean;
  disableSave?: boolean;
  isSaving: boolean;
  formId?: string;
  onBack?: () => void;
  onCancel: () => void;
  onSave?: () => void;
}) {
  const showDescription = hasDescriptionText(description);

  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className={cn('flex min-w-0 flex-1 flex-col gap-3', !showDescription && 'gap-2')}>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {onBack && backLabel ? (
              <RouteBackButton onClick={onBack} />
            ) : null}
            {title ? (
              <div className="min-w-0 font-heading text-base font-medium tracking-[-0.02em] text-foreground">
                {title}
              </div>
            ) : null}
            {titleMeta ? <div className="min-w-0">{titleMeta}</div> : null}
            {meta ? <div className="min-w-0">{meta}</div> : null}
          </div>
          {showDescription ? (
            <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </DescriptionText>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {statusLabel ? (
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{statusLabel}</p>
              {statusDetail ? (
                <p className="text-xs text-muted-foreground">{statusDetail}</p>
              ) : null}
            </div>
          ) : null}
          <Button disabled={disableCancel} type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            disabled={isSaving || disableSave}
            form={formId}
            type={formId ? 'submit' : 'button'}
            onClick={formId ? undefined : onSave}
          >
            <Save data-icon="inline-start" />
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EditorRail({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-white/70">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hasDescriptionText(description) ? (
          <DescriptionText className="text-sm text-muted-foreground">{description}</DescriptionText>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
