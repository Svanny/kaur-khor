import * as React from 'react';
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { DesktopSeenUnlockedNavItemId } from '@shared/ipc';
import {
  NavigationAutomationIcon,
  NavigationBackIcon,
  NavigationCatalogIcon,
  NavigationCommandPaletteIcon,
  NavigationDashboardIcon,
  NavigationNextIcon,
  NavigationRightPanelIcon,
  NavigationSettingsIcon,
  NavigationTaskListIcon,
  NavigationWorkIcon,
  NavigationPerformanceIcon,
} from '@icons/navigation';
import {
  StatusConstructionIcon,
  StatusFlaskConicalIcon,
  StatusLoadingIcon,
  StatusMoonStarIcon,
  StatusShieldCheckIcon,
} from '@icons/status';
import type { IconComponent } from '@icons';
import { Button } from '@/components/ui/button';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { WorkspaceBanner } from '@/components/system/workspace';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  buildRememberedAnalysisHref,
  buildRememberedFinancialsHref,
  buildRememberedInboxHref,
  buildRememberedInventoryHref,
  buildRememberedPageHref,
  usePageStateMemoryVersion,
} from '@/lib/settings/page-state-memory';
import { resolveSettingsSection, visibleSettingsSections, type SettingsSectionConfig } from '@/lib/navigation/settings-navigation';
import {
  deriveNavigationAvailability,
  isUnlockedNavItemNew,
  isUnlockedNavItemVisible,
  type NavigationAvailability,
} from '@/lib/navigation/navigation-availability';
import { translateUiLiteral, type TranslationKey } from '@/lib/localization/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { buildKaurKhorNavigationState, buildSidebarNavigationState, SIDEBAR_NAVIGATION_SOURCE, useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { useRuntimeMode } from '@/hooks/use-runtime-mode';
import brandLogo from '@/assets/kaur-khor-logo.svg';
import { ActionCreatePackageIcon, ActionRefreshIcon } from '@icons/actions';
import { RECORD_UPDATE_LANES } from '@/lib/navigation/record-update-routes';
import {
  EntityRevenueIcon,
  EntityServiceIcon,
  EntitySignalIcon,
  EntitySkuIcon,
} from '@icons/entities';

type ShellSectionConfig = {
  destination: string;
  availabilityKey?: keyof NavigationAvailability;
  gatedNavItemId?: DesktopSeenUnlockedNavItemId;
  icon: IconComponent;
  id:
    | 'capture'
    | `capture-${string}`
    | 'catalog'
    | 'home'
    | 'insights'
    | 'insights-analysis'
    | 'insights-financials'
    | 'insights-performance'
    | 'intake'
    | 'queue'
    | 'work'
    | 'settings';
  labelKey:
    | 'navHome'
    | 'navWork'
    | 'navInbox'
    | 'navCapture'
    | 'navAutomations'
    | 'navInsights'
    | 'navPerformance'
    | 'navFinancials'
    | 'navAnalysis'
    | 'navCatalog'
    | 'navSettings';
  matches: (pathname: string) => boolean;
};

type ShellTreeItemConfig = ShellSectionConfig & {
  children?: ShellTreeItemConfig[];
  label?: string;
};

const captureLaneIconById: Partial<Record<string, IconComponent>> = {
  'stock-count': EntitySkuIcon,
  'customer-order-pending': EntityRevenueIcon,
  'customer-order-completed': EntityServiceIcon,
  'supplier-order-pending': ActionCreatePackageIcon,
};

type SidebarSectionLabelKey = 'sidebarSectionMain' | 'sidebarSectionOther';
type SettingsSidebarGroupConfig = {
  labelKey: SidebarSectionLabelKey;
  sections: SettingsSectionConfig[];
};

const sidebarSectionGroupClassName = 'py-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0';
const sidebarSectionLabelClassName =
  'group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-0';
const shortcutKeyClassName =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-[0.7rem] border border-sidebar-border/70 bg-sidebar-accent/35 px-1.5 text-[0.72rem] font-semibold text-sidebar-foreground/70 shadow-[0_1px_0_rgba(255,255,255,0.45)]';
type ReleaseChannel = 'alpha' | 'beta' | 'stable' | 'nightly';
const sidebarVersionIconByChannel: Record<ReleaseChannel, IconComponent> = {
  alpha: StatusFlaskConicalIcon,
  beta: StatusConstructionIcon,
  stable: StatusShieldCheckIcon,
  nightly: StatusMoonStarIcon,
};

function isMacPlatform() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

function matchesSection(pathname: string, sectionRoot: string) {
  return pathname === sectionRoot || pathname.startsWith(`${sectionRoot}/`);
}

function routeSupportsLocalLoadingState(pathname: string) {
  return matchesSection(pathname, '/catalog') || matchesSection(pathname, '/insights') || matchesSection(pathname, '/work');
}

const APP_SECTIONS: ShellSectionConfig[] = [
  {
    id: 'home',
    destination: '/',
    labelKey: 'navHome',
    icon: NavigationDashboardIcon,
    matches: (pathname) => pathname === '/',
  },
  {
    id: 'work',
    destination: '/work',
    gatedNavItemId: 'work',
    labelKey: 'navWork',
    icon: NavigationWorkIcon,
    matches: (pathname) => matchesSection(pathname, '/work'),
  },
  {
    id: 'catalog',
    destination: '/catalog',
    gatedNavItemId: 'catalog',
    labelKey: 'navCatalog',
    icon: NavigationCatalogIcon,
    matches: (pathname) => matchesSection(pathname, '/catalog'),
  },
  {
    id: 'insights',
    destination: '/insights',
    gatedNavItemId: 'insights',
    labelKey: 'navInsights',
    icon: NavigationPerformanceIcon,
    matches: (pathname) => matchesSection(pathname, '/insights'),
  },
];

const SETTINGS_SECTION: ShellSectionConfig = {
  id: 'settings',
  destination: '/settings',
  labelKey: 'navSettings',
  icon: NavigationSettingsIcon,
  matches: (pathname) => matchesSection(pathname, '/settings'),
};

const orderedSettingsSections = (ids: Array<SettingsSectionConfig['id']>, sections: SettingsSectionConfig[]) => {
  const sectionLookup = new Map(sections.filter((section) => section.id !== 'credits').map((section) => [section.id, section]));
  return ids
    .map((id) => sectionLookup.get(id))
    .filter((section): section is SettingsSectionConfig => section != null);
};

const settingsNavigationGroups = (sections: SettingsSectionConfig[]): SettingsSidebarGroupConfig[] => [
  {
    labelKey: 'sidebarSectionMain',
    sections: orderedSettingsSections(['workspace', 'interface', 'automation', 'history'], sections),
  },
  {
    labelKey: 'sidebarSectionOther',
    sections: orderedSettingsSections(['local-data', 'planning', 'benchmarks', 'updates', 'danger-zone'], sections),
  },
];

function SidebarTreeMenu({
  language,
  location,
  pathname,
  sections,
  showSidebarText,
  onNavigate,
  isSectionNew,
  t,
}: {
  language: 'en' | 'km';
  location: ReturnType<typeof useLocation>;
  sections: ShellTreeItemConfig[];
  pathname: string;
  showSidebarText: boolean;
  onNavigate: () => void;
  isSectionNew: (section: ShellTreeItemConfig) => boolean;
  t: (key: ShellSectionConfig['labelKey'] | SidebarSectionLabelKey) => string;
}) {
  const [expandedIds, setExpandedIds] = React.useState<Record<string, boolean>>({});

  function renderTreeItem(section: ShellTreeItemConfig, depth = 0) {
    const label = section.label ?? t(section.labelKey);
    const newLabel = translateUiLiteral(language, 'New!');
    const hasChildren = Boolean(section.children?.length);
    const isRouteExpanded = hasChildren && section.children?.some((child) => matchesTreeItem(pathname, child));
    const isExpanded = Boolean(isRouteExpanded || expandedIds[section.id]);
    const isActive = !isRouteExpanded && section.matches(pathname);
    const isNew = isSectionNew(section);
    const nestedOffset = showSidebarText && depth > 0 ? `${depth * 0.8}rem` : null;
    const state = section.id === 'settings'
      ? {
        ...buildKaurKhorNavigationState(location),
        kaurKhorNavigationSource: SIDEBAR_NAVIGATION_SOURCE,
      }
      : { kaurKhorNavigationSource: SIDEBAR_NAVIGATION_SOURCE };

    return (
      <SidebarMenuItem key={`${section.destination}-${depth}`} className="group/menu-item">
        <div className="relative">
          <SidebarMenuButton
            asChild
            className={cn(
              'min-w-0 justify-start gap-2 py-1.5 group-data-[collapsible=icon]:justify-center',
              (hasChildren || isNew) && showSidebarText ? 'pr-8' : null,
              depth > 0 && showSidebarText ? 'text-sidebar-foreground/80' : null,
              isNew && !isActive ? 'border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15' : null,
            )}
            isActive={isActive}
            tooltip={isNew ? newLabel : label}
          >
            <NavLink
              aria-label={label}
              className="group-data-[collapsible=icon]:justify-center"
              data-sidebar-tree-depth={depth}
              state={state}
              style={nestedOffset ? { marginLeft: nestedOffset, width: `calc(100% - ${nestedOffset})` } : undefined}
              to={section.destination === '/work/queue' ? buildRememberedInboxHref() : buildRememberedPageHref(section.destination)}
              onClick={onNavigate}
            >
              <section.icon className="size-4" />
              {showSidebarText ? <span>{label}</span> : null}
            </NavLink>
          </SidebarMenuButton>
          {hasChildren && showSidebarText ? (
            <button
              aria-expanded={isExpanded}
              aria-label={translateUiLiteral(language, isExpanded ? `Collapse ${label}` : `Expand ${label}`)}
              className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/70 ring-sidebar-ring outline-none transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2"
              type="button"
              onClick={() => {
                setExpandedIds((current) => ({
                  ...current,
                  [section.id]: !isExpanded,
                }));
              }}
            >
              <NavigationNextIcon
                aria-hidden="true"
                className={cn(
                  'size-4 transition-transform duration-120 ease-out motion-reduce:transition-none',
                  isExpanded ? 'rotate-90' : null,
                )}
              />
            </button>
          ) : null}
          {isNew && showSidebarText ? (
            <SidebarMenuBadge className={cn(
              'khmer-safe-label right-9 top-1/2 -translate-y-1/2 rounded-full bg-primary px-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary-foreground',
            )}>
              {newLabel}
            </SidebarMenuBadge>
          ) : null}
        </div>
        {hasChildren && showSidebarText && isExpanded ? (
          <SidebarMenu className="mt-0.5 gap-0.5">
            {section.children!.map((child) => renderTreeItem(child, depth + 1))}
          </SidebarMenu>
        ) : null}
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
      {sections.map((section) => renderTreeItem(section))}
    </SidebarMenu>
  );
}

function matchesTreeItem(pathname: string, section: ShellTreeItemConfig): boolean {
  return section.matches(pathname) || Boolean(section.children?.some((child) => matchesTreeItem(pathname, child)));
}

function SidebarCommandPaletteHint({ language, showSidebarText }: { language: 'en' | 'km'; showSidebarText: boolean }) {
  if (!showSidebarText) {
    return null;
  }

  const shortcutLabel = isMacPlatform() ? '⌘ + K' : 'Ctrl + K';
  const searchLabel = translateUiLiteral(language, 'Search');

  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1 text-sm text-sidebar-foreground/80">
      <span className="font-medium">{searchLabel}</span>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/65">
        {isMacPlatform() ? (
          <span aria-label={translateUiLiteral(language, 'Command')} className={shortcutKeyClassName}>
            <NavigationCommandPaletteIcon className="size-3.5" />
          </span>
        ) : (
          <span className={cn(shortcutKeyClassName, 'px-2 text-[0.68rem] uppercase tracking-[0.08em]')}>Ctrl</span>
        )}
        <span className={shortcutKeyClassName}>K</span>
      </span>
    </div>
  );
}

function SidebarVersionPill({ language }: { language: 'en' | 'km' }) {
  const channel: ReleaseChannel = 'alpha';
  const VersionIcon = sidebarVersionIconByChannel[channel];
  const label = translateUiLiteral(language, 'Version Alpha');
  const tooltip = translateUiLiteral(language, 'Expect some bugs!');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-7 w-full max-w-full items-center justify-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 text-center text-xs font-semibold leading-none text-destructive shadow-[0_1px_0_rgba(255,255,255,0.45)]"
          data-slot="sidebar-version-pill"
          tabIndex={0}
          title={tooltip}
        >
          <VersionIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SettingsSidebarMenu({
  location,
  sections,
  pathname,
  showSidebarText,
  onNavigate,
  t,
}: {
  location: ReturnType<typeof useLocation>;
  sections: SettingsSectionConfig[];
  pathname: string;
  showSidebarText: boolean;
  onNavigate: () => void;
  t: (key: TranslationKey) => string;
}) {
  const activeSection = resolveSettingsSection(pathname);

  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      {sections.map((section) => {
        const label = t(section.titleKey);
        const isActive = section.id === activeSection.id;

        return (
          <SidebarMenuItem key={section.id}>
            <SidebarMenuButton
              asChild
              className="justify-start group-data-[collapsible=icon]:justify-center"
              isActive={isActive}
              tooltip={label}
            >
              <NavLink
                aria-label={label}
                className="group-data-[collapsible=icon]:justify-center"
                state={buildSidebarNavigationState(location)}
                to={buildRememberedPageHref(section.path)}
                onClick={onNavigate}
              >
                <section.icon className="size-4" />
                {showSidebarText ? <span>{label}</span> : null}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function SettingsBackToAppMenuItem({
  language,
  showSidebarText,
  onNavigate,
}: {
  language: 'en' | 'km';
  showSidebarText: boolean;
  onNavigate: () => void;
}) {
  const label = translateUiLiteral(language, 'Back to app');
  const { canGoBack, goBack, previousLocation } = useNavigationHistory();
  const fallbackHref = buildRememberedPageHref('/');
  const href = previousLocation ?? fallbackHref;

  return (
    <SidebarMenuButton
      asChild
      className="justify-start group-data-[collapsible=icon]:justify-center"
      tooltip={label}
    >
      <NavLink
        aria-label={label}
        className="group-data-[collapsible=icon]:justify-center"
        state={{ kaurKhorNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
        to={href}
        onClick={(event) => {
          onNavigate();
          if (!canGoBack) {
            return;
          }

          event.preventDefault();
          goBack();
        }}
      >
        <NavigationBackIcon className="size-4" />
        {showSidebarText ? <span>{label}</span> : null}
      </NavLink>
    </SidebarMenuButton>
  );
}

export function KaurKhorShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider
      defaultOpen
      style={{
        '--kaur-khor-shell-viewport-height': 'var(--kaur-khor-embedded-shell-content-height, var(--kaur-khor-effective-viewport-height, 100svh))',
      } as React.CSSProperties}
    >
      <KaurKhorShellFrame>{children}</KaurKhorShellFrame>
    </SidebarProvider>
  );
}

function KaurKhorShellFrame({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  usePageStateMemoryVersion();
  const {
    isHydrated,
    language,
    markUnlockedNavItemSeen,
    seenUnlockedNavItems,
    showAnalysisPage,
    showAutomationsPage,
    t,
  } = usePreferences();
  const inventory = useInventory();
  const { isBrowserRuntime } = useRuntimeMode();
  const { error, isLoading, isPreparingWorkspace, reload } = inventory;
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const showGlobalLoadingScreen =
    isPreparingWorkspace || (isLoading && !routeSupportsLocalLoadingState(location.pathname));
  const navigationAvailability = deriveNavigationAvailability(inventory);
  const settingsSections = visibleSettingsSections().filter(
    (section) => section.id !== 'updates' || !isBrowserRuntime,
  );
  const settingsCreditsSection = settingsSections.find((section) => section.id === 'credits');
  const settingsHelpSection = settingsSections.find((section) => section.id === 'help');
  const visibleSettingsGroups = settingsNavigationGroups(settingsSections).map((group) => ({
    ...group,
    sections: group.sections.filter(
      (section) => section.id !== 'history' || navigationAvailability.hasHistory,
    ),
  })).filter((group) => group.sections.length > 0);
  const visibleAppSections = APP_SECTIONS.filter((section) =>
    section.availabilityKey
      ? navigationAvailability[section.availabilityKey]
      : section.gatedNavItemId
        ? isUnlockedNavItemVisible(section.gatedNavItemId, navigationAvailability)
        : true,
  );
  const visibleAppSectionIds = new Set(visibleAppSections.map((section) => section.id));
  const visibleTreeSections: ShellTreeItemConfig[] = [
    APP_SECTIONS[0],
    visibleAppSectionIds.has('work')
      ? {
          ...APP_SECTIONS[1],
          children: [
            {
              id: 'queue',
              destination: buildRememberedInboxHref(),
              label: translateUiLiteral(language, 'Queue'),
              labelKey: 'navInbox',
              icon: NavigationTaskListIcon,
              matches: (pathname: string) => pathname === '/work/queue',
            },
            ...(showAutomationsPage && navigationAvailability.hasWorkIntake
              ? [{
                  id: 'intake' as const,
                  destination: '/work/intake',
                  label: translateUiLiteral(language, 'Intake'),
                  labelKey: 'navAutomations' as const,
                  icon: NavigationAutomationIcon,
                  matches: (pathname: string) => matchesSection(pathname, '/work/intake'),
                }]
              : []),
            ...(navigationAvailability.hasWorkCapture
              ? [{
                  id: 'capture' as const,
                  destination: '/work/capture',
                  labelKey: 'navCapture' as const,
                  icon: ActionCreatePackageIcon,
                  matches: (pathname: string) => matchesSection(pathname, '/work/capture'),
                  children: RECORD_UPDATE_LANES
                    .filter((lane) => lane.id !== 'custom')
                    .map((lane) => ({
                      id: `capture-${lane.id}` as const,
                      destination: lane.path,
                      label: translateUiLiteral(language, lane.title),
                      labelKey: 'navCapture' as const,
                      icon: captureLaneIconById[lane.id] ?? ActionCreatePackageIcon,
                      matches: (pathname: string) => pathname === lane.path,
                    })),
                }]
              : []),
          ],
        }
      : null,
    visibleAppSectionIds.has('catalog') ? APP_SECTIONS[2] : null,
    visibleAppSectionIds.has('insights')
      ? {
          ...APP_SECTIONS[3],
          children: [
            {
              id: 'insights-inventory',
              destination: buildRememberedInventoryHref(),
              label: translateUiLiteral(language, 'Inventory'),
              labelKey: 'navPerformance',
              icon: EntitySkuIcon,
              matches: (pathname: string) => pathname === '/insights/inventory' || pathname === '/insights/pressure',
            },
            {
              id: 'insights-financials',
              destination: buildRememberedFinancialsHref(),
              label: translateUiLiteral(language, 'Money'),
              labelKey: 'navFinancials',
              icon: EntityRevenueIcon,
              matches: (pathname: string) => pathname === '/insights/money',
            },
            ...(showAnalysisPage
              ? [{
                  id: 'insights-analysis' as const,
                  destination: buildRememberedAnalysisHref(),
                  labelKey: 'navAnalysis' as const,
                  icon: EntitySignalIcon,
                  matches: (pathname: string) => pathname === '/insights/explain',
                }]
              : []),
          ],
        }
      : null,
  ].filter((section): section is ShellTreeItemConfig => section != null);
  const isSettingsRoute = matchesSection(location.pathname, '/settings');

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const matchedGatedSection = APP_SECTIONS.find((section) =>
      section.gatedNavItemId && section.matches(location.pathname),
    );
    if (!matchedGatedSection?.gatedNavItemId) {
      return;
    }
    if (!isUnlockedNavItemVisible(matchedGatedSection.gatedNavItemId, navigationAvailability)) {
      return;
    }
    if (seenUnlockedNavItems[matchedGatedSection.gatedNavItemId]) {
      return;
    }

    void markUnlockedNavItemSeen(matchedGatedSection.gatedNavItemId);
  }, [isHydrated, location.pathname, markUnlockedNavItemSeen, navigationAvailability, seenUnlockedNavItems]);

  function isSectionNew(section: ShellSectionConfig) {
    return section.gatedNavItemId
      ? isUnlockedNavItemNew(section.gatedNavItemId, navigationAvailability, seenUnlockedNavItems)
      : false;
  }

  function handleSidebarNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  const showSidebarText = isMobile || state === 'expanded';
  const showSidebarVersionPill =
    showSidebarText &&
    !isMobile &&
    (typeof document === 'undefined' || document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape !== 'true');
  const mainContentInset = 'var(--spacing-page)';

  return (
    <>
      <a
        className="sr-only fixed top-4 left-4 z-50 rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-float)] focus:not-sr-only"
        href="#main-content"
      >
        {t('skipToContent')}
      </a>

      <Sidebar className="border-r border-sidebar-border/60" collapsible="icon" variant="sidebar">
        <SidebarHeader className="px-3 pt-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1.5">
          {showSidebarText ? (
            <div className="flex w-full min-w-0 flex-col gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    aria-label={t('collapseNavigation')}
                    className="group/brand flex h-10 w-full min-w-0 items-center gap-3 rounded-xl px-1 text-left text-foreground ring-sidebar-ring outline-none transition-colors hover:bg-sidebar-accent/55 focus-visible:ring-2"
                    data-testid="sidebar-collapse-toggle"
                    type="button"
                    onClick={toggleSidebar}
                  >
                    <span className="relative flex size-10 shrink-0 items-center justify-center">
                      <img
                        alt=""
                        aria-hidden="true"
                        className="size-5 transition-opacity duration-150 ease-out group-hover/brand:opacity-0 motion-reduce:transition-none"
                        src={brandLogo}
                      />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 ease-out group-hover/brand:opacity-100 motion-reduce:transition-none">
                        <NavigationRightPanelIcon aria-hidden="true" className="size-4.5" />
                      </span>
                    </span>
                    <span className="min-w-0 truncate text-[0.95rem] font-semibold leading-snug tracking-normal text-foreground">
                      {isSettingsRoute ? t('settingsTitle') : t('appBrand')}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>{t('collapseNavigation')}</TooltipContent>
              </Tooltip>
              {showSidebarVersionPill ? (
                <div className="w-full px-1">
                  <SidebarVersionPill language={language} />
                </div>
              ) : null}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={t('openNavigation')}
                  className="flex size-10 items-center justify-center rounded-[1.25rem] text-foreground ring-sidebar-ring outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2"
                  data-testid="sidebar-collapse-toggle"
                  type="button"
                  onClick={toggleSidebar}
                >
                  <NavigationRightPanelIcon aria-hidden="true" className="size-4.5 -scale-x-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>{t('openNavigation')}</TooltipContent>
            </Tooltip>
          )}
        </SidebarHeader>

        <SidebarContent className="flex flex-col px-2 pb-3 group-data-[collapsible=icon]:px-1.5">
          {isSettingsRoute ? (
            <div className="flex flex-1 flex-col gap-3">
              <SidebarGroup className={sidebarSectionGroupClassName}>
                <SidebarGroupContent>
                  <SettingsBackToAppMenuItem
                    language={language}
                    showSidebarText={showSidebarText}
                    onNavigate={handleSidebarNavigation}
                  />
                </SidebarGroupContent>
              </SidebarGroup>

              {visibleSettingsGroups.map((group) => (
                <SidebarGroup key={group.labelKey} className={sidebarSectionGroupClassName}>
                  <SidebarGroupLabel className={sidebarSectionLabelClassName}>{t(group.labelKey)}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SettingsSidebarMenu
                      location={location}
                      pathname={location.pathname}
                      sections={group.sections}
                      showSidebarText={showSidebarText}
                      t={t}
                      onNavigate={handleSidebarNavigation}
                    />
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              {visibleTreeSections.length > 0 ? (
                <SidebarGroup className={sidebarSectionGroupClassName}>
                  <SidebarGroupLabel className={sidebarSectionLabelClassName}>{t('sidebarSectionMain')}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarTreeMenu
                      location={location}
                      pathname={location.pathname}
                      sections={visibleTreeSections}
                      language={language}
                      showSidebarText={showSidebarText}
                      isSectionNew={isSectionNew}
                      t={t}
                      onNavigate={handleSidebarNavigation}
                    />
                  </SidebarGroupContent>
                </SidebarGroup>
              ) : null}
            </div>
          )}

          <SidebarGroup className="mt-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarGroupContent className="flex flex-col gap-1">
              <div
                className={cn(
                  'px-1 group-data-[collapsible=icon]:px-0',
                  isSettingsRoute ? 'mb-2' : 'mb-3 min-h-[13.5rem]',
                )}
                data-slot="embedded-sidebar-banner-slot"
              />
              {!isSettingsRoute ? (
                <div className="px-1 group-data-[collapsible=icon]:px-0">
                  <SidebarCommandPaletteHint language={language} showSidebarText={showSidebarText} />
                </div>
              ) : null}
              {isSettingsRoute && settingsHelpSection ? (
                <SettingsSidebarMenu
                  location={location}
                  pathname={location.pathname}
                  sections={[settingsHelpSection]}
                  showSidebarText={showSidebarText}
                  t={t}
                  onNavigate={handleSidebarNavigation}
                />
              ) : null}
              {isSettingsRoute && settingsCreditsSection ? (
                <SettingsSidebarMenu
                  location={location}
                  pathname={location.pathname}
                  sections={[settingsCreditsSection]}
                  showSidebarText={showSidebarText}
                  t={t}
                  onNavigate={handleSidebarNavigation}
                />
              ) : (
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="justify-start group-data-[collapsible=icon]:justify-center"
                      isActive={SETTINGS_SECTION.matches(location.pathname)}
                      tooltip={t(SETTINGS_SECTION.labelKey)}
                    >
                      <NavLink
                        aria-label={t(SETTINGS_SECTION.labelKey)}
                        className="group-data-[collapsible=icon]:justify-center"
                        data-sidebar-tree-depth={0}
                        state={{
                          ...buildKaurKhorNavigationState(location),
                          kaurKhorNavigationSource: SIDEBAR_NAVIGATION_SOURCE,
                        }}
                        to={buildRememberedPageHref(SETTINGS_SECTION.destination)}
                        onClick={handleSidebarNavigation}
                      >
                        <SETTINGS_SECTION.icon className="size-4" />
                        {showSidebarText ? <span>{t(SETTINGS_SECTION.labelKey)}</span> : null}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-h-0 overflow-hidden">
        <div
          className="flex min-h-0 flex-col overflow-hidden"
          data-slot="shell-viewport-frame"
          style={{ height: 'var(--kaur-khor-shell-viewport-height, 100svh)' }}
        >
          <main
            id="main-content"
            className="flex min-h-0 flex-1 flex-col overflow-auto py-5"
            data-slot="shell-main-content"
            style={{ paddingInline: mainContentInset }}
          >
            <div
              className="flex min-h-0 flex-1 w-full max-w-none flex-col gap-4"
              data-slot="shell-main-frame"
              data-testid="shell-main-frame"
            >
              <div
                className="flex items-center justify-between md:hidden"
                data-slot="mobile-sidebar-trigger-row"
              >
                <SidebarTrigger
                  aria-label={t('openNavigation')}
                  className="size-10 rounded-full border border-border bg-card"
                />
              </div>
              {error ? (
                <WorkspaceBanner
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void reload();
                      }}
                    >
                      <ActionRefreshIcon data-icon="inline-start" />
                      {t('retry')}
                    </Button>
                  }
                  description={error}
                  title={t('workspaceUnavailable')}
                  tone="destructive"
                />
              ) : null}
              {showGlobalLoadingScreen ? (
                <div
                  className="hero-mesh editorial-panel flex min-h-[68svh] w-full items-center justify-center rounded-[2rem] px-6 py-10"
                  data-testid="workspace-computing-screen"
                >
                  <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
                    <div className="flex size-16 items-center justify-center rounded-full border border-primary/20 bg-background/80 shadow-[var(--shadow-float)]">
                      <StatusLoadingIcon aria-hidden="true" className="size-7 animate-spin text-primary" />
                    </div>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
                      {t('workspaceLoadingTitle')}
                    </p>
                    <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.05em] text-foreground">
                      {t('workspaceComputingTitle')}
                    </h1>
                    <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-muted-foreground">
                      {t('workspaceComputingBody')}
                    </p>
                  </div>
                </div>
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </SidebarInset>
      <LoadingMoreIntervalsIsland label="Saving..." visible={inventory.isSaving} />
    </>
  );
}
