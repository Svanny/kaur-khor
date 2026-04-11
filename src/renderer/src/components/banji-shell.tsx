import { NavLink, useLocation } from 'react-router-dom';
import {
  NavigationAnalysisIcon,
  NavigationBackIcon,
  NavigationCatalogIcon,
  NavigationCommandPaletteIcon,
  NavigationDashboardIcon,
  NavigationLogsIcon,
  NavigationRightPanelIcon,
  NavigationSettingsIcon,
  NavigationTaskListIcon,
  NavigationPerformanceIcon,
} from '@icons/navigation';
import { StatusHelpBadgeIcon, StatusLoadingIcon } from '@icons/status';
import type { IconComponent } from '@icons';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { WorkspaceBanner } from '@/components/system/workspace';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SETTINGS_SECTIONS, resolveSettingsSection, type SettingsSectionConfig } from '@/lib/settings-navigation';
import { translateUiLiteral, type TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { SIDEBAR_NAVIGATION_SOURCE } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';

type ShellSectionConfig = {
  destination: string;
  icon: IconComponent;
  id: 'overview' | 'recordUpdate' | 'performance' | 'analysis' | 'catalog' | 'operations' | 'archive' | 'help' | 'settings';
  labelKey: 'navOverview' | 'navRecordUpdate' | 'navPerformance' | 'navAnalysis' | 'navCatalog' | 'navOperations' | 'navArchive' | 'navHelp' | 'navSettings';
  matches: (pathname: string) => boolean;
};

type SidebarSectionLabelKey = 'sidebarSectionMain' | 'sidebarSectionOther';

const sidebarSectionGroupClassName = 'py-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0';
const sidebarSectionLabelClassName =
  'group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-0';
const shortcutKeyClassName =
  'inline-flex h-6 min-w-6 items-center justify-center rounded-[0.7rem] border border-sidebar-border/70 bg-sidebar-accent/35 px-1.5 text-[0.72rem] font-semibold text-sidebar-foreground/70 shadow-[0_1px_0_rgba(255,255,255,0.45)]';

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
  return matchesSection(pathname, '/catalog') || matchesSection(pathname, '/analysis');
}

const PRIMARY_SECTIONS: ShellSectionConfig[] = [
  {
    id: 'overview',
    destination: '/',
    labelKey: 'navOverview',
    icon: NavigationDashboardIcon,
    matches: (pathname) => pathname === '/',
  },
  {
    id: 'recordUpdate',
    destination: '/record-update',
    labelKey: 'navRecordUpdate',
    icon: NavigationTaskListIcon,
    matches: (pathname) => matchesSection(pathname, '/record-update') || matchesSection(pathname, '/operations/session'),
  },
  {
    id: 'performance',
    destination: '/performance',
    labelKey: 'navPerformance',
    icon: NavigationPerformanceIcon,
    matches: (pathname) => matchesSection(pathname, '/performance'),
  },
  {
    id: 'catalog',
    destination: '/catalog',
    labelKey: 'navCatalog',
    icon: NavigationCatalogIcon,
    matches: (pathname) => matchesSection(pathname, '/catalog'),
  },
];

const SECONDARY_SECTIONS: ShellSectionConfig[] = [
  {
    id: 'analysis',
    destination: '/analysis',
    labelKey: 'navAnalysis',
    icon: NavigationAnalysisIcon,
    matches: (pathname) => matchesSection(pathname, '/analysis'),
  },
  {
    id: 'operations',
    destination: '/operations',
    labelKey: 'navOperations',
    icon: NavigationLogsIcon,
    matches: (pathname) => pathname === '/operations',
  },
];

const SETTINGS_SECTION: ShellSectionConfig = {
  id: 'settings',
  destination: '/settings',
  labelKey: 'navSettings',
  icon: NavigationSettingsIcon,
  matches: (pathname) => matchesSection(pathname, '/settings'),
};

const HELP_SECTION: ShellSectionConfig = {
  id: 'help',
  destination: '/help',
  labelKey: 'navHelp',
  icon: StatusHelpBadgeIcon,
  matches: (pathname) => matchesSection(pathname, '/help'),
};

const SETTINGS_MAIN_SECTIONS = SETTINGS_SECTIONS.filter((section) => section.id !== 'credits');
const SETTINGS_CREDITS_SECTION = SETTINGS_SECTIONS.find((section) => section.id === 'credits');

function SidebarSectionMenu({
  sections,
  pathname,
  showSidebarText,
  onNavigate,
  t,
}: {
  sections: ShellSectionConfig[];
  pathname: string;
  showSidebarText: boolean;
  onNavigate: () => void;
  t: (key: ShellSectionConfig['labelKey'] | SidebarSectionLabelKey) => string;
}) {
  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      {sections.map((section) => {
        const label = t(section.labelKey);
        const isActive = section.matches(pathname);

        return (
          <SidebarMenuItem key={section.destination}>
            <SidebarMenuButton
              asChild
              className="justify-start group-data-[collapsible=icon]:justify-center"
              isActive={isActive}
              tooltip={label}
            >
              <NavLink
                aria-label={label}
                className="group-data-[collapsible=icon]:justify-center"
                state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
                to={section.destination}
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

function SidebarCommandPaletteHint({ language, showSidebarText }: { language: 'en' | 'km'; showSidebarText: boolean }) {
  const shortcutLabel = isMacPlatform() ? '⌘ + K' : 'Ctrl + K';
  const openPaletteLabel = translateUiLiteral(language, 'Open command palette with {shortcut}', {
    shortcut: shortcutLabel,
  });

  if (!showSidebarText) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            aria-label={openPaletteLabel}
            className="flex size-8 items-center justify-center rounded-[1rem] border border-sidebar-border/60 bg-sidebar-accent/35 text-sidebar-foreground/80"
          >
            <NavigationCommandPaletteIcon className="size-4" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>{openPaletteLabel}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1 text-sm text-sidebar-foreground/80">
      <span className="font-medium">{translateUiLiteral(language, 'Search')}</span>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/65">
        {isMacPlatform() ? (
          <span aria-label="Command" className={shortcutKeyClassName}>
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

function SettingsSidebarMenu({
  sections,
  pathname,
  showSidebarText,
  onNavigate,
  t,
}: {
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
                state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
                to={section.path}
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

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className="justify-start group-data-[collapsible=icon]:justify-center"
        tooltip={label}
      >
        <NavLink
          aria-label={label}
          className="group-data-[collapsible=icon]:justify-center"
          state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
          to="/"
          onClick={onNavigate}
        >
          <NavigationBackIcon className="size-4" />
          {showSidebarText ? <span>{label}</span> : null}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function BanjiShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <BanjiShellFrame>{children}</BanjiShellFrame>
    </SidebarProvider>
  );
}

function BanjiShellFrame({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { language, showAnalysisPage, t } = usePreferences();
  const { error, isLoading, isPreparingWorkspace, isSaving, latestRun, reload } = useInventory();
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const isWorkspaceComputing = latestRun?.status === 'queued' || latestRun?.status === 'running';
  const isSavingRecordUpdate = isSaving && matchesSection(location.pathname, '/record-update');
  const showGlobalLoadingScreen =
    isPreparingWorkspace || isWorkspaceComputing || isSavingRecordUpdate || (isLoading && !routeSupportsLocalLoadingState(location.pathname));
  const secondarySections = showAnalysisPage
    ? SECONDARY_SECTIONS
    : SECONDARY_SECTIONS.filter((section) => section.id !== 'analysis');
  const isSettingsRoute =
    matchesSection(location.pathname, '/settings') || matchesSection(location.pathname, '/operations/archive');

  function handleSidebarNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  const showSidebarText = isMobile || state === 'expanded';
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
                  <span className="min-w-0 truncate text-[0.82rem] font-semibold uppercase tracking-[0.24em] text-foreground">
                    {isSettingsRoute ? t('settingsTitle') : t('appBrand')}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>{t('collapseNavigation')}</TooltipContent>
            </Tooltip>
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
            <div className="flex flex-1 flex-col">
              <SidebarGroup className={sidebarSectionGroupClassName}>
                <SidebarGroupContent>
                  <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                    <SettingsBackToAppMenuItem
                      language={language}
                      showSidebarText={showSidebarText}
                      onNavigate={handleSidebarNavigation}
                    />
                  </SidebarMenu>
                  <div className="mt-1.5">
                    <SettingsSidebarMenu
                      pathname={location.pathname}
                      sections={SETTINGS_MAIN_SECTIONS}
                      showSidebarText={showSidebarText}
                      t={t}
                      onNavigate={handleSidebarNavigation}
                    />
                  </div>
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-3">
              <SidebarGroup className={sidebarSectionGroupClassName}>
                <SidebarGroupLabel className={sidebarSectionLabelClassName}>{t('sidebarSectionMain')}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarSectionMenu
                    pathname={location.pathname}
                    sections={PRIMARY_SECTIONS}
                    showSidebarText={showSidebarText}
                    t={t}
                    onNavigate={handleSidebarNavigation}
                  />
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup className={sidebarSectionGroupClassName}>
                <SidebarGroupLabel className={sidebarSectionLabelClassName}>{t('sidebarSectionOther')}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarSectionMenu
                    pathname={location.pathname}
                    sections={secondarySections}
                    showSidebarText={showSidebarText}
                    t={t}
                    onNavigate={handleSidebarNavigation}
                  />
                </SidebarGroupContent>
              </SidebarGroup>
            </div>
          )}

          <SidebarGroup className="mt-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarGroupContent>
              {!isSettingsRoute ? (
                <div className="mb-3 px-1 group-data-[collapsible=icon]:mb-2 group-data-[collapsible=icon]:px-0">
                  <SidebarCommandPaletteHint language={language} showSidebarText={showSidebarText} />
                </div>
              ) : null}
              {isSettingsRoute ? (
                SETTINGS_CREDITS_SECTION ? (
                  <SettingsSidebarMenu
                    pathname={location.pathname}
                    sections={[SETTINGS_CREDITS_SECTION]}
                    showSidebarText={showSidebarText}
                    t={t}
                    onNavigate={handleSidebarNavigation}
                  />
                ) : null
              ) : (
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      className="justify-start group-data-[collapsible=icon]:justify-center"
                      isActive={HELP_SECTION.matches(location.pathname)}
                      tooltip={t(HELP_SECTION.labelKey)}
                    >
                      <NavLink
                        aria-label={t(HELP_SECTION.labelKey)}
                        className="group-data-[collapsible=icon]:justify-center"
                        state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
                        to={HELP_SECTION.destination}
                        onClick={handleSidebarNavigation}
                      >
                        <HELP_SECTION.icon className="size-4" />
                        {showSidebarText ? <span>{t(HELP_SECTION.labelKey)}</span> : null}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
                        state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
                        to={SETTINGS_SECTION.destination}
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

      <SidebarInset>
        <div className="flex min-h-svh flex-col">
          <main id="main-content" className="flex-1 py-5" style={{ paddingInline: mainContentInset }}>
            <div
              className="flex w-full max-w-none flex-col gap-4"
              data-testid="shell-main-frame"
            >
              <div className="flex items-center justify-between md:hidden">
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
                    <p className="mt-6 max-w-lg rounded-[1.4rem] border border-border/70 bg-background/75 px-5 py-4 text-sm leading-6 text-muted-foreground shadow-[var(--shadow-soft)]">
                      {t('workspaceComputingHint')}
                    </p>
                    <p className="mt-5 text-sm text-muted-foreground">
                      {t('workspaceStarting')}
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
    </>
  );
}
