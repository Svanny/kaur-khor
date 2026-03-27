import type { ReactNode } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function EditorHeader({
  backLabel,
  cancelLabel,
  saveLabel,
  isSaving,
  formId,
  onBack,
  onCancel,
  onSave,
}: {
  backLabel?: string;
  cancelLabel: string;
  saveLabel: string;
  isSaving: boolean;
  formId?: string;
  onBack?: () => void;
  onCancel: () => void;
  onSave?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {onBack && backLabel ? (
          <Button
            aria-label={backLabel}
            size="icon-sm"
            title={backLabel}
            type="button"
            variant="ghost"
            onClick={onBack}
          >
            <ArrowLeft />
            <span className="sr-only">{backLabel}</span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          disabled={isSaving}
          form={formId}
          type={formId ? 'submit' : 'button'}
          onClick={formId ? undefined : onSave}
        >
          <Save data-icon="inline-start" />
          {saveLabel}
        </Button>
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
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
