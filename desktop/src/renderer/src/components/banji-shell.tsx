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
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';
import brandLogo from '@/assets/banji-logo.svg';

function routeTitle(pathname: string, t: (key: string) => string) {
  if (pathname === '/') return t('navDashboard');
  if (pathname.startsWith('/inventory/stock')) return t('navStock');
  if (pathname.startsWith('/inventory/ranking')) return t('navRanking');
  if (pathname.startsWith('/inventory')) return t('navInventory');
  return t('navSettings');
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

  function handleSidebarNavigation() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

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
        active: location.pathname.startsWith('/inventory') && !location.pathname.includes('/ranking') && !location.pathname.includes('/stock'),
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

  return (
    <>
      <a
        className="sr-only z-50 rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        href="#main-content"
      >
        {t('skipToContent')}
      </a>

      <Sidebar className="border-r border-sidebar-border/70" variant="inset">
        <SidebarHeader className="gap-4 px-3 py-4">
          <Link className="flex items-center gap-3 rounded-2xl px-2 py-1" to="/" onClick={handleSidebarNavigation}>
            <img alt="Banji logo" className="size-11 rounded-2xl bg-background/80 p-2" src={brandLogo} />
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">{t('appBrand')}</p>
              <p className="text-xs uppercase tracking-[0.18em] text-sidebar-foreground/60">
                {t('appTitle')}
              </p>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarSeparator />

        <SidebarContent className="px-2">
          <SidebarGroup>
            <SidebarGroupLabel>{t('navInventory')}</SidebarGroupLabel>
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
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="justify-start rounded-2xl" size="sm" variant="secondary">
              <Link to="/inventory/skus/new" onClick={handleSidebarNavigation}>
                <PackagePlus className="size-4" />
                <span>{t('createSkuAction')}</span>
              </Link>
            </Button>
            <Button asChild className="justify-start rounded-2xl" size="sm" variant="secondary">
              <Link to="/inventory/services/new" onClick={handleSidebarNavigation}>
                <PanelsTopLeft className="size-4" />
                <span>{t('createServiceAction')}</span>
              </Link>
            </Button>
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="bg-transparent">
        <div className="flex min-h-svh flex-col">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <SidebarTrigger aria-label={t('openNavigation')} className="h-10 w-10 rounded-full border border-border bg-card md:hidden" />
                <SidebarTrigger aria-label={t('collapseNavigation')} className="hidden h-10 w-10 rounded-full border border-border bg-card md:flex" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {t('appBrand')}
                  </p>
                  <h1 className="truncate text-lg font-semibold tracking-tight">
                    {routeTitle(location.pathname, t)}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {desktopContext.backendError ? (
                  <Button
                    className="rounded-full"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void window.banjiDesktop.restartBackend();
                    }}
                  >
                    <RefreshCcw className="size-4" />
                    <span>{t('retry')}</span>
                  </Button>
                ) : null}
              </div>
            </div>
          </header>

          <main id="main-content" className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-4">
              {desktopContext.backendError ? (
                <Banner tone="error">{desktopContext.backendError}</Banner>
              ) : null}
              {error ? <Banner tone="error">{error}</Banner> : null}
              {isLoading ? <Banner tone="info">{t('backendStarting')}</Banner> : null}
              {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </>
  );
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'error' | 'info';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3 text-sm shadow-sm',
        tone === 'error'
          ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-border bg-card/80 text-muted-foreground',
      )}
    >
      {children}
    </div>
  );
}
