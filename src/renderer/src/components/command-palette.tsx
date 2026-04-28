import { type ComponentType, type ReactNode, type SVGProps, forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { InterfaceViewMode } from '@shared/interface-view';
import {
  ActionAddBadgeIcon,
  ActionClipboardAddIcon,
  ActionCreatePackageIcon,
  ActionDatabaseDownloadIcon,
  ActionDatabaseUploadIcon,
  ActionEditIcon,
  ActionExplosionIcon,
  ActionReceiveInventoryIcon,
  ActionSaveIcon,
  ActionSearchIcon,
  ActionSubmitIcon,
  ActionUndoIcon,
} from '@icons/actions';
import { overviewTaskActionIcons, overviewTaskFilterIcons, rankingEntryTypeIcons } from '@icons/domain';
import {
  NavigationArchiveIcon,
  NavigationAnalysisIcon,
  NavigationAutomationIcon,
  NavigationCatalogIcon,
  NavigationDashboardIcon,
  NavigationFinancialsIcon,
  NavigationLogsIcon,
  NavigationMoveDownIcon,
  NavigationMoveUpIcon,
  NavigationPerformanceIcon,
  NavigationRightPanelIcon,
  NavigationSettingsIcon,
  NavigationTaskListIcon,
  NavigationWorkspacePanelsIcon,
} from '@icons/navigation';
import { EntityBackupIcon } from '@icons/entities';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { SearchInput } from '@/components/system/search-input';
import {
  createBackupSnapshotAction,
  exportLogsAction,
  exportPlanningDataAction,
  restoreBackupSnapshotAction,
} from '@/lib/settings-workspace-actions';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import {
  commandBadgeLabel,
  type CommandDescriptor,
  buildCommandDescriptors,
  groupCommandDescriptors,
  searchCommandDescriptors,
} from '@/lib/command-palette';
import { usePageStateMemoryVersion } from '@/lib/page-state-memory';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type CommandIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

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

const footerKeyClassName =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-[0.7rem] border border-border/70 bg-background/90 px-1.5 text-[0.72rem] font-semibold text-muted-foreground shadow-[0_1px_0_rgba(255,255,255,0.55)]';

function commandBadgeClassName(command: CommandDescriptor) {
  switch (command.kind) {
    case 'page':
      return 'border-sky-200/80 bg-sky-50 text-sky-700';
    case 'tab':
      return 'border-lime-200/80 bg-lime-50 text-lime-700';
    case 'sheet':
      return 'border-amber-200/80 bg-amber-50 text-amber-700';
    case 'entity':
      return 'border-rose-200/80 bg-rose-50 text-rose-700';
    case 'workflow':
      if (command.action.type === 'settings') {
        return 'border-violet-200/80 bg-violet-50 text-violet-700';
      }
      return 'border-orange-200/80 bg-orange-50 text-orange-700';
    default:
      return 'border-border/70 bg-background/80 text-muted-foreground';
  }
}

function pageIcon(pageId: string): CommandIconComponent {
  switch (pageId) {
    case 'overview':
      return NavigationDashboardIcon;
    case 'record-update':
      return NavigationTaskListIcon;
    case 'performance':
      return NavigationPerformanceIcon;
    case 'financials':
      return NavigationFinancialsIcon;
    case 'automations':
      return NavigationAutomationIcon;
    case 'catalog':
      return NavigationCatalogIcon;
    case 'analysis':
      return NavigationAnalysisIcon;
    case 'operations':
      return NavigationLogsIcon;
    case 'archive':
      return NavigationArchiveIcon;
    case 'settings':
      return NavigationSettingsIcon;
    case 'help':
      return ActionExplosionIcon;
    default:
      return NavigationTaskListIcon;
  }
}

function settingsIcon(effect: Extract<CommandDescriptor['action'], { type: 'settings' }>['effect']): CommandIconComponent {
  switch (effect) {
    case 'set-display-mode':
      return NavigationWorkspacePanelsIcon;
    case 'set-show-floating-title-actions':
      return NavigationWorkspacePanelsIcon;
    case 'set-show-right-rail-cards':
      return NavigationRightPanelIcon;
    case 'set-show-automations-page':
      return NavigationAutomationIcon;
    case 'set-show-explanatory-tooltips':
      return ActionSearchIcon;
    case 'set-smoothing-enabled':
      return ActionUndoIcon;
    case 'set-language':
    case 'set-currency':
      return ActionSaveIcon;
    case 'create-backup-snapshot':
      return EntityBackupIcon;
    case 'restore-backup-snapshot':
      return ActionDatabaseUploadIcon;
    case 'export-logs':
    case 'export-planning-data':
      return ActionDatabaseDownloadIcon;
    default:
      return NavigationSettingsIcon;
  }
}

function commandIcon(command: CommandDescriptor): CommandIconComponent {
  if (command.kind === 'page') {
    return pageIcon(command.pageId);
  }

  if (command.kind === 'tab') {
    if (command.id.startsWith('overview:filter:')) {
      const filter = command.id.replace('overview:filter:', '') as keyof typeof overviewTaskFilterIcons;
      return overviewTaskFilterIcons[filter] ?? NavigationTaskListIcon;
    }
    return pageIcon(command.pageId);
  }

  if (command.action.type === 'settings') {
    return settingsIcon(command.action.effect);
  }
  if (command.action.type === 'catalog-mutation') {
    return command.action.mutation === 'archive' ? NavigationArchiveIcon : ActionUndoIcon;
  }

  if (command.id.includes(':edit:')) {
    return ActionEditIcon;
  }
  if (command.id === 'workflow:new-sku' || command.id === 'workflow:new-service') {
    return ActionCreatePackageIcon;
  }
  if (command.id === 'workflow:start-update' || command.id === 'overview:stale-update') {
    return ActionClipboardAddIcon;
  }
  if (command.id.startsWith('sku:sheet:stock:') || command.id.startsWith('service:sheet:stock:')) {
    return ActionClipboardAddIcon;
  }
  if (command.id.startsWith('sku:sheet:order:')) {
    return ActionCreatePackageIcon;
  }
  if (command.id.startsWith('sku:sheet:receipt:') || command.id.startsWith('service:sheet:receipt:')) {
    return ActionReceiveInventoryIcon;
  }
  if (command.id.startsWith('sku:sheet:price:') || command.id.startsWith('service:sheet:price:')) {
    return ActionAddBadgeIcon;
  }
  if (command.id.startsWith('sku:open:')) {
    return rankingEntryTypeIcons.sku;
  }
  if (command.id.startsWith('service:open:')) {
    return rankingEntryTypeIcons.service;
  }
  if (command.id.startsWith('overview:task:')) {
    const action = command.id.split(':').at(-1) as keyof typeof overviewTaskActionIcons;
    return overviewTaskActionIcons[action] ?? NavigationTaskListIcon;
  }

  return ActionSubmitIcon;
}

const CommandResultRow = forwardRef<HTMLButtonElement, {
  active: boolean;
  command: CommandDescriptor;
  language: 'en' | 'km';
  onSelect: () => void;
}>(({ active, command, language, onSelect }, ref) => {
  const CommandIcon = commandIcon(command);

  return (
    <button
      ref={ref}
      aria-selected={active}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1rem] border px-4 py-2 text-left transition-colors',
        active
          ? 'border-border bg-accent text-accent-foreground shadow-[0_10px_22px_rgba(48,31,20,0.08)]'
          : 'border-transparent bg-transparent hover:border-border/60 hover:bg-accent/55',
      )}
      role="option"
      type="button"
      onClick={onSelect}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-[0.9rem] border border-border/60 bg-background/72 text-foreground/80">
          <CommandIcon className="size-3.5" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{command.title}</span>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]',
              commandBadgeClassName(command),
            )}
          >
            {translateUiLiteral(language, commandBadgeLabel(command))}
          </span>
          {command.subtitle ? (
            <p className="mt-0.5 w-full text-sm leading-5 text-muted-foreground">{command.subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ActionSubmitIcon className="size-3.5" />
      </div>
    </button>
  );
});

CommandResultRow.displayName = 'CommandResultRow';

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const inventory = useInventory();
  const {
    applyDisplayViewMode,
    applySenaEngineParameters,
    currency,
    displayViewMode,
    language,
    savePreferences,
    senaEngineParameters,
    showExplanatoryTooltips,
    showFloatingTitleActions,
    showAutomationsPage,
    showRightRailCards,
    t,
  } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const pageStateMemoryVersion = usePageStateMemoryVersion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingCatalogMutation, setPendingCatalogMutation] = useState<Extract<CommandDescriptor['action'], { type: 'catalog-mutation' }> | null>(null);
  const commands = useMemo(
    () =>
      buildCommandDescriptors({
        currency,
        displayViewMode,
        inventory,
        language,
        senaEngineParameters,
        showExplanatoryTooltips,
        showFloatingTitleActions,
        showAutomationsPage,
        showRightRailCards,
        t: (key) => t(key as never),
      }).map((command) => ({
        ...command,
        subtitle: command.subtitle ? translateUiLiteral(language, command.subtitle) : command.subtitle,
        title: translateUiLiteral(language, command.title),
      })),
    [
      currency,
      displayViewMode,
      inventory,
      language,
      location.pathname,
      location.search,
      pageStateMemoryVersion,
      senaEngineParameters,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showAutomationsPage,
      showRightRailCards,
      t,
    ],
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
  const sections = useMemo(
    () =>
      groupCommandDescriptors(results, {
        bestMatchCount: 5,
        includeBestMatches: query.trim().length > 0,
      }).map((section) => ({
        ...section,
        title: translateUiLiteral(language, section.title),
      })),
    [language, query, results],
  );
  const visibleResults = useMemo(() => sections.flatMap((section) => section.items), [sections]);
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
    if (!visibleResults[selectedIndex]) {
      setSelectedIndex(0);
    }
  }, [open, visibleResults, selectedIndex]);

  useEffect(() => {
    if (!open) {
      return;
    }

    resultRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }, [open, selectedIndex]);

  async function handleSelect(command: CommandDescriptor) {
    setOpen(false);
    setQuery('');

    if (command.action.type === 'settings') {
      if (command.action.effect === 'set-language') {
        await savePreferences({ language: command.action.value as 'en' | 'km' });
        return;
      }
      if (command.action.effect === 'set-currency') {
        await savePreferences({ currency: command.action.value as 'USD' | 'KHR' });
        return;
      }
      if (command.action.effect === 'set-display-mode') {
        await applyDisplayViewMode(command.action.value as InterfaceViewMode);
        return;
      }
      if (command.action.effect === 'set-show-explanatory-tooltips') {
        await savePreferences({ showExplanatoryTooltips: command.action.value as boolean });
        return;
      }
      if (command.action.effect === 'set-show-floating-title-actions') {
        await savePreferences({ showFloatingTitleActions: command.action.value as boolean });
        return;
      }
      if (command.action.effect === 'set-show-right-rail-cards') {
        await savePreferences({ showRightRailCards: command.action.value as boolean });
        return;
      }
      if (command.action.effect === 'set-show-automations-page') {
        await savePreferences({ showAutomationsPage: command.action.value as boolean });
        return;
      }
      if (command.action.effect === 'set-smoothing-enabled') {
        await applySenaEngineParameters({
          ...senaEngineParameters,
          smoothingEnabled: command.action.value as boolean,
        });
        return;
      }
      if (command.action.effect === 'create-backup-snapshot') {
        await createBackupSnapshotAction((key, variables) => t(key as never, variables));
        return;
      }
      if (command.action.effect === 'restore-backup-snapshot') {
        await restoreBackupSnapshotAction((key, variables) => t(key as never, variables));
        return;
      }
      if (command.action.effect === 'export-logs') {
        await exportLogsAction('excel', (key, variables) => t(key as never, variables));
        return;
      }
      if (command.action.effect === 'export-planning-data') {
        await exportPlanningDataAction('excel', (key, variables) => t(key as never, variables));
        return;
      }
    }

    if (command.action.type === 'catalog-mutation') {
      setPendingCatalogMutation(command.action);
      return;
    }

    navigate(command.action.href);
  }

  return (
    <>
      {children}
      <ConfirmActionDialog
        open={pendingCatalogMutation != null}
        title={
          pendingCatalogMutation
            ? translateUiLiteral(
                language,
                pendingCatalogMutation.mutation === 'archive' ? 'Archive {name}?' : 'Unarchive {name}?',
                { name: pendingCatalogMutation.entityName },
              )
            : ''
        }
        description={
          pendingCatalogMutation
            ? pendingCatalogMutation.mutation === 'archive'
              ? translateUiLiteral(
                  language,
                  'Archived items disappear from active work, but their history stays available in banji.',
                )
              : translateUiLiteral(
                  language,
                  'This item will return to active workspaces and become visible across banji again.',
                )
            : undefined
        }
        confirmLabel={
          pendingCatalogMutation?.mutation === 'unarchive'
            ? translateUiLiteral(language, 'Unarchive')
            : translateUiLiteral(language, 'Archive')
        }
        confirmVariant={pendingCatalogMutation?.mutation === 'unarchive' ? 'default' : 'destructive'}
        isSubmitting={inventory.isSaving}
        onCancel={() => {
          if (!inventory.isSaving) {
            setPendingCatalogMutation(null);
          }
        }}
        onConfirm={() => {
          if (!pendingCatalogMutation) {
            return;
          }
          const mutation =
            pendingCatalogMutation.mutation === 'archive'
              ? inventory.archiveCatalogEntity({
                  entityId: pendingCatalogMutation.entityId,
                  entityType: pendingCatalogMutation.entityType,
                })
              : inventory.unarchiveCatalogEntity({
                  entityId: pendingCatalogMutation.entityId,
                  entityType: pendingCatalogMutation.entityType,
                });
          void mutation.then(() => {
            setPendingCatalogMutation(null);
          });
        }}
      />
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(29,20,12,0.46)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            data-command-palette-content="true"
            className="fixed top-[14svh] left-1/2 z-50 flex w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-[#fbf7f2] shadow-[0_28px_90px_rgba(48,31,20,0.22)] outline-none"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <DialogPrimitive.Title className="sr-only">{translateUiLiteral(language, 'Command palette')}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {translateUiLiteral(language, 'Search pages, tabs, entities, and actions.')}
            </DialogPrimitive.Description>

            <div className="border-b border-border/60 px-5 py-4">
              <SearchInput
                ariaLabel={translateUiLiteral(language, 'Search commands')}
                autoComplete="off"
                className="h-14 rounded-[1.5rem] border-transparent bg-transparent shadow-none"
                inputClassName="[appearance:textfield] text-base [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden [&::-webkit-search-results-button]:hidden [&::-webkit-search-results-decoration]:hidden"
                inputRef={inputRef}
                placeholder={translateUiLiteral(language, 'Search pages, tabs, SKUs, services, or actions…')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setSelectedIndex((current) => (visibleResults.length === 0 ? 0 : Math.min(current + 1, visibleResults.length - 1)));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSelectedIndex((current) => (visibleResults.length === 0 ? 0 : Math.max(current - 1, 0)));
                  }
                  if (event.key === 'Enter' && visibleResults[selectedIndex]) {
                    event.preventDefault();
                    handleSelect(visibleResults[selectedIndex]);
                  }
                }}
              />
            </div>

            <div className="max-h-[60svh] overflow-y-auto px-3 py-3">
              {visibleResults.length > 0 ? (
                <div aria-label={translateUiLiteral(language, 'Command results')} className="grid gap-2" role="listbox">
                  {(() => {
                    let runningIndex = 0;

                    return sections.map((section, sectionIndex) => {
                      const sectionStartIndex = runningIndex;
                      runningIndex += section.items.length;

                      return (
                        <div key={section.id} className="grid gap-1.5">
                          {sectionIndex > 0 ? <div className="mx-2 h-px bg-border/60" /> : null}
                          <div className="px-2 pt-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {section.title}
                          </div>
                          <div className="grid gap-0.5">
                            {section.items.map((command, index) => {
                              const commandIndex = sectionStartIndex + index;

                              return (
                                <CommandResultRow
                                  key={command.id}
                                  active={commandIndex === selectedIndex}
                                  command={command}
                                  language={language}
                                  ref={(node) => {
                                    resultRefs.current[commandIndex] = node;
                                  }}
                                  onSelect={() => handleSelect(command)}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-border/70 px-5 py-10 text-center">
                  <p className="font-medium text-foreground">
                    {translateUiLiteral(language, 'No commands match this query.')}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {translateUiLiteral(language, 'Try a page name, tab label, SKU name, service name, or action.')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2">
                  <span>{translateUiLiteral(language, 'Navigate')}</span>
                  <span className={cn(footerKeyClassName, 'px-1')}>
          <NavigationMoveUpIcon className="size-3.5" />
                  </span>
                  <span className={cn(footerKeyClassName, 'px-1')}>
          <NavigationMoveDownIcon className="size-3.5" />
                  </span>
                </span>
                <span className="h-4 w-px bg-border/70" />
                <span className="flex items-center gap-2">
                  <span>{translateUiLiteral(language, 'Open')}</span>
                  <span className={cn(footerKeyClassName, 'px-1')}>
                    <ActionSubmitIcon className="size-3.5" />
                  </span>
                </span>
                <span className="h-4 w-px bg-border/70" />
                <span className="flex items-center gap-2">
                  <span>{translateUiLiteral(language, 'Close')}</span>
                  <span className={cn(footerKeyClassName, 'px-2 text-[0.68rem] uppercase tracking-[0.08em]')}>Esc</span>
                </span>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
