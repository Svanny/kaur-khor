import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  ActionCreatePackageIcon,
  ActionDatabaseUploadIcon,
  ActionExportIcon,
  ActionOpenExternalIcon,
  ActionResetIcon,
  ActionSearchIcon,
} from '@icons/actions';
import { EntityCustomerIcon, EntityServiceIcon, EntitySkuIcon, EntityTransitIcon } from '@icons/entities';
import {
  NavigationCatalogIcon,
  NavigationDashboardIcon,
  NavigationListIcon,
  NavigationTaskListIcon,
} from '@icons/navigation';
import { StatusInsightIcon, StatusWarningIcon } from '@icons/status';
import { AppProviders, AppRoutes } from '@/App';
import { CommandPaletteProvider } from '@/components/command-palette';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildRememberedCatalogHref, buildRememberedInboxHref } from '@/lib/page-state-memory';
import {
  buildBatchUpdateHref,
  buildSupplierTicketCaptureHref,
  getLaneForTaskAction,
  RECORD_UPDATE_HUB_PATH,
} from '@/lib/record-update-routes';
import { activeSenaCatalog, linkedSkuIdsForService } from '@/lib/sena-catalog';
import { statusPillClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { PageStateMemoryObserver } from '@/lib/page-state-memory';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { useAutomation } from '@/state/automation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { OnboardingRoute } from '@/routes/onboarding';
import {
  buildCustomerOverviewModel,
  type OverviewCustomerTask,
} from '@/routes/overview/customer-view-model';
import {
  buildOverviewModel,
  isOverviewSkuTask,
  isOverviewSupplierTicketTask,
  type OverviewTask,
} from '@/routes/overview/view-model';

const RecordUpdateHubRoute = lazy(() =>
  import('@/routes/record-update-hub').then((module) => ({ default: module.RecordUpdateHubRoute })),
);

type EmbeddedMode = 'app' | 'demo';
type PhoneStorage = {
  status: 'loading' | 'ready' | 'unsupported' | 'error';
  message: string;
  lastBackupAt: string | null;
};

type EmbeddedPhoneAppProps = {
  mode: EmbeddedMode;
  storage: PhoneStorage;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
};

type PhoneTab = {
  href: string;
  icon: typeof NavigationDashboardIcon;
  id: 'today' | 'queue' | 'capture' | 'products' | 'more';
  label: string;
  matches: (pathname: string) => boolean;
};

function phoneTabs(language: ReturnType<typeof usePreferences>['language']): PhoneTab[] {
  return [
    {
      href: '/',
      icon: NavigationDashboardIcon,
      id: 'today',
      label: translateUiLiteral(language, 'Today'),
      matches: (pathname) => pathname === '/',
    },
    {
      href: buildRememberedInboxHref(),
      icon: NavigationTaskListIcon,
      id: 'queue',
      label: translateUiLiteral(language, 'Queue'),
      matches: (pathname) => pathname.startsWith('/work/queue'),
    },
    {
      href: RECORD_UPDATE_HUB_PATH,
      icon: ActionCreatePackageIcon,
      id: 'capture',
      label: translateUiLiteral(language, 'Capture'),
      matches: (pathname) => pathname.startsWith('/work/capture'),
    },
    {
      href: buildRememberedCatalogHref(),
      icon: NavigationCatalogIcon,
      id: 'products',
      label: translateUiLiteral(language, 'Products'),
      matches: (pathname) => pathname.startsWith('/catalog'),
    },
    {
      href: '/phone/more',
      icon: NavigationListIcon,
      id: 'more',
      label: translateUiLiteral(language, 'More'),
      matches: (pathname) => pathname.startsWith('/phone/more') || pathname.startsWith('/settings') || pathname.startsWith('/insights'),
    },
  ];
}

function usePhoneModels() {
  const inventory = useInventory();
  const automation = useAutomation();
  const { language } = usePreferences();

  return useMemo(() => {
    const supplier = buildOverviewModel({
      catalog: inventory.catalog,
      detailBySkuId: {},
      forceStaleUpdateReminder: false,
      language,
      observations: inventory.observations,
      orderBatches: inventory.orderBatches ?? [],
      recordUpdateContext: inventory.recordUpdateContext,
      workspaceSummary: inventory.workspaceSummary,
    });
    const customer = buildCustomerOverviewModel({
      automationIntakes: automation.intakes,
      catalog: inventory.catalog,
      language,
      observations: inventory.observations,
      recordUpdateContext: inventory.recordUpdateContext,
    });
    return { customer, supplier };
  }, [
    automation.intakes,
    inventory.catalog,
    inventory.observations,
    inventory.orderBatches,
    inventory.recordUpdateContext,
    inventory.workspaceSummary,
    language,
  ]);
}

function phoneSupplierTaskHref(task: OverviewTask) {
  if (isOverviewSupplierTicketTask(task)) {
    return buildSupplierTicketCaptureHref({
      mode: 'edit',
      ticketId: task.ticketId,
    });
  }
  if (isOverviewSkuTask(task)) {
    return buildBatchUpdateHref({
      batchOrderId: task.batchOrderId,
      childOrderId: task.childOrderId,
      laneId: getLaneForTaskAction(task.action),
      skuIds: [task.skuId],
    });
  }
  return RECORD_UPDATE_HUB_PATH;
}

function PhoneMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[#d8e1db] bg-white px-3 py-2.5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-tight text-foreground">{value}</p>
    </div>
  );
}

function PhoneSection({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-3" data-slot="phone-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PhoneTaskCard({
  actionLabel,
  detail,
  href,
  label,
  meta,
  tone,
}: {
  actionLabel: string;
  detail: string | null;
  href: string;
  label: string;
  meta: string;
  tone: Parameters<typeof statusPillClassName>[0];
}) {
  return (
    <Link
      className="grid min-h-28 gap-3 rounded-[8px] border border-[#d8e1db] bg-white px-4 py-3 text-left shadow-[0_8px_24px_rgba(21,47,43,0.06)] transition-colors hover:bg-[#eef6f3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#145b57]/70"
      to={href}
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-base font-semibold text-foreground">{label}</span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{meta}</span>
        </span>
        <span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold', statusPillClassName(tone))}>
          {actionLabel}
        </span>
      </span>
      {detail ? <span className="text-sm leading-5 text-muted-foreground">{detail}</span> : null}
    </Link>
  );
}

function PhoneTodayRoute() {
  const inventory = useInventory();
  const { language } = usePreferences();
  const { customer, supplier } = usePhoneModels();
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const productCount = (catalog?.skus.filter((sku) => !sku.archived).length ?? 0)
    + (catalog?.services.filter((service) => !service.archived).length ?? 0);
  const updateCount = Math.max(
    inventory.observations?.length ?? 0,
    inventory.latestRun?.observationCount ?? 0,
    inventory.workspaceSummary?.intervalCount ?? 0,
  );
  const topSupplierTask = supplier.tasks[0] ?? null;
  const topCustomerTask = customer.tasks[0] ?? null;
  const nextHref = topSupplierTask ? phoneSupplierTaskHref(topSupplierTask) : topCustomerTask?.href ?? RECORD_UPDATE_HUB_PATH;
  const nextLabel =
    topSupplierTask
      ? isOverviewSupplierTicketTask(topSupplierTask)
        ? topSupplierTask.skuSummaryLabel
        : isOverviewSkuTask(topSupplierTask)
          ? topSupplierTask.skuName
          : topSupplierTask.stateLabel
      : topCustomerTask?.label ?? translateUiLiteral(language, 'Capture a fresh update');
  const nextAction = topSupplierTask?.actionLabel ?? topCustomerTask?.actionLabel ?? translateUiLiteral(language, 'Start update');

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-[8px] border border-[#145b57]/20 bg-[#123c3a] px-5 py-5 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8ee0d2]">{translateUiLiteral(language, 'Next move')}</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-white">{nextLabel}</h1>
        <p className="mt-3 text-sm leading-6 text-[#d8ebe8]">
          {topSupplierTask?.whyNow ?? topCustomerTask?.whyNow ?? translateUiLiteral(language, 'Use phone mode for the next floor decision, then move back to desktop for deep analysis.')}
        </p>
        <Button asChild className="mt-5 min-h-11 w-full justify-center rounded-[8px] border-0 bg-[#e4b363] text-[#21170d] hover:bg-[#dca24b]">
          <Link to={nextHref}>
            <ActionOpenExternalIcon data-icon="inline-start" />
            {nextAction}
          </Link>
        </Button>
      </section>

      <div className="grid grid-cols-3 gap-2">
        <PhoneMetric label={translateUiLiteral(language, 'Queue')} value={supplier.tasks.length + customer.tasks.length} />
        <PhoneMetric label={translateUiLiteral(language, 'Products')} value={productCount} />
        <PhoneMetric label={translateUiLiteral(language, 'Updates')} value={updateCount} />
      </div>

      <PhoneSection
        title={translateUiLiteral(language, 'Fast paths')}
        action={<Link className="text-sm font-medium text-primary" to={buildRememberedInboxHref()}>{translateUiLiteral(language, 'Queue')}</Link>}
      >
        <div className="grid gap-2">
          <Button asChild className="min-h-12 justify-start rounded-[8px] border-[#d8e1db] bg-white" variant="outline">
            <Link to={RECORD_UPDATE_HUB_PATH}>
              <ActionCreatePackageIcon data-icon="inline-start" />
              {translateUiLiteral(language, 'Capture update')}
            </Link>
          </Button>
          <Button asChild className="min-h-12 justify-start rounded-[8px] border-[#d8e1db] bg-white" variant="outline">
            <Link to={buildRememberedCatalogHref()}>
              <NavigationCatalogIcon data-icon="inline-start" />
              {translateUiLiteral(language, 'Open products')}
            </Link>
          </Button>
        </div>
      </PhoneSection>

      <PhoneSection title={translateUiLiteral(language, 'Top queue')}>
        <div className="grid gap-3">
          {[...supplier.tasks.slice(0, 2), ...customer.tasks.slice(0, 1)].length > 0 ? (
            <>
              {supplier.tasks.slice(0, 2).map((task) => (
                <PhoneTaskCard
                  key={task.id}
                  actionLabel={task.actionLabel}
                  detail={task.whyNow}
                  href={phoneSupplierTaskHref(task)}
                  label={isOverviewSupplierTicketTask(task) ? task.skuSummaryLabel : isOverviewSkuTask(task) ? task.skuName : task.stateLabel}
                  meta={task.stateLabel}
                  tone={task.statusTone}
                />
              ))}
              {customer.tasks.slice(0, 1).map((task) => (
                <PhoneTaskCard
                  key={task.id}
                  actionLabel={task.actionLabel}
                  detail={task.whyNow}
                  href={task.href}
                  label={task.label}
                  meta={task.requestSummary}
                  tone={task.stateBadgeTone}
                />
              ))}
            </>
          ) : (
            <p className="rounded-[8px] border border-[#d8e1db] bg-white px-4 py-5 text-sm leading-6 text-muted-foreground">
              {translateUiLiteral(language, 'No urgent queue items. Capture a fresh update when the floor changes.')}
            </p>
          )}
        </div>
      </PhoneSection>
    </div>
  );
}

function PhoneQueueRoute() {
  const { language } = usePreferences();
  const { customer, supplier } = usePhoneModels();
  const [scope, setScope] = useState<'supplier' | 'customer'>('supplier');
  const tasks = scope === 'supplier' ? supplier.tasks : customer.tasks;

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{translateUiLiteral(language, 'Queue')}</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-normal">{translateUiLiteral(language, 'Work that needs a decision')}</h1>
      </header>
      <div className="grid grid-cols-2 gap-2 rounded-[8px] border border-[#d8e1db] bg-white p-1">
        {(['supplier', 'customer'] as const).map((nextScope) => (
          (() => {
            const ScopeIcon = nextScope === 'supplier' ? EntityTransitIcon : EntityCustomerIcon;
            return (
              <button
                key={nextScope}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-semibold transition-colors',
                  scope === nextScope ? 'bg-[#123c3a] text-white' : 'text-muted-foreground',
                )}
                type="button"
                onClick={() => setScope(nextScope)}
              >
                <ScopeIcon aria-hidden="true" className="size-4" data-icon="inline-start" />
                {translateUiLiteral(language, nextScope === 'supplier' ? 'Supplier' : 'Customer')}
              </button>
            );
          })()
        ))}
      </div>
      <div className="grid gap-3">
        {tasks.length > 0 ? tasks.slice(0, 12).map((task) => (
          scope === 'supplier' ? (
            <PhoneTaskCard
              key={(task as OverviewTask).id}
              actionLabel={(task as OverviewTask).actionLabel}
              detail={(task as OverviewTask).whyNow}
              href={phoneSupplierTaskHref(task as OverviewTask)}
              label={
                isOverviewSupplierTicketTask(task as OverviewTask)
                  ? (task as Extract<OverviewTask, { kind: 'supplier_ticket' }>).skuSummaryLabel
                  : isOverviewSkuTask(task as OverviewTask)
                    ? (task as Extract<OverviewTask, { kind: 'sku' }>).skuName
                    : (task as OverviewTask).stateLabel
              }
              meta={(task as OverviewTask).stateLabel}
              tone={(task as OverviewTask).statusTone}
            />
          ) : (
            <PhoneTaskCard
              key={(task as OverviewCustomerTask).id}
              actionLabel={(task as OverviewCustomerTask).actionLabel}
              detail={(task as OverviewCustomerTask).whyNow}
              href={(task as OverviewCustomerTask).href}
              label={(task as OverviewCustomerTask).label}
              meta={(task as OverviewCustomerTask).requestSummary}
              tone={(task as OverviewCustomerTask).stateBadgeTone}
            />
          )
        )) : (
          <p className="rounded-[8px] border border-[#d8e1db] bg-white px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'No queue items match this phone view.')}
          </p>
        )}
      </div>
    </div>
  );
}

function PhoneCaptureRoute() {
  const { language } = usePreferences();

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{translateUiLiteral(language, 'Capture')}</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-normal">{translateUiLiteral(language, 'Record what changed')}</h1>
      </header>
      <Suspense fallback={null}>
        <RecordUpdateHubRoute embedded />
      </Suspense>
    </div>
  );
}

function PhoneProductsRoute() {
  const inventory = useInventory();
  const { language } = usePreferences();
  const [query, setQuery] = useState('');
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const normalizedQuery = query.trim().toLowerCase();
  const products = [
    ...(catalog?.skus.filter((sku) => !sku.archived).map((sku) => ({
      href: `/catalog/skus/${encodeURIComponent(sku.skuId)}`,
      id: `sku:${sku.skuId}`,
      meta: sku.supplierName ?? translateUiLiteral(language, 'SKU'),
      name: sku.name,
      type: 'sku' as const,
    })) ?? []),
    ...(catalog?.services.filter((service) => !service.archived).map((service) => ({
      href: `/catalog/services/${encodeURIComponent(service.serviceId)}`,
      id: `service:${service.serviceId}`,
      meta: translateUiLiteral(language, '{count} linked SKUs', { count: linkedSkuIdsForService(catalog, service.serviceId).length }),
      name: service.name,
      type: 'service' as const,
    })) ?? []),
  ].filter((item) =>
    !normalizedQuery ||
    `${item.name} ${item.meta}`.toLowerCase().includes(normalizedQuery),
  );

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{translateUiLiteral(language, 'Products')}</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-normal">{translateUiLiteral(language, 'Look up a sellable')}</h1>
      </header>
      <label className="relative block">
        <ActionSearchIcon aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={translateUiLiteral(language, 'Search products')}
          className="h-12 rounded-[8px] border-[#d8e1db] bg-white pl-9 focus-visible:ring-[#145b57]/70"
          placeholder={translateUiLiteral(language, 'Search products')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="grid gap-3">
        {products.length > 0 ? products.slice(0, 24).map((item) => {
          const Icon = item.type === 'sku' ? EntitySkuIcon : EntityServiceIcon;
          return (
            <Link
              key={item.id}
              className="flex min-h-16 items-center gap-3 rounded-[8px] border border-[#d8e1db] bg-white px-4 py-3 shadow-[0_8px_24px_rgba(21,47,43,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#145b57]/70"
              to={item.href}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[#dff4ee] text-[#145b57]">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-foreground">{item.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{item.meta}</span>
              </span>
              <ActionOpenExternalIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        }) : (
          <p className="rounded-[8px] border border-[#d8e1db] bg-white px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'No products match this search.')}
          </p>
        )}
      </div>
    </div>
  );
}

function PhoneMoreRoute({
  mode,
  storage,
  onExport,
  onImport,
  onReset,
}: EmbeddedPhoneAppProps) {
  const { language } = usePreferences();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const ready = storage.status === 'ready';

  return (
    <div className="grid gap-5">
      <header className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{translateUiLiteral(language, 'More')}</p>
        <h1 className="text-3xl font-semibold leading-tight tracking-normal">{translateUiLiteral(language, 'Workspace safety')}</h1>
      </header>
      <section className="grid gap-3 rounded-[8px] border border-[#d8e1db] bg-white px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-amber-100 text-amber-950">
            <StatusWarningIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              {translateUiLiteral(language, mode === 'demo' ? 'Demo workspace' : 'Browser workspace')}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {translateUiLiteral(language, storage.message)}
            </p>
            {storage.lastBackupAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {translateUiLiteral(language, 'Last backup {value}', { value: storage.lastBackupAt.slice(0, 10) })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2">
          <Button className="min-h-11 justify-start rounded-[8px]" disabled={!ready} type="button" variant="outline" onClick={onExport}>
            <ActionExportIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Export backup')}
          </Button>
          <Button className="min-h-11 justify-start rounded-[8px]" disabled={!ready} type="button" variant="outline" onClick={() => importInputRef.current?.click()}>
            <ActionDatabaseUploadIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Import backup')}
          </Button>
          <Button className="min-h-11 justify-start rounded-[8px]" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon data-icon="inline-start" />
            {translateUiLiteral(language, mode === 'demo' ? 'Reset demo' : 'Reset workspace')}
          </Button>
          <input
            ref={importInputRef}
            accept=".json,application/json"
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                onImport(file);
              }
            }}
          />
        </div>
      </section>
      <section className="grid gap-2">
        <Button asChild className="min-h-11 justify-start rounded-[8px]" variant="outline">
          <Link to="/settings">
            <NavigationListIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Settings and help')}
          </Link>
        </Button>
        <Button asChild className="min-h-11 justify-start rounded-[8px]" variant="outline">
          <Link to="/insights">
            <StatusInsightIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Lightweight insights')}
          </Link>
        </Button>
      </section>
    </div>
  );
}

function PhoneWideOnlyRoute() {
  const { language } = usePreferences();

  return (
    <div className="grid min-h-[60svh] place-items-center px-2">
      <section className="grid gap-4 rounded-[8px] border border-[#d8e1db] bg-white px-5 py-6 text-center">
        <StatusInsightIcon aria-hidden="true" className="mx-auto size-10 text-[#145b57]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            {translateUiLiteral(language, 'Use a wider view for deep analysis')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'Phone mode keeps floor decisions fast. Open the desktop app or a wider browser window for full charts, settings, and analysis workspaces.')}
          </p>
        </div>
        <Button asChild className="min-h-11 rounded-[8px] bg-[#123c3a] text-white hover:bg-[#145b57]">
          <Link to={buildRememberedInboxHref()}>
            <NavigationTaskListIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Back to queue')}
          </Link>
        </Button>
      </section>
    </div>
  );
}

function PhoneChrome({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { language } = usePreferences();
  const tabs = phoneTabs(language);

  return (
    <div
      className="min-h-svh bg-[#f6f8f5] text-foreground"
      data-language={language}
      data-slot="embedded-phone-shell"
      lang={language === 'km' ? 'km' : 'en'}
    >
      <a
        className="sr-only fixed top-4 left-4 z-50 rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-float)] focus:not-sr-only"
        href="#main-content"
      >
        {translateUiLiteral(language, 'Skip to content')}
      </a>
      <header className="sticky top-0 z-30 border-b border-[#d8e1db] bg-[#f6f8f5]/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-[#8a5635]">KAUR KHOR</p>
            <p className="truncate text-sm font-medium text-muted-foreground">{translateUiLiteral(language, 'Phone operator mode')}</p>
          </div>
          <Button asChild className="size-10 rounded-[8px] border-[#d8e1db] bg-white" size="icon" variant="outline">
            <Link aria-label={translateUiLiteral(language, 'Capture')} to={RECORD_UPDATE_HUB_PATH}>
              <ActionCreatePackageIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </header>
      <main
        id="main-content"
        className="px-4 pt-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))]"
        data-slot="embedded-phone-main"
      >
        {children}
      </main>
      <nav
        aria-label={translateUiLiteral(language, 'Phone navigation')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d8e1db] bg-[#f6f8f5]/96 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-12px_30px_rgba(21,47,43,0.10)] backdrop-blur"
        data-slot="embedded-phone-bottom-nav"
      >
        <div className="grid grid-cols-5 gap-1">
          {tabs.map((tab) => {
            const active = tab.matches(location.pathname);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-[8px] px-1 text-[0.68rem] font-semibold transition-colors',
                  active ? 'bg-[#123c3a] text-white' : 'text-muted-foreground hover:bg-[#eef6f3]',
                )}
                to={tab.href}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function PhoneRoutes(props: EmbeddedPhoneAppProps) {
  return (
    <PhoneChrome>
      <Routes>
        <Route element={<PhoneTodayRoute />} path="/" />
        <Route element={<Navigate replace to="/work/queue" />} path="/work" />
        <Route element={<PhoneQueueRoute />} path="/work/queue" />
        <Route element={<PhoneCaptureRoute />} path="/work/capture" />
        <Route element={<PhoneProductsRoute />} path="/catalog" />
        <Route element={<PhoneMoreRoute {...props} />} path="/phone/more" />
        <Route element={<PhoneMoreRoute {...props} />} path="/settings/*" />
        <Route element={<PhoneWideOnlyRoute />} path="/insights/*" />
        <Route element={<AppRoutes />} path="*" />
      </Routes>
    </PhoneChrome>
  );
}

function EmbeddedPhoneAppFrame(props: EmbeddedPhoneAppProps) {
  const { isHydrated, language, onboardingCompletedAt } = usePreferences();

  if (!isHydrated) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-6 text-center text-foreground">
        <div>
          <p className="text-sm font-semibold text-primary">KAUR KHOR</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">
            {translateUiLiteral(language, 'Loading preferences…')}
          </h1>
        </div>
      </div>
    );
  }

  if (!onboardingCompletedAt) {
    return (
      <Routes>
        <Route element={<OnboardingRoute />} path="/onboarding" />
        <Route element={<Navigate replace to="/onboarding" />} path="*" />
      </Routes>
    );
  }

  return (
    <NavigationHistoryProvider>
      <PageStateMemoryObserver />
      <CommandPaletteProvider>
        <PhoneRoutes {...props} />
      </CommandPaletteProvider>
    </NavigationHistoryProvider>
  );
}

export function EmbeddedPhoneApp(props: EmbeddedPhoneAppProps) {
  return (
    <AppProviders>
      <EmbeddedPhoneAppFrame {...props} />
    </AppProviders>
  );
}
