import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Settings2,
  SquareChartGantt,
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
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';

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

  const navigation = useMemo(
    () => [
      {
        to: '/',
        label: t('navDashboard'),
        icon: LayoutDashboard,
        active: location.pathname === '/',
      },
      {
        to: '/inventory',
        label: t('navInventory'),
        icon: Boxes,
        active:
          location.pathname.startsWith('/inventory') &&
          !location.pathname.includes('/ranking') &&
          !location.pathname.includes('/stock'),
      },
      {
        to: '/inventory/stock',
        label: t('navStock'),
        icon: SquareChartGantt,
        active: location.pathname.startsWith('/inventory/stock'),
      },
      {
        to: '/settings',
        label: t('navSettings'),
        icon: Settings2,
        active: location.pathname === '/settings',
      },
    ],
    [location.pathname, t],
  );

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
        <SidebarHeader className="px-2 pt-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1.5">
          <button
            aria-label={state === 'expanded' ? t('collapseNavigation') : t('openNavigation')}
            className="group/brand flex h-14 w-full items-center gap-3 overflow-hidden rounded-2xl border border-border/60 bg-card/80 px-2.5 text-left text-foreground shadow-[0_12px_30px_rgba(27,15,7,0.08)] ring-sidebar-ring outline-none transition-colors hover:border-border hover:bg-card/95 focus-visible:ring-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-[1.25rem] group-data-[collapsible=icon]:px-0"
            data-testid="sidebar-brand-toggle"
            type="button"
            onClick={toggleSidebar}
          >
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-[1rem] bg-background/85 shadow-[0_8px_24px_rgba(27,15,7,0.06)] group-data-[collapsible=icon]:size-8">
              <img
                alt=""
                aria-hidden="true"
                className="size-5 transition-opacity duration-100 ease-out group-hover/brand:opacity-0 motion-reduce:transition-none"
                src={brandLogo}
              />
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-100 ease-out group-hover/brand:opacity-100 motion-reduce:transition-none">
                {state === 'expanded' ? (
                  <ChevronLeft aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronRight aria-hidden="true" className="size-4" />
                )}
              </span>
            </span>
            {showSidebarText ? (
              <span className="min-w-0 truncate text-[0.82rem] font-semibold uppercase tracking-[0.24em] text-primary/85">
                {t('appBrand')}
              </span>
            ) : null}
          </button>
        </SidebarHeader>

        <SidebarContent className="px-2 pb-3 group-data-[collapsible=icon]:px-1.5">
          <SidebarGroup className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
            <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="group-data-[collapsible=icon]:items-center">
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      className="justify-start group-data-[collapsible=icon]:justify-center"
                      isActive={item.active}
                      tooltip={item.label}
                    >
                      <NavLink
                        aria-label={item.label}
                        className="group-data-[collapsible=icon]:justify-center"
                        to={item.to}
                        onClick={handleSidebarNavigation}
                      >
                        <item.icon className="size-4" />
                        {showSidebarText ? <span>{item.label}</span> : null}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
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
