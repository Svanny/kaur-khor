import { useMemo } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Boxes,
  LayoutDashboard,
  ListOrdered,
  PackagePlus,
  PanelsTopLeft,
  RefreshCcw,
  Settings2,
  SquareChartGantt,
} from 'lucide-react';
import type { DesktopAppContext } from '@shared/ipc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { StatusBadge, WorkspaceBanner } from '@/components/system/workspace';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';

type RouteMeta = {
  title: string;
  description: string;
};

function getRouteMeta(pathname: string, t: (key: any) => string): RouteMeta {
  if (pathname === '/') {
    return {
      title: t('navDashboard'),
      description: t('dashboardBody'),
    };
  }

  if (pathname.startsWith('/inventory/stock')) {
    return {
      title: t('navStock'),
      description: t('stockUpdateBody'),
    };
  }

  if (pathname.startsWith('/inventory/ranking')) {
    return {
      title: t('navRanking'),
      description: t('rankingBody'),
    };
  }

  if (pathname.startsWith('/inventory')) {
    return {
      title: t('navInventory'),
      description: t('inventoryBody'),
    };
  }

  return {
    title: t('navSettings'),
    description: t('settingsStorage'),
  };
}

export function BanjiShell({
  desktopContext,
  children,
}: {
  desktopContext: DesktopAppContext;
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen>
      <BanjiShellFrame desktopContext={desktopContext}>{children}</BanjiShellFrame>
    </SidebarProvider>
  );
}

function BanjiShellFrame({
  desktopContext,
  children,
}: {
  desktopContext: DesktopAppContext;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const { t } = usePreferences();
  const { error, isLoading } = useInventory();
  const { isMobile, setOpenMobile } = useSidebar();

  const routeMeta = getRouteMeta(location.pathname, t);

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
        to: '/inventory/ranking',
        label: t('navRanking'),
        icon: ListOrdered,
        active: location.pathname.startsWith('/inventory/ranking'),
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

  const runtimeTone =
    desktopContext.backendError || error ? 'destructive' : isLoading ? 'outline' : 'secondary';
  const runtimeLabel = desktopContext.backendError
    ? t('backendError')
    : isLoading
      ? t('backendStarting')
      : t('backendReady');

  function handleSidebarNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <>
      <a
        className="sr-only fixed top-4 left-4 z-50 rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-float)] focus:not-sr-only"
        href="#main-content"
      >
        {t('skipToContent')}
      </a>

      <Sidebar className="border-r border-sidebar-border/60" variant="inset">
        <SidebarHeader className="gap-4 px-3 py-4">
          <Link
            className="editorial-panel flex items-center gap-3 rounded-3xl px-3 py-3"
            to="/"
            onClick={handleSidebarNavigation}
          >
            <img
              alt="Banji logo"
              className="size-12 rounded-2xl bg-background/80 p-2 shadow-[0_10px_30px_rgba(27,15,7,0.08)]"
              src={brandLogo}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                {t('appBrand')}
              </p>
              <p className="text-lg font-semibold tracking-[-0.03em]">{t('appTitle')}</p>
            </div>
          </Link>

          <Card className="paper-grid border-white/70">
            <CardHeader className="gap-1 px-4">
              <CardDescription className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardEyebrow')}
              </CardDescription>
              <CardTitle className="text-base">Desktop operations cockpit</CardTitle>
            </CardHeader>
            <CardContent className="px-4 text-sm leading-6 text-muted-foreground">
              {t('dashboardHealthDescription')}
            </CardContent>
          </Card>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                      <NavLink to={item.to} onClick={handleSidebarNavigation}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="gap-3 px-3 pb-4">
          <Card size="sm">
            <CardHeader className="gap-2 px-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">Runtime status</CardTitle>
                <Badge className="rounded-full px-2.5 py-1 text-[0.7rem]" variant={runtimeTone}>
                  {runtimeLabel}
                </Badge>
              </div>
              <CardDescription>{routeMeta.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 px-4 pb-4">
              <Button asChild className="justify-start" size="sm" variant="secondary">
                <Link to="/inventory/skus/new" onClick={handleSidebarNavigation}>
                  <PackagePlus data-icon="inline-start" />
                  {t('createSkuAction')}
                </Link>
              </Button>
              <Button asChild className="justify-start" size="sm" variant="outline">
                <Link to="/inventory/services/new" onClick={handleSidebarNavigation}>
                  <PanelsTopLeft data-icon="inline-start" />
                  {t('createServiceAction')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-transparent">
        <div className="flex min-h-svh flex-col">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-4 px-[var(--spacing-page)] py-4">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger
                  aria-label={t('openNavigation')}
                  className="size-10 rounded-full border border-border bg-card md:hidden"
                />
                <SidebarTrigger
                  aria-label={t('collapseNavigation')}
                  className="hidden size-10 rounded-full border border-border bg-card md:flex"
                />
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t('appBrand')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold tracking-[-0.04em]">
                      {routeMeta.title}
                    </h1>
                    <StatusBadge variant={runtimeTone}>{runtimeLabel}</StatusBadge>
                  </div>
                </div>
              </div>

              {desktopContext.backendError ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void window.banjiDesktop.restartBackend();
                  }}
                >
                  <RefreshCcw data-icon="inline-start" />
                  {t('retry')}
                </Button>
              ) : null}
            </div>
          </header>

          <main id="main-content" className="flex-1 px-[var(--spacing-page)] py-5">
            <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
              {desktopContext.backendError ? (
                <WorkspaceBanner
                  description={desktopContext.backendError}
                  title={t('backendError')}
                  tone="destructive"
                />
              ) : null}
              {error ? (
                <WorkspaceBanner description={error} title={t('apiUnavailable')} tone="destructive" />
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
