import type { ReactNode } from 'react';
import { ArrowLeft, Save, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function EditorHeader({
  title,
  description,
  saveState,
  entityId,
  backLabel,
  cancelLabel,
  saveLabel,
  isSaving,
  formId,
  onBack,
  onCancel,
  onSave,
}: {
  title: string;
  description?: string;
  saveState: 'saved' | 'unsaved';
  entityId?: string;
  backLabel: string;
  cancelLabel: string;
  saveLabel: string;
  isSaving: boolean;
  formId?: string;
  onBack: () => void;
  onCancel: () => void;
  onSave?: () => void;
}) {
  return (
    <Card className="hero-mesh border-white/70">
      <CardHeader className="gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" type="button" variant="outline" onClick={onBack}>
              <ArrowLeft data-icon="inline-start" />
              {backLabel}
            </Button>
            <Badge
              className={cn(
                'rounded-full px-3 py-1',
                saveState === 'unsaved'
                  ? 'border-transparent bg-accent text-accent-foreground'
                  : 'bg-background/70 text-muted-foreground',
              )}
              variant="outline"
            >
              <Sparkles className="mr-1 size-3.5" />
              {saveState === 'unsaved' ? 'Draft' : 'Synced'}
            </Badge>
            {entityId ? (
              <Badge className="rounded-full px-3 py-1 font-mono text-[0.72rem]" variant="secondary">
                {entityId}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <CardTitle className="text-3xl tracking-[-0.04em]">{title}</CardTitle>
            {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            disabled={isSaving || saveState === 'saved'}
            form={formId}
            type={formId ? 'submit' : 'button'}
            onClick={formId ? undefined : onSave}
          >
            <Save data-icon="inline-start" />
            {saveLabel}
          </Button>
        </div>
      </CardHeader>
    </Card>
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
