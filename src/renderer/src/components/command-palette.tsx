import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { CornerDownLeft, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import { commandBadgeLabel, type CommandDescriptor, buildCommandDescriptors, searchCommandDescriptors } from '@/lib/command-palette';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

function hasBlockingDialog() {
  if (typeof document === 'undefined') {
    return false;
  }

  return document.querySelector('[role="dialog"]:not([data-command-palette-content="true"])') != null;
}

function shortcutLabel() {
  return isMacPlatform() ? 'Cmd K' : 'Ctrl K';
}

function CommandResultRow({
  active,
  command,
  onSelect,
}: {
  active: boolean;
  command: CommandDescriptor;
  onSelect: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.15rem] border px-4 py-3 text-left transition-colors',
        active
          ? 'border-border bg-accent text-accent-foreground shadow-[0_10px_22px_rgba(48,31,20,0.08)]'
          : 'border-transparent bg-transparent hover:border-border/60 hover:bg-accent/55',
      )}
      role="option"
      type="button"
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{command.title}</span>
          <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {commandBadgeLabel(command)}
          </span>
        </div>
        {command.subtitle ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{command.subtitle}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CornerDownLeft className="size-3.5" />
      </div>
    </button>
  );
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const inventory = useInventory();
  const { language, t } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const commands = useMemo(
    () =>
      buildCommandDescriptors({
        inventory,
        language,
        t: (key) => t(key as never),
      }),
    [inventory, language, t],
  );
  const results = useMemo(
    () =>
      searchCommandDescriptors({
        commands,
        currentPathname: location.pathname,
        query,
      }),
    [commands, location.pathname, query],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open, results.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const modifierPressed = isMacPlatform()
        ? event.metaKey && !event.ctrlKey && !event.altKey
        : event.ctrlKey && !event.metaKey && !event.altKey;

      if (!modifierPressed || key !== 'k') {
        return;
      }

      if (!open && hasBlockingDialog()) {
        return;
      }

      event.preventDefault();
      setOpen((current) => !current);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!results[selectedIndex]) {
      setSelectedIndex(0);
    }
  }, [open, results, selectedIndex]);

  function handleSelect(command: CommandDescriptor) {
    setOpen(false);
    setQuery('');
    navigate(command.action.href);
  }

  return (
    <>
      {children}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(29,20,12,0.46)] backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            data-command-palette-content="true"
            className="fixed top-[14svh] left-1/2 z-50 flex w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-[#fbf7f2] shadow-[0_28px_90px_rgba(48,31,20,0.22)] outline-none"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Search pages, tabs, entities, and actions.
            </DialogPrimitive.Description>

            <div className="border-b border-border/60 px-5 py-4">
              <InputGroup className="h-14 rounded-[1.5rem] border-transparent bg-transparent shadow-none">
                <InputGroupAddon align="inline-start" className="pl-0 text-muted-foreground">
                  <InputGroupText>
                    <Search className="size-4.5" />
                  </InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  ref={inputRef}
                  aria-label="Search commands"
                  autoComplete="off"
                  className="px-0 text-base"
                  placeholder="Search pages, tabs, SKUs, services, or actions…"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setSelectedIndex((current) => (results.length === 0 ? 0 : Math.min(current + 1, results.length - 1)));
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setSelectedIndex((current) => (results.length === 0 ? 0 : Math.max(current - 1, 0)));
                    }
                    if (event.key === 'Enter' && results[selectedIndex]) {
                      event.preventDefault();
                      handleSelect(results[selectedIndex]);
                    }
                  }}
                />
                <InputGroupAddon align="inline-end" className="pr-0 text-muted-foreground">
                  <InputGroupText>{shortcutLabel()}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>

            <div className="max-h-[60svh] overflow-y-auto px-3 py-3">
              {results.length > 0 ? (
                <div aria-label="Command results" className="grid gap-1.5" role="listbox">
                  {results.map((command, index) => (
                    <CommandResultRow
                      key={command.id}
                      active={index === selectedIndex}
                      command={command}
                      onSelect={() => handleSelect(command)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-border/70 px-5 py-10 text-center">
                  <p className="font-medium text-foreground">No commands match this query.</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Try a page name, tab label, SKU id, service name, or action.
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
              <span>Arrows to navigate</span>
              <span>Enter to open</span>
              <Button size="xs" type="button" variant="ghost" onClick={() => setOpen(false)}>
                Esc to close
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
