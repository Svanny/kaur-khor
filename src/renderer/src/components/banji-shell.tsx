import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { DesktopSeenUnlockedNavItemId } from '@shared/ipc';
import {
  NavigationBackIcon,
  NavigationCatalogIcon,
  NavigationCommandPaletteIcon,
  NavigationDashboardIcon,
  NavigationRightPanelIcon,
  NavigationSettingsIcon,
  NavigationTaskListIcon,
  NavigationWorkIcon,
  NavigationPerformanceIcon,
} from '@icons/navigation';
import { StatusLoadingIcon } from '@icons/status';
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { WorkspaceBanner } from '@/components/system/workspace';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { buildRememberedPageHref, usePageStateMemoryVersion } from '@/lib/page-state-memory';
import { SETTINGS_SECTIONS, resolveSettingsSection, type SettingsSectionConfig } from '@/lib/settings-navigation';
import {
  deriveNavigationAvailability,
  isUnlockedNavItemNew,
  isUnlockedNavItemVisible,
  type NavigationAvailability,
} from '@/lib/navigation-availability';
import { translateUiLiteral, type TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { SIDEBAR_NAVIGATION_SOURCE } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';
import { ActionRefreshIcon } from '@icons/actions';

type ShellSectionConfig = {
  destination: string;
  availabilityKey?: keyof NavigationAvailability;
  gatedNavItemId?: DesktopSeenUnlockedNavItemId;
  icon: IconComponent;
  id:
    | 'catalog'
    | 'home'
    | 'insights'
    | 'work'
    | 'settings';
  labelKey:
    | 'navHome'
    | 'navWork'
    | 'navInsights'
    | 'navCatalog'
    | 'navSettings';
  matches: (pathname: string) => boolean;
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

const SETTINGS_CREDITS_SECTION = SETTINGS_SECTIONS.find((section) => section.id === 'credits');
const SETTINGS_HELP_SECTION = SETTINGS_SECTIONS.find((section) => section.id === 'help');
const SETTINGS_SECTION_LOOKUP = new Map(SETTINGS_SECTIONS.filter((section) => section.id !== 'credits').map((section) => [section.id, section]));
const orderedSettingsSections = (ids: Array<SettingsSectionConfig['id']>) =>
  ids
    .map((id) => SETTINGS_SECTION_LOOKUP.get(id))
    .filter((section): section is SettingsSectionConfig => section != null);
const SETTINGS_NAVIGATION_GROUPS: SettingsSidebarGroupConfig[] = [
  {
    labelKey: 'sidebarSectionMain',
    sections: orderedSettingsSections(['workspace', 'interface', 'automation', 'history']),
  },
  {
    labelKey: 'sidebarSectionOther',
    sections: orderedSettingsSections(['local-data', 'planning', 'benchmarks', 'danger-zone']),
  },
];

function SidebarSectionMenu({
  language,
  sections,
  pathname,
  showSidebarText,
  onNavigate,
  isSectionNew,
  t,
}: {
  language: 'en' | 'km';
  sections: ShellSectionConfig[];
  pathname: string;
  showSidebarText: boolean;
  onNavigate: () => void;
  isSectionNew: (section: ShellSectionConfig) => boolean;
  t: (key: ShellSectionConfig['labelKey'] | SidebarSectionLabelKey) => string;
}) {
  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      {sections.map((section) => {
        const label = t(section.labelKey);
        const newLabel = translateUiLiteral(language, 'New!');
        const isActive = section.matches(pathname);
        const isNew = isSectionNew(section);

        return (
          <SidebarMenuItem key={section.destination} className="group/menu-item">
            <SidebarMenuButton
              asChild
              className={cn(
                'justify-start group-data-[collapsible=icon]:justify-center',
                isNew && !isActive ? 'border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15' : null,
              )}
              isActive={isActive}
              tooltip={isNew ? newLabel : label}
            >
              <NavLink
                aria-label={label}
                className="group-data-[collapsible=icon]:justify-center"
                state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
                to={buildRememberedPageHref(section.destination)}
                onClick={onNavigate}
              >
                <section.icon className="size-4" />
                {showSidebarText ? <span>{label}</span> : null}
              </NavLink>
            </SidebarMenuButton>
            {isNew && showSidebarText ? (
              <SidebarMenuBadge className="right-2 top-1/2 -translate-y-1/2 rounded-full bg-primary px-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary-foreground">
                {newLabel}
              </SidebarMenuBadge>
            ) : null}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function SidebarCommandPaletteHint({ language, showSidebarText }: { language: 'en' | 'km'; showSidebarText: boolean }) {
  const shortcutLabel = isMacPlatform() ? '⌘ + K' : 'Ctrl + K';

  if (!showSidebarText) {
    return null;
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

  return (
    <SidebarMenuButton
      asChild
      className="justify-start group-data-[collapsible=icon]:justify-center"
      tooltip={label}
    >
      <NavLink
        aria-label={label}
        className="group-data-[collapsible=icon]:justify-center"
        state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
        to={buildRememberedPageHref('/')}
        onClick={onNavigate}
      >
        <NavigationBackIcon className="size-4" />
        {showSidebarText ? <span>{label}</span> : null}
      </NavLink>
    </SidebarMenuButton>
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
  usePageStateMemoryVersion();
  const {
    isHydrated,
    language,
    markUnlockedNavItemSeen,
    seenUnlockedNavItems,
    t,
  } = usePreferences();
  const inventory = useInventory();
  const { error, isLoading, isPreparingWorkspace, reload } = inventory;
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();
  const showGlobalLoadingScreen =
    isPreparingWorkspace || (isLoading && !routeSupportsLocalLoadingState(location.pathname));
  const navigationAvailability = deriveNavigationAvailability(inventory);
  const visibleSettingsGroups = SETTINGS_NAVIGATION_GROUPS.map((group) => ({
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
                  <span className="min-w-0 truncate text-[0.95rem] font-semibold leading-snug tracking-normal text-foreground">
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
              {visibleAppSections.length > 0 ? (
                <SidebarGroup className={sidebarSectionGroupClassName}>
                  <SidebarGroupLabel className={sidebarSectionLabelClassName}>{t('sidebarSectionMain')}</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarSectionMenu
                      pathname={location.pathname}
                      sections={visibleAppSections}
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
              {!isSettingsRoute ? (
                <div className="px-1 group-data-[collapsible=icon]:px-0">
                  <SidebarCommandPaletteHint language={language} showSidebarText={showSidebarText} />
                </div>
              ) : null}
              {isSettingsRoute && SETTINGS_HELP_SECTION ? (
                <SettingsSidebarMenu
                  pathname={location.pathname}
                  sections={[SETTINGS_HELP_SECTION]}
                  showSidebarText={showSidebarText}
                  t={t}
                  onNavigate={handleSidebarNavigation}
                />
              ) : null}
              {isSettingsRoute && SETTINGS_CREDITS_SECTION ? (
                <SettingsSidebarMenu
                  pathname={location.pathname}
                  sections={[SETTINGS_CREDITS_SECTION]}
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
                        state={{ banjiNavigationSource: SIDEBAR_NAVIGATION_SOURCE }}
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
        <div className="flex h-svh min-h-0 flex-col overflow-hidden">
          <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-auto py-5" style={{ paddingInline: mainContentInset }}>
            <div
              className="flex min-h-0 flex-1 w-full max-w-none flex-col gap-4"
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
