import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { IconComponent } from '@icons';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';

export interface ResponsiveToggleFilterOption<TValue extends string> {
  icon: IconComponent;
  label: ReactNode;
  textValue?: string;
  value: TValue;
}

function clippedInlineWidth(element: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const widths = [element.clientWidth];
  let ancestor = element.parentElement;

  while (ancestor) {
    const style = window.getComputedStyle(ancestor);
    if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflow}`)) {
      widths.push(Math.max(0, ancestor.getBoundingClientRect().right - elementRect.left));
    }
    ancestor = ancestor.parentElement;
  }

  if (typeof window.innerWidth === 'number') {
    widths.push(Math.max(0, window.innerWidth - elementRect.left));
  }

  return Math.min(...widths.filter((width) => Number.isFinite(width) && width > 0));
}

function clippedInlineBoundaryWidth(element: HTMLElement) {
  const elementRect = element.getBoundingClientRect();
  const widths: number[] = [];
  let ancestor = element.parentElement;

  while (ancestor) {
    const style = window.getComputedStyle(ancestor);
    if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflow}`)) {
      widths.push(Math.max(0, ancestor.getBoundingClientRect().right - elementRect.left));
    }
    ancestor = ancestor.parentElement;
  }

  if (typeof window.innerWidth === 'number') {
    widths.push(Math.max(0, window.innerWidth - elementRect.left));
  }

  return Math.min(...widths.filter((width) => Number.isFinite(width) && width > 0));
}

export function ResponsiveToggleFilter<TValue extends string>({
  ariaLabel,
  className,
  disabled = false,
  onValueChange,
  options,
  selectLabel,
  size,
  spacing = 1,
  toggleClassName,
  triggerClassName,
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: TValue) => void;
  options: Array<ResponsiveToggleFilterOption<TValue>>;
  selectLabel?: string;
  size?: 'sm' | 'default' | 'lg';
  spacing?: number;
  toggleClassName?: string;
  triggerClassName?: string;
  value: TValue;
}) {
  const { language } = usePreferences();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const useDropdownRef = useRef(false);
  const dropdownBoundaryWidthRef = useRef<number | null>(null);
  const [useDropdown, setUseDropdown] = useState(false);
  const activeOption = useMemo(
    () => options.find((option) => option.value === value) ?? options[0],
    [options, value],
  );
  const ActiveIcon = activeOption?.icon;
  const resolvedSelectLabel = selectLabel ?? translateUiLiteral(language, 'Filter');

  const updateOverflowMode = useCallback(() => {
    const root = rootRef.current;
    const measured = measureRef.current;
    if (!root || !measured) {
      return;
    }
    const measuredWidth = measured.scrollWidth;
    const availableWidth = clippedInlineWidth(root);
    const boundaryWidth = clippedInlineBoundaryWidth(root);
    const nextUseDropdown = measuredWidth > availableWidth + 1;

    if (
      useDropdownRef.current &&
      nextUseDropdown &&
      dropdownBoundaryWidthRef.current != null &&
      boundaryWidth > dropdownBoundaryWidthRef.current + 1 &&
      measuredWidth <= boundaryWidth + 1
    ) {
      dropdownBoundaryWidthRef.current = null;
      useDropdownRef.current = false;
      setUseDropdown(false);
      return;
    }

    if (nextUseDropdown && useDropdownRef.current) {
      dropdownBoundaryWidthRef.current = boundaryWidth;
    }

    setUseDropdown((current) => {
      if (current === nextUseDropdown) {
        return current;
      }
      dropdownBoundaryWidthRef.current = nextUseDropdown ? boundaryWidth : null;
      useDropdownRef.current = nextUseDropdown;
      return nextUseDropdown;
    });
  }, []);

  useLayoutEffect(() => {
    updateOverflowMode();
    const root = rootRef.current;
    const measured = measureRef.current;
    if (!root || !measured || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(updateOverflowMode);
    observer.observe(root);
    observer.observe(measured);
    if (root.parentElement) {
      observer.observe(root.parentElement);
    }
    return () => observer.disconnect();
  }, [options, updateOverflowMode]);

  const renderOptionContent = (option: ResponsiveToggleFilterOption<TValue>) => {
    const OptionIcon = option.icon;
    return (
      <>
        <OptionIcon data-icon="inline-start" className="size-4 text-current" />
        {option.label}
      </>
    );
  };

  const toggleGroup = (
    <ToggleGroup
      aria-label={ariaLabel}
      className={cn('inline-flex max-w-full justify-start rounded-2xl', toggleClassName)}
      disabled={disabled}
      size={size}
      spacing={spacing}
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue) {
          onValueChange(nextValue as TValue);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {renderOptionContent(option)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <div ref={rootRef} className={cn('relative min-w-0 max-w-full self-center', className)} data-slot="responsive-toggle-filter">
      <div
        ref={measureRef}
        aria-hidden="true"
        data-slot="responsive-toggle-filter-measure"
        className="pointer-events-none absolute left-0 top-0 h-0 max-w-none overflow-hidden opacity-0"
      >
        {toggleGroup}
      </div>
      {useDropdown && activeOption && ActiveIcon ? (
        <Select disabled={disabled} value={value} onValueChange={(nextValue) => onValueChange(nextValue as TValue)}>
          <SelectTrigger
            aria-label={ariaLabel}
            className={cn(
              'min-w-0 w-full max-w-[9.5rem] justify-between rounded-full border border-border/70 bg-card text-sm font-medium text-foreground shadow-xs [&_svg]:opacity-100',
              triggerClassName,
            )}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="shrink-0">{resolvedSelectLabel}:</span>
              <ActiveIcon data-icon="inline-start" className="size-4 shrink-0 text-current" />
              <span className="truncate">{activeOption.label}</span>
            </span>
          </SelectTrigger>
          <SelectContent align="start">
            {options.map((option) => (
              <SelectItem key={option.value} textValue={option.textValue} value={option.value}>
                {renderOptionContent(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        toggleGroup
      )}
    </div>
  );
}
