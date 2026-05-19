import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { NavigationSelectExpandIcon } from '@icons/navigation'
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface ComboboxOption {
  value: string;
  label: string;
  secondary?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  onSelectOption?: (option: ComboboxOption) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

export function Combobox({
  value,
  onChange,
  onSelectOption,
  options,
  placeholder,
  disabled,
  id,
  'aria-label': ariaLabel,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();

  const filteredOptions = React.useMemo(() => {
    if (!value.trim()) return options;
    const query = value.toLowerCase();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(query) ||
      opt.value.toLowerCase().includes(query)
    );
  }, [options, value]);

  React.useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredOptions.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
      } else {
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (open) {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      }
    } else if (event.key === 'Tab') {
      setOpen(false);
      setHighlightedIndex(-1);
    } else if (event.key === 'Enter') {
      if (open && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        event.preventDefault();
        const option = filteredOptions[highlightedIndex]!;
        onChange(option.label);
        onSelectOption?.(option);
        setOpen(false);
        setHighlightedIndex(-1);
      } else {
        setOpen(false);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  const handleSelect = (option: ComboboxOption) => {
    onChange(option.label);
    onSelectOption?.(option);
    setOpen(false);
    setHighlightedIndex(-1);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <div className="relative w-full">
          <input
            ref={inputRef}
            type="text"
            id={id}
            aria-label={ariaLabel}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
            disabled={disabled}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            onPointerDown={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            onClick={(e) => e.stopPropagation()}
            placeholder={placeholder}
            className={cn(
              "h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 pr-8 text-base transition-colors outline-none placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              className
            )}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setOpen((prev) => !prev)}
          >
            <NavigationSelectExpandIcon className="size-4" />
          </button>
        </div>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "relative z-[80] max-h-[300px] min-w-[8rem] origin-(--radix-popover-content-transform-origin) overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "w-[var(--radix-popover-trigger-width)]"
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <ScrollArea className="h-full max-h-[300px]">
            <div className="p-1" role="listbox" id={listboxId}>
              {filteredOptions.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No results found.
                </div>
              ) : (
                filteredOptions.map((option, index) => (
                  <div
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === highlightedIndex}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelect(option)}
                    className={cn(
                      "relative flex w-full cursor-default items-center justify-between gap-2 rounded-sm py-1.5 pr-2 pl-2 text-sm outline-hidden select-none",
                      index === highlightedIndex && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.secondary ? (
                      <span className="shrink-0 text-muted-foreground">{option.secondary}</span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
