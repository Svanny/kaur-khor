import type { ReactNode } from 'react';
import { DescriptionText } from '@/components/system/description-text';
import { SaveErrorFlash } from '@/components/system/save-error-flash';
import { SectionLabel } from './sku-detail/section-heading';

export const editorInputClassName = 'h-14 w-full rounded-xl border border-border bg-background px-3 py-2';
export const editorTextareaClassName = 'min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2';
export const editorPanelClassName = 'rounded-[2rem] border border-border/70 bg-background/90 shadow-sm';

type EditorFieldBaseProps = {
  label: string;
  helper?: string;
  hint?: string;
  error?: string;
  errorFlashKey?: number;
  status?: ReactNode;
  children: ReactNode;
};

type EditorFieldProps = EditorFieldBaseProps & (
  | { tooltip?: undefined; helpHref?: undefined }
  | { tooltip: string; helpHref: string }
);

export function EditorField({
  label,
  helper,
  hint,
  error,
  errorFlashKey,
  status,
  tooltip,
  helpHref,
  children,
}: EditorFieldProps) {
  return (
    <label className="grid w-full content-start gap-2 text-sm">
      <span className="flex min-h-8 items-center font-medium text-foreground">
        {tooltip ? <SectionLabel helpHref={helpHref} tooltip={tooltip}>{label}</SectionLabel> : label}
      </span>
      {children}
      {error ? <SaveErrorFlash className="text-xs leading-5 text-destructive" flashKey={errorFlashKey}>{error}</SaveErrorFlash> : null}
      {!error && helper ? <span className="text-xs leading-5 text-muted-foreground">{helper}</span> : null}
      {!error && hint ? <DescriptionText as="span" className="text-xs leading-5 text-muted-foreground">{hint}</DescriptionText> : null}
      {status ? <span className="text-xs leading-5 text-foreground">{status}</span> : null}
    </label>
  );
}
