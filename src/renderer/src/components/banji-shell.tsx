import { NavLink, useLocation } from 'react-router-dom';
import {
  Boxes,
  ClipboardPen,
  LayoutDashboard,
  LayoutList,
  PanelRightClose,
  PanelRightOpen,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';

type ShellSectionConfig = {
  destination: string;
  icon: typeof LayoutDashboard;
  id: 'overview' | 'catalog' | 'operations' | 'planning' | 'settings';
  labelKey:
    | 'navOverview'
    | 'navCatalog'
    | 'navOperations'
    | 'navPlanning'
    | 'navSettings';
  matches: (pathname: string) => boolean;
};

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
    id: 'catalog',
    destination: '/catalog',
    labelKey: 'navCatalog',
    icon: Boxes,
    matches: (pathname) => matchesSection(pathname, '/catalog'),
  },
  {
    id: 'operations',
    destination: '/operations',
    labelKey: 'navOperations',
    icon: ClipboardPen,
    matches: (pathname) => matchesSection(pathname, '/operations'),
  },
  {
    id: 'planning',
    destination: '/planning',
    labelKey: 'navPlanning',
    icon: LayoutList,
    matches: (pathname) => matchesSection(pathname, '/planning'),
  },
];

const SETTINGS_SECTION: ShellSectionConfig = {
  id: 'settings',
  destination: '/settings',
  labelKey: 'navSettings',
  icon: Settings,
  matches: (pathname) => matchesSection(pathname, '/settings'),
};

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
  const { t } = usePreferences();
  const { error, isLoading, reload } = useInventory();
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar();

  function handleSidebarNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  const isExpandedLayout = isMobile || state === 'expanded';
  const showSidebarText = isMobile || state === 'expanded';

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
                    <PanelRightOpen aria-hidden="true" className="size-4.5" />
                  </span>
                </span>
                <span className="min-w-0 truncate text-[0.82rem] font-semibold uppercase tracking-[0.24em] text-foreground">
                  {t('appBrand')}
                </span>
            </button>
          ) : (
            <button
              aria-label={t('openNavigation')}
              className="flex size-10 items-center justify-center rounded-[1.25rem] text-foreground ring-sidebar-ring outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2"
              data-testid="sidebar-collapse-toggle"
              type="button"
              onClick={toggleSidebar}
            >
              <PanelRightClose aria-hidden="true" className="size-4.5" />
            </button>
          )}
        </SidebarHeader>

        <SidebarContent className="flex flex-col px-2 pb-3 group-data-[collapsible=icon]:px-1.5">
          <div className="flex flex-1 flex-col gap-6">
            <SidebarGroup className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
              <SidebarGroupContent>
                <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                  {PRIMARY_SECTIONS.map((section) => {
                    const label = t(section.labelKey);
                    const isActive = section.matches(location.pathname);

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
                            to={section.destination}
                            onClick={handleSidebarNavigation}
                          >
                            <section.icon className="size-4" />
                            {showSidebarText ? <span>{label}</span> : null}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>

          <SidebarGroup className="mt-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarGroupContent>
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
          <main id="main-content" className="flex-1 px-[var(--spacing-page)] py-5">
            <div
              className={cn(
                'flex w-full flex-col gap-4',
                isExpandedLayout ? 'mx-auto max-w-[1500px]' : 'max-w-none',
              )}
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
                  title={t('apiUnavailable')}
                  tone="destructive"
                />
              ) : null}
              {isLoading ? (
                <WorkspaceBanner
                  description={t('dashboardHealthStarting')}
                  title={t('backendStarting')}
                />
              ) : null}
              {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </>
  );
}
