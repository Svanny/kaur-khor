import type { ReactNode } from 'react';
import { SectionLabel } from './sku-detail/section-heading';

export const editorInputClassName = 'h-14 w-full rounded-xl border border-border bg-background px-3 py-2';
export const editorTextareaClassName = 'min-h-28 w-full rounded-xl border border-border bg-background px-3 py-2';
export const editorPanelClassName = 'rounded-[2rem] border border-border/70 bg-background/90 shadow-sm';

export function EditorField({
  label,
  hint,
  tooltip,
  children,
}: {
  label: string;
  hint?: string;
  tooltip?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid w-full content-start gap-2 text-sm">
      <span className="flex min-h-8 items-center font-medium text-foreground">
        {tooltip ? <SectionLabel tooltip={tooltip}>{label}</SectionLabel> : label}
      </span>
      {children}
      {hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
