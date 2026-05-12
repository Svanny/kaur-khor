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

const PHONE_CONTENT_BOTTOM_PADDING = 'calc(var(--embedded-phone-bottom-nav-height) + env(safe-area-inset-bottom) + 1rem)';
const phoneFocusClassName = 'focus:outline-none focus:ring-2 focus:ring-ring/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70';
const phoneSurfaceClassName = 'rounded-[1rem] border border-border/70 bg-card/88 shadow-panel';
const phoneActionClassName = cn(phoneFocusClassName, 'min-h-12 w-full justify-start rounded-[0.8rem] border-border/70 bg-card text-left text-sm shadow-xs');

function PhonePage({
  children,
  slot,
}: {
  children: ReactNode;
  slot: string;
}) {
  return (
    <div className="grid min-w-0 gap-4" data-slot={slot}>
      {children}
    </div>
  );
}

function PhonePageHeader({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="grid min-w-0 gap-1.5" data-slot="phone-page-header">
      <p className="khmer-safe-eyebrow text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
      <h1 className="khmer-safe-display text-[1.7rem] font-semibold leading-[1.12] tracking-normal text-foreground">{title}</h1>
    </header>
  );
}

function PhoneSurface({
  children,
  className,
  slot = 'phone-surface',
}: {
  children: ReactNode;
  className?: string;
  slot?: string;
}) {
  return (
    <section className={cn(phoneSurfaceClassName, 'min-w-0 overflow-hidden p-4', className)} data-slot={slot}>
      {children}
    </section>
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
    <section className="grid min-w-0 gap-2.5" data-slot="phone-section">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="khmer-safe-label min-w-0 text-base font-semibold text-foreground">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function PhoneActionRow({
  children,
  className,
  disabled,
  icon,
  onClick,
  to,
  variant = 'outline',
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  to?: string;
  variant?: Parameters<typeof Button>[0]['variant'];
}) {
  const content = (
    <>
      {icon}
      <span className="min-w-0 whitespace-normal leading-5">{children}</span>
    </>
  );

  if (to) {
    return (
      <Button asChild className={cn(phoneActionClassName, className)} variant={variant}>
        <Link data-slot="phone-action-row" to={to}>
          {content}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      className={cn(phoneActionClassName, className)}
      data-slot="phone-action-row"
      disabled={disabled}
      type="button"
      variant={variant}
      onClick={onClick}
    >
      {content}
    </Button>
  );
}

function PhoneEmptyState({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={cn(phoneSurfaceClassName, 'px-4 py-6 text-center text-sm leading-6 text-muted-foreground')} data-slot="phone-empty-state">
      {children}
    </div>
  );
}

function PhoneMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[0.8rem] border border-border/70 bg-card/80 px-3 py-2.5" data-slot="phone-metric">
      <p className="khmer-safe-eyebrow truncate text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{value}</p>
    </div>
  );
}

function PhoneListItem({
  actionLabel,
  detail,
  href,
  icon,
  label,
  meta,
  tone,
}: {
  actionLabel?: string;
  detail?: string | null;
  href: string;
  icon?: ReactNode;
  label: string;
  meta: string;
  tone?: Parameters<typeof statusPillClassName>[0];
}) {
  return (
    <Link
      className={cn(
        phoneSurfaceClassName,
        phoneFocusClassName,
        'grid min-h-[4.75rem] min-w-0 gap-2 px-3.5 py-3 text-left transition-colors hover:bg-accent/20',
      )}
      data-slot="phone-list-item"
      to={href}
    >
      <span className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-[0.8rem] bg-secondary text-secondary-foreground" data-slot="phone-list-item-icon">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block overflow-hidden text-ellipsis text-base font-semibold leading-5 text-foreground">{label}</span>
          <span className="mt-1 block overflow-hidden text-ellipsis text-sm leading-5 text-muted-foreground">{meta}</span>
        </span>
        {actionLabel ? (
          <span className={cn('max-w-[8.5rem] shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold leading-4', tone ? statusPillClassName(tone) : 'border-border bg-secondary text-secondary-foreground')}>
            <span className="line-clamp-2">{actionLabel}</span>
          </span>
        ) : null}
      </span>
      {detail ? <span className="line-clamp-2 text-sm leading-5 text-muted-foreground">{detail}</span> : null}
    </Link>
  );
}

function PhoneSegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{
    icon: ReactNode;
    label: string;
    value: T;
  }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-[1rem] border border-border/70 bg-card/90 p-1" data-slot="phone-segmented-control">
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          className={cn(
            phoneFocusClassName,
            'flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[0.8rem] px-3 text-sm font-semibold transition-colors',
            value === option.value ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent/40',
          )}
          data-slot="phone-segmented-control-option"
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span className="min-w-0 truncate">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function PhoneBottomNavItem({
  active,
  tab,
}: {
  active: boolean;
  tab: PhoneTab;
}) {
  const Icon = tab.icon;

  return (
    <Link
      key={tab.id}
      aria-current={active ? 'page' : undefined}
      className={cn(
        phoneFocusClassName,
        'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-[0.8rem] px-1 text-[0.68rem] font-semibold transition-colors',
        active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-accent/40',
      )}
      data-phone-tab={tab.id}
      data-slot="phone-bottom-nav-item"
      to={tab.href}
    >
      <Icon aria-hidden="true" className="size-4" />
      <span className="khmer-safe-label max-w-full truncate">{tab.label}</span>
    </Link>
  );
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
    <PhoneListItem
      actionLabel={actionLabel}
      detail={detail}
      href={href}
      label={label}
      meta={meta}
      tone={tone}
    />
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
    <PhonePage slot="phone-today-page">
      <PhoneSurface className="grid gap-4 bg-foreground text-background" slot="phone-next-move">
        <div className="min-w-0">
          <p className="khmer-safe-eyebrow text-xs font-semibold uppercase tracking-[0.14em] text-primary">{translateUiLiteral(language, 'Next move')}</p>
          <h1 className="khmer-safe-display mt-2 line-clamp-3 text-[1.85rem] font-semibold leading-[1.08] tracking-normal text-background" data-slot="phone-primary-title">
            {nextLabel}
          </h1>
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-background/80">
          {topSupplierTask?.whyNow ?? topCustomerTask?.whyNow ?? translateUiLiteral(language, 'Use phone mode for the next floor decision, then move back to desktop for deep analysis.')}
        </p>
        <Button asChild className={cn(phoneFocusClassName, 'min-h-12 w-full justify-center rounded-[0.8rem] bg-primary text-primary-foreground hover:bg-primary/90')} data-slot="phone-primary-action">
          <Link to={nextHref}>
            <ActionOpenExternalIcon data-icon="inline-start" />
            <span className="min-w-0 whitespace-normal leading-5">{nextAction}</span>
          </Link>
        </Button>
      </PhoneSurface>

      <div className="grid min-w-0 grid-cols-3 gap-2" data-slot="phone-metric-strip">
        <PhoneMetric label={translateUiLiteral(language, 'Queue')} value={supplier.tasks.length + customer.tasks.length} />
        <PhoneMetric label={translateUiLiteral(language, 'Products')} value={productCount} />
        <PhoneMetric label={translateUiLiteral(language, 'Updates')} value={updateCount} />
      </div>

      <PhoneSection
        title={translateUiLiteral(language, 'Fast paths')}
        action={
          <Link
            className={cn(phoneFocusClassName, 'inline-flex min-h-11 items-center rounded-[0.8rem] px-3 text-sm font-medium text-primary hover:bg-accent/30')}
            to={buildRememberedInboxHref()}
          >
            {translateUiLiteral(language, 'Queue')}
          </Link>
        }
      >
        <div className="grid gap-2">
          <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={RECORD_UPDATE_HUB_PATH}>
            {translateUiLiteral(language, 'Capture update')}
          </PhoneActionRow>
          <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to={buildRememberedCatalogHref()}>
            {translateUiLiteral(language, 'Open products')}
          </PhoneActionRow>
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
            <PhoneEmptyState>
              {translateUiLiteral(language, 'No urgent queue items. Capture a fresh update when the floor changes.')}
            </PhoneEmptyState>
          )}
        </div>
      </PhoneSection>
    </PhonePage>
  );
}

function PhoneQueueRoute() {
  const { language } = usePreferences();
  const { customer, supplier } = usePhoneModels();
  const [scope, setScope] = useState<'supplier' | 'customer'>('supplier');
  const tasks = scope === 'supplier' ? supplier.tasks : customer.tasks;

  return (
    <PhonePage slot="phone-queue-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Queue')}
        title={translateUiLiteral(language, 'Work that needs a decision')}
      />
      <PhoneSegmentedControl
        value={scope}
        options={[
          {
            icon: <EntityTransitIcon aria-hidden="true" className="size-4" data-icon="inline-start" />,
            label: translateUiLiteral(language, 'Supplier'),
            value: 'supplier',
          },
          {
            icon: <EntityCustomerIcon aria-hidden="true" className="size-4" data-icon="inline-start" />,
            label: translateUiLiteral(language, 'Customer'),
            value: 'customer',
          },
        ]}
        onChange={setScope}
      />
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
          <PhoneEmptyState>
            {translateUiLiteral(language, 'No queue items match this phone view.')}
          </PhoneEmptyState>
        )}
      </div>
    </PhonePage>
  );
}

function PhoneCaptureRoute() {
  const { language } = usePreferences();

  return (
    <PhonePage slot="phone-capture-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Capture')}
        title={translateUiLiteral(language, 'Record what changed')}
      />
      <div className="min-w-0 overflow-x-auto overscroll-contain rounded-[1rem]" data-slot="phone-capture-surface">
        <Suspense fallback={null}>
          <RecordUpdateHubRoute embedded />
        </Suspense>
      </div>
    </PhonePage>
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
    <PhonePage slot="phone-products-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Products')}
        title={translateUiLiteral(language, 'Look up a sellable')}
      />
      <label className="relative block">
        <ActionSearchIcon aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={translateUiLiteral(language, 'Search products')}
          className="h-12 rounded-[0.8rem] border-border/70 bg-card pl-9 shadow-xs focus-visible:ring-ring/70"
          data-slot="phone-products-search"
          placeholder={translateUiLiteral(language, 'Search products')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="grid gap-3">
        {products.length > 0 ? products.slice(0, 24).map((item) => {
          const Icon = item.type === 'sku' ? EntitySkuIcon : EntityServiceIcon;
          return (
            <PhoneListItem
              key={item.id}
              href={item.href}
              icon={<Icon aria-hidden="true" className="size-5" />}
              label={item.name}
              meta={item.meta}
            />
          );
        }) : (
          <PhoneEmptyState>
            {translateUiLiteral(language, 'No products match this search.')}
          </PhoneEmptyState>
        )}
      </div>
    </PhonePage>
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
    <PhonePage slot="phone-more-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'More')}
        title={translateUiLiteral(language, 'Workspace safety')}
      />
      <PhoneSurface className="grid gap-3" slot="phone-workspace-safety">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[0.8rem] bg-secondary text-secondary-foreground">
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
          <PhoneActionRow disabled={!ready} icon={<ActionExportIcon data-icon="inline-start" />} onClick={onExport}>
            {translateUiLiteral(language, 'Export backup')}
          </PhoneActionRow>
          <PhoneActionRow disabled={!ready} icon={<ActionDatabaseUploadIcon data-icon="inline-start" />} onClick={() => importInputRef.current?.click()}>
            {translateUiLiteral(language, 'Import backup')}
          </PhoneActionRow>
          <PhoneActionRow className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" icon={<ActionResetIcon data-icon="inline-start" />} onClick={onReset}>
            {translateUiLiteral(language, mode === 'demo' ? 'Reset demo' : 'Reset workspace')}
          </PhoneActionRow>
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
      </PhoneSurface>
      <section className="grid gap-2">
        <PhoneActionRow icon={<NavigationListIcon data-icon="inline-start" />} to="/settings">
          {translateUiLiteral(language, 'Settings and help')}
        </PhoneActionRow>
        <PhoneActionRow icon={<StatusInsightIcon data-icon="inline-start" />} to="/insights">
          {translateUiLiteral(language, 'Lightweight insights')}
        </PhoneActionRow>
      </section>
    </PhonePage>
  );
}

function PhoneWideOnlyRoute() {
  const { language } = usePreferences();

  return (
    <div className="grid min-h-[60dvh] place-items-center px-1" data-slot="phone-wide-only-page">
      <PhoneSurface className="grid gap-4 px-5 py-6 text-center">
        <StatusInsightIcon aria-hidden="true" className="mx-auto size-10 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">
            {translateUiLiteral(language, 'Use a wider view for deep analysis')}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'Phone mode keeps floor decisions fast. Open the desktop app or a wider browser window for full charts, settings, and analysis workspaces.')}
          </p>
        </div>
        <Button asChild className="min-h-12 rounded-[0.8rem]">
          <Link to={buildRememberedInboxHref()}>
            <NavigationTaskListIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Back to queue')}
          </Link>
        </Button>
      </PhoneSurface>
    </div>
  );
}

function PhoneChrome({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { language } = usePreferences();
  const tabs = phoneTabs(language);

  return (
    <div
      className="min-h-dvh overscroll-contain bg-background text-foreground [--embedded-phone-bottom-nav-height:5.5rem]"
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
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/92 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur" data-slot="embedded-phone-header">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="khmer-safe-eyebrow text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">KAUR KHOR</p>
            <p className="truncate text-sm font-medium text-muted-foreground">{translateUiLiteral(language, 'Phone operator mode')}</p>
          </div>
          <Button asChild className="size-11 rounded-[0.8rem] border-border/70 bg-card" size="icon" variant="outline">
            <Link aria-label={translateUiLiteral(language, 'Capture')} to={RECORD_UPDATE_HUB_PATH}>
              <ActionCreatePackageIcon aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </div>
      </header>
      <main
        id="main-content"
        className="min-w-0 overflow-x-hidden px-4 pt-4"
        data-slot="embedded-phone-main"
        style={{ paddingBottom: PHONE_CONTENT_BOTTOM_PADDING }}
      >
        {children}
      </main>
      <nav
        aria-label={translateUiLiteral(language, 'Phone navigation')}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-12px_30px_rgba(27,15,7,0.10)] backdrop-blur"
        data-slot="embedded-phone-bottom-nav"
      >
        <div className="grid grid-cols-5 gap-1">
          {tabs.map((tab) => {
            const active = tab.matches(location.pathname);
            return <PhoneBottomNavItem key={tab.id} active={active} tab={tab} />;
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
