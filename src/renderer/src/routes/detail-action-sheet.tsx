import type { ReactNode } from 'react';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

export const actionSheetInputClassName =
  'h-14 rounded-xl border-border/70 bg-background px-4 text-sm shadow-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 md:text-sm';
export const actionSheetTextareaClassName =
  'min-h-36 rounded-xl border-border/70 bg-background px-4 py-3 text-sm shadow-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 md:text-sm';
export const actionSheetSelectTriggerClassName =
  'h-14 w-full rounded-xl border-border/70 bg-background px-4 text-sm shadow-none data-[size=default]:h-14';

export function ActionSheetField({
  children,
  description,
  error,
  label,
}: {
  children: ReactNode;
  description?: ReactNode;
  error?: string | null;
  label: string;
}) {
  return (
    <Field data-invalid={Boolean(error)} className="gap-2.5">
      <FieldLabel className="text-sm font-medium text-foreground">{label}</FieldLabel>
      <FieldContent className="gap-2">
        {children}
        {description ? <FieldDescription className="text-xs leading-6">{description}</FieldDescription> : null}
        <FieldError>{error}</FieldError>
      </FieldContent>
    </Field>
  );
}
