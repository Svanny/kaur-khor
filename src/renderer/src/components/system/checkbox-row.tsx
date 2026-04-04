import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';

export function CheckboxRow({
  checked,
  className,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  description?: ReactNode;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxId = useId();

  return (
    <div
      className={cn(
        `flex items-center gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 px-4 py-4 text-sm transition-colors ${rowHoverClassName}`,
        className,
      )}
      data-slot="checkbox-row"
    >
      <Checkbox
        checked={checked}
        className="size-5 rounded-[6px]"
        id={checkboxId}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <div className="grid gap-1">
        <Label className="flex min-h-5 items-center font-medium leading-5 text-foreground" htmlFor={checkboxId}>
          {label}
        </Label>
        {description ? <div className="text-muted-foreground">{description}</div> : null}
      </div>
    </div>
  );
}
