import { NavLink, useLocation } from 'react-router-dom';
import {
  Boxes,
  ClipboardList,
  LoaderCircle,
  LayoutDashboard,
  NotebookTabs,
  PanelRight,
  Rows2,
  Rows3,
  SearchCheck,
  Settings,
  TrendingUp,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { SIDEBAR_NAVIGATION_SOURCE } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';

type ShellSectionConfig = {
  destination: string;
  icon: typeof LayoutDashboard;
  id: 'overview' | 'recordUpdate' | 'performance' | 'analysis' | 'catalog' | 'operations' | 'settings';
  labelKey: 'navOverview' | 'navRecordUpdate' | 'navPerformance' | 'navAnalysis' | 'navCatalog' | 'navOperations' | 'navSettings';
  matches: (pathname: string) => boolean;
};

type SidebarSectionLabelKey = 'sidebarSectionMain' | 'sidebarSectionOther';

const sidebarSectionGroupClassName = 'py-1.5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0';
const sidebarSectionLabelClassName =
  'group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:opacity-0';

function matchesSection(pathname: string, sectionRoot: string) {
  return pathname === sectionRoot || pathname.startsWith(`${sectionRoot}/`);
}

const PRIMARY_SECTIONS: ShellSectionConfig[] = [
  {
    id: 'overview',
    destination: '/',
    labelKey: 'navOverview',
    icon: LayoutDashboard,
    matches: (pathname) => pathname === '/',
  },
  {
    id: 'recordUpdate',
    destination: '/record-update',
    labelKey: 'navRecordUpdate',
    icon: ClipboardList,
    matches: (pathname) => matchesSection(pathname, '/record-update') || matchesSection(pathname, '/operations/session'),
  },
  {
    id: 'performance',
    destination: '/performance',
    labelKey: 'navPerformance',
    icon: TrendingUp,
    matches: (pathname) => matchesSection(pathname, '/performance'),
  },
  {
    id: 'catalog',
    destination: '/catalog',
    labelKey: 'navCatalog',
    icon: Boxes,
    matches: (pathname) => matchesSection(pathname, '/catalog'),
  },
];

const SECONDARY_SECTIONS: ShellSectionConfig[] = [
  {
    id: 'analysis',
    destination: '/analysis',
    labelKey: 'navAnalysis',
    icon: SearchCheck,
    matches: (pathname) => matchesSection(pathname, '/analysis'),
  },
  {
    id: 'operations',
    destination: '/operations',
    labelKey: 'navOperations',
    icon: NotebookTabs,
    matches: (pathname) => matchesSection(pathname, '/operations'),
  },
];

const SETTINGS_SECTION: ShellSectionConfig = {
  id: 'settings',
  destination: '/settings',
  labelKey: 'navSettings',
  icon: Settings,
  matches: (pathname) => matchesSection(pathname, '/settings'),
};

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
  const { applyDisplayViewMode, displayViewMode, t } = usePreferences();
  const { error, isLoading, reload } = useInventory();
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();

  function handleSidebarNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  const showSidebarText = isMobile || state === 'expanded';
  const mainContentInset = 'var(--spacing-page)';
  const viewModeLabel = displayViewMode === 'maximal' ? 'Maximal View' : 'Minimal View';
  const ViewModeIcon = displayViewMode === 'maximal' ? Rows3 : Rows2;

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
                      <PanelRight aria-hidden="true" className="size-4.5" />
                    </span>
                  </span>
                  <span className="min-w-0 truncate text-[0.82rem] font-semibold uppercase tracking-[0.24em] text-foreground">
                    {t('appBrand')}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>Close sidebar</TooltipContent>
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
                  <PanelRight aria-hidden="true" className="size-4.5 -scale-x-100" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>Open sidebar</TooltipContent>
            </Tooltip>
          )}
        </SidebarHeader>

        <SidebarContent className="flex flex-col px-2 pb-3 group-data-[collapsible=icon]:px-1.5">
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
                  sections={SECONDARY_SECTIONS}
                  showSidebarText={showSidebarText}
                  t={t}
                  onNavigate={handleSidebarNavigation}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          </div>

          <SidebarGroup className="mt-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarGroupContent>
              <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                <SidebarMenuItem key={viewModeLabel}>
                  <SidebarMenuButton
                    aria-label={viewModeLabel}
                    className={cn(
                      'justify-start rounded-full border border-sidebar-border/70 bg-sidebar-accent/45 font-medium hover:bg-sidebar-accent',
                      'group-data-[collapsible=icon]:rounded-[1rem] group-data-[collapsible=icon]:border-sidebar-border/0 group-data-[collapsible=icon]:bg-transparent',
                    )}
                    data-testid="sidebar-view-mode-toggle"
                    tooltip={viewModeLabel}
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.blur();
                      void applyDisplayViewMode(displayViewMode === 'maximal' ? 'minimal' : 'maximal');
                    }}
                  >
                    <ViewModeIcon className="size-4 shrink-0" />
                    {showSidebarText ? <span className="min-w-0 truncate text-left">{viewModeLabel}</span> : null}
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
              {isLoading ? (
                <div
                  className="hero-mesh editorial-panel flex min-h-[68svh] w-full items-center justify-center rounded-[2rem] px-6 py-10"
                  data-testid="workspace-computing-screen"
                >
                  <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
                    <div className="flex size-16 items-center justify-center rounded-full border border-primary/20 bg-background/80 shadow-[var(--shadow-float)]">
                      <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-primary" />
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
