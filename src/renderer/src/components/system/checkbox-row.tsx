import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { DescriptionText } from '@/components/system/description-text';
import { Label } from '@/components/ui/label';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';

export function CheckboxRow({
  checked,
  className,
  disabled = false,
  helper,
  hint,
  icon,
  label,
  onCheckedChange,
  variant = 'default',
}: {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  helper?: ReactNode;
  hint?: ReactNode;
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
        disabled && 'opacity-60',
        className,
      )}
      data-slot="checkbox-row"
      data-variant={variant}
    >
      <Checkbox
        checked={checked}
        className="size-5 rounded-[6px]"
        disabled={disabled}
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
        {helper ? <div className="text-muted-foreground">{helper}</div> : null}
        {hint ? <DescriptionText className="text-muted-foreground">{hint}</DescriptionText> : null}
      </div>
    </div>
  );
}
