import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';

export function CheckboxRow({
  checked,
  className,
  description,
  icon,
  label,
  onCheckedChange,
  variant = 'default',
}: {
  checked: boolean;
  className?: string;
  description?: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  variant?: 'default' | 'flat';
}) {
  const checkboxId = useId();

  return (
    <div
      className={cn(
        'flex items-center gap-3 text-sm',
        variant === 'default' &&
          `rounded-[1.25rem] border border-border/70 bg-muted/20 px-4 py-4 transition-colors ${rowHoverClassName}`,
        variant === 'flat' && 'px-1 py-4',
        className,
      )}
      data-slot="checkbox-row"
      data-variant={variant}
    >
      <Checkbox
        checked={checked}
        className="size-5 rounded-[6px]"
        id={checkboxId}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      {icon ? (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center text-muted-foreground',
            variant === 'default' && 'size-9 rounded-full bg-background/80',
            variant === 'flat' && 'size-5',
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="grid gap-1">
        <Label className="flex min-h-5 items-center font-medium leading-5 text-foreground" htmlFor={checkboxId}>
          {label}
        </Label>
        {description ? <div className="text-muted-foreground">{description}</div> : null}
      </div>
    </div>
  );
}
