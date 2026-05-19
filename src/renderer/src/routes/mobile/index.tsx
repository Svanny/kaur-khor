import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { SenaObservationInput, SenaObservationRecord, SenaTicketEvent, SenaTicketEventType, SenaTicketLine, SenaTicketStage, SenaTicketSummary } from '@shared/sena';
import {
  ActionAddBadgeIcon,
  ActionClipboardAddIcon,
  ActionCreatePackageIcon,
  ActionDatabaseUploadIcon,
  ActionExplosionIcon,
  ActionExportIcon,
  ActionOpenFolderIcon,
  ActionOpenExternalIcon,
  ActionReceiveInventoryIcon,
  ActionResetIcon,
  ActionSaveIcon,
  ActionSearchIcon,
} from '@icons/actions';
import { overviewCustomerFilterIcons, overviewTaskActionIcons, overviewTaskFilterIcons } from '@icons/domain';
import { EntityCustomerIcon, EntityLayersIcon, EntityPackageSearchIcon, EntityRevenueIcon, EntityServiceIcon, EntitySkuIcon, EntityTagsIcon, EntityTransitIcon } from '@icons/entities';
import {
  NavigationCatalogIcon,
  NavigationBackIcon,
  NavigationDashboardIcon,
  NavigationHistoryIcon,
  NavigationListIcon,
  NavigationSettingsIcon,
  NavigationTaskListIcon,
} from '@icons/navigation';
import { StatusInsightIcon, StatusReadyIcon, StatusTimingIcon, StatusWarningIcon } from '@icons/status';
import type { IconComponent } from '@icons';
import { AppProviders } from '@/App';
import { ItemAvatar } from '@/components/system/item-identity';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { latestObservationAt as latestObservationAtForRecords } from '@/routes/observation-payload';
import { buildRememberedCatalogHref, buildRememberedInboxHref } from '@/lib/page-state-memory';
import { parseLocalDateTimeInputIso } from '@/lib/date-input-utils';
import { recordTicketOptions, sortRecordTicketOptionsByRecent } from '@/lib/record-activity';
import {
  buildBatchUpdateHref,
  buildCaptureSessionHref,
  buildSupplierTicketCaptureHref,
  draftStorageKeyForLane,
  getLaneForTaskAction,
  laneForCaptureSessionAction,
  parseRouteIdList,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_HUB_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
  type CaptureSessionAction,
  type CaptureSessionTargetType,
  type OverviewTaskAction,
} from '@/lib/record-update-routes';
import { activeSenaCatalog, linkedSkuIdsForService, linkedSkusForService, supplierNameForSku } from '@/lib/sena-catalog';
import { formatCurrency, parseEditableNumberWithCommas } from '@/lib/format';
import { statusPillClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { PageStateMemoryObserver } from '@/lib/page-state-memory';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { useAutomation } from '@/state/automation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { OnboardingRoute } from '@/routes/onboarding';
import { AutomationIntakeDrawer } from '@/routes/automations/intake-drawer';
import { OverviewTaskDrawer } from '@/routes/overview/task-drawer';
import {
  buildCustomerOverviewModel,
  type OverviewCustomerTask,
} from '@/routes/overview/customer-view-model';
import {
  buildOverviewModel,
  isOverviewSkuTask,
  isOverviewSupplierTicketTask,
  supplierTicketTaskForSkuTask,
  type OverviewTask,
  type OverviewSupplierTicketTask,
} from '@/routes/overview/view-model';

const LazyRecordUpdateHubRoute = lazy(() =>
  import('@/routes/record-update-hub').then((module) => ({ default: module.RecordUpdateHubRoute })),
);
const LazyStockUpdateSessionRoute = lazy(() =>
  import('@/routes/stock-update-session').then((module) => ({ default: module.StockUpdateSessionRoute })),
);

type EmbeddedMode = 'app' | 'demo';
type PhoneStorage = {
  status: 'loading' | 'ready' | 'unsupported' | 'error';
  message: string;
  lastBackupAt: string | null;
};

type PhoneQueueScope = 'supplier' | 'customer';
type PhoneQueueFilter = 'all' | 'to-order' | 'waiting' | 'follow-up' | 'receive' | 'review' | 'quoted' | 'open' | 'ready' | 'closed';
type PhoneInventoryScope = 'focus' | 'all';
type PhoneInventoryRange = 'recent' | 'all';
type PhoneInventoryView = 'health' | 'flow' | 'forecast' | 'pipeline';
type PhoneInventoryHorizon = '7d' | '14d' | '30d' | '60d';
type PhoneInventoryEntity = 'all' | 'sku' | 'service';
type PhoneMoneyScope = 'all' | 'statement' | 'contributors';
type PhoneMoneyCompare = 'none' | 'evidence';
type PhoneMoneyEntity = 'all' | 'sku' | 'service';
type PhoneMoneyRange = '1d' | '7d' | '30d' | '90d' | 'custom';
type PhoneExplainSection = 'all' | 'posture' | 'evidence' | 'fragile';
type PhoneExplainTimeframe = 'recent' | 'all';
type PhoneExplainEntity = 'all' | 'sku' | 'service';
type MobileActionContextSource =
  | 'today'
  | 'queue'
  | 'capture'
  | 'products'
  | 'sku-detail'
  | 'service-detail'
  | 'inventory'
  | 'money'
  | 'explain';
type MobileActionContextLaneId = PhoneCaptureLaneId;
type MobileActionContextMode = 'new' | 'edit' | 'receive' | 'complete' | 'cancel' | 'follow-up';
type MobileCaptureActionContext = {
  breadcrumb: string;
  currentQuantity?: number | null;
  laneId?: MobileActionContextLaneId | null;
  mode?: MobileActionContextMode | null;
  quantitySuggestion?: number | null;
  recentEvidence?: string | null;
  returnTo: string;
  source: MobileActionContextSource;
  supplierName?: string | null;
  ticketId?: string | null;
};
type PhoneHistoryGroup =
  | 'Products Update'
  | 'Customer Orders Pending'
  | 'Customer Orders Completed'
  | 'Supplier Orders Pending'
  | 'Supplier Receipts'
  | 'Corrections'
  | 'Price/cost changes';

export function parsePhoneExchangeRateDraft(value: string) {
  const parsed = parseEditableNumberWithCommas(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type PhoneHistoryEntry = {
  detail: string;
  entity: string;
  group: PhoneHistoryGroup;
  id: string;
  layer: string;
  quantity: string | null;
  time: string;
};

type EmbeddedPhoneAppProps = {
  mode: EmbeddedMode;
  storage: PhoneStorage;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: (options?: { skipBrowserConfirm?: boolean }) => void;
};

function phoneHrefWithSearch(pathname: string, searchParams: URLSearchParams, keys: string[]) {
  const next = new URLSearchParams();
  keys.forEach((key) => {
    const value = searchParams.get(key);
    if (value) {
      next.set(key, value);
    }
  });
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function phoneHrefWithReturnTo(pathname: string, returnTo: string) {
  const params = new URLSearchParams();
  params.set('returnTo', returnTo);
  return `${pathname}?${params.toString()}`;
}

function isInternalPhoneHref(value: string | null | undefined) {
  return Boolean(value && value.startsWith('/') && !value.startsWith('//'));
}

export function sanitizePhoneReturnTo(value: string | null | undefined, fallback: string) {
  return isInternalPhoneHref(value) ? value! : fallback;
}

function phoneBackHrefFromSearch(searchParams: URLSearchParams, fallback: string) {
  const returnTo = searchParams.get('returnTo');
  return sanitizePhoneReturnTo(returnTo, fallback);
}

type PhoneTab = {
  href: string;
  icon: typeof NavigationDashboardIcon;
  id: 'today' | 'queue' | 'capture' | 'products' | 'insights';
  label: string;
  matches: (pathname: string) => boolean;
};

const PHONE_INSIGHTS_NAV_ENABLED = false;

function phoneTabs(language: ReturnType<typeof usePreferences>['language']): PhoneTab[] {
  const tabs: PhoneTab[] = [
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
      href: '/insights',
      icon: StatusInsightIcon,
      id: 'insights',
      label: translateUiLiteral(language, 'Insights'),
      matches: (pathname) => pathname.startsWith('/insights'),
    },
  ];

  return PHONE_INSIGHTS_NAV_ENABLED ? tabs : tabs.filter((tab) => tab.id !== 'insights');
}

function phoneShellHeaderCopy(pathname: string, language: ReturnType<typeof usePreferences>['language'], catalog?: ReturnType<typeof activeSenaCatalog>) {
  if (pathname === '/') {
    return {
      eyebrow: 'KAUR KHOR',
      title: translateUiLiteral(language, 'Phone operator mode'),
    };
  }
  if (pathname.startsWith('/onboarding')) {
    return {
      eyebrow: 'KAUR KHOR',
      title: translateUiLiteral(language, 'Set up Kaur Khor'),
    };
  }

  const captureLane = phoneCaptureLaneForPath(pathname);
  if (captureLane) {
    return {
      eyebrow: translateUiLiteral(language, 'Capture'),
      title: translateUiLiteral(language, captureLane.title),
    };
  }
  if (pathname.startsWith('/work/capture')) {
    return {
      eyebrow: translateUiLiteral(language, 'Capture'),
      title: translateUiLiteral(language, 'Record what changed'),
    };
  }
  if (pathname.startsWith('/work/queue')) {
    return {
      eyebrow: translateUiLiteral(language, 'Queue'),
      title: translateUiLiteral(language, 'Work that needs a decision'),
    };
  }
  if (pathname.startsWith('/catalog/skus')) {
    const skuId = decodePhoneRouteParam(pathname.split('/').filter(Boolean).at(-1));
    const sku = catalog?.skus.find((candidate) => candidate.skuId === skuId && !candidate.archived);
    return {
      eyebrow: translateUiLiteral(language, 'SKU'),
      title: sku?.name ?? translateUiLiteral(language, 'Offered Selections'),
    };
  }
  if (pathname.startsWith('/catalog/services')) {
    const serviceId = decodePhoneRouteParam(pathname.split('/').filter(Boolean).at(-1));
    const service = catalog?.services.find((candidate) => candidate.serviceId === serviceId && !candidate.archived);
    return {
      eyebrow: translateUiLiteral(language, 'Service'),
      title: service?.name ?? translateUiLiteral(language, 'Offered Selections'),
    };
  }
  if (pathname.startsWith('/catalog')) {
    return {
      eyebrow: translateUiLiteral(language, 'Products'),
      title: translateUiLiteral(language, 'Offered Selections'),
    };
  }
  if (pathname.startsWith('/settings/history')) {
    return {
      eyebrow: translateUiLiteral(language, 'Settings'),
      title: translateUiLiteral(language, 'Update history'),
    };
  }
  if (pathname.startsWith('/settings/help')) {
    return {
      eyebrow: translateUiLiteral(language, 'Settings'),
      title: translateUiLiteral(language, 'Settings and help'),
    };
  }
  if (pathname.startsWith('/settings')) {
    return {
      eyebrow: translateUiLiteral(language, 'Settings'),
      title: translateUiLiteral(language, 'Configurations'),
    };
  }
  if (pathname.startsWith('/insights/money')) {
    return {
      eyebrow: translateUiLiteral(language, 'Insights'),
      title: translateUiLiteral(language, 'Money statement'),
    };
  }
  if (pathname.startsWith('/insights/explain')) {
    return {
      eyebrow: translateUiLiteral(language, 'Insights'),
      title: translateUiLiteral(language, 'Explain confidence'),
    };
  }
  if (pathname.startsWith('/insights/inventory')) {
    return {
      eyebrow: translateUiLiteral(language, 'Insights'),
      title: translateUiLiteral(language, 'Inventory health'),
    };
  }
  if (pathname.startsWith('/insights')) {
    return {
      eyebrow: translateUiLiteral(language, 'Insights'),
      title: translateUiLiteral(language, 'Choose an operating lens'),
    };
  }

  return {
    eyebrow: translateUiLiteral(language, 'Use a wider view for deep analysis'),
    title: translateUiLiteral(language, 'Phone operator mode'),
  };
}

const phoneFocusClassName = 'focus:outline-none focus:ring-2 focus:ring-ring/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70';
const phoneSurfaceClassName = 'rounded-[1rem] border border-border/70 bg-card/88 shadow-xs';
const phoneActionClassName = cn(phoneFocusClassName, 'h-auto min-h-12 w-full justify-start whitespace-normal rounded-[0.8rem] border-border/70 bg-card py-2.5 text-left text-sm shadow-xs');

function PhonePage({
  children,
  className,
  slot,
}: {
  children: ReactNode;
  className?: string;
  slot: string;
}) {
  return (
    <div className={cn('grid min-w-0 max-w-full gap-4', className)} data-slot={slot}>
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
    <header className="sr-only" data-slot="phone-page-header">
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
  icon,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section className="grid min-w-0 gap-2.5" data-slot="phone-section">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="khmer-safe-label flex min-w-0 items-center gap-2 text-base font-semibold text-foreground">
          {icon ? <span className="shrink-0 text-muted-foreground" data-slot="phone-section-title-icon">{icon}</span> : null}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
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

function phoneCaptureDraftStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function hasPhoneCaptureDraft(draftStorageKey: string | null) {
  return readPhoneCaptureDraft(draftStorageKey) != null;
}

function removePhoneCaptureDraft(draftStorageKey: string | null) {
  const storage = phoneCaptureDraftStorage();
  if (!draftStorageKey || typeof storage?.removeItem !== 'function') {
    return;
  }
  try {
    storage.removeItem(draftStorageKey);
  } catch {
    // Draft cleanup is best effort; blocked storage should not prevent capture navigation.
  }
}

function PhoneCaptureActionRow({
  action,
  children,
  context,
  icon,
  targetId,
  targetType,
}: {
  action: CaptureSessionAction;
  children: ReactNode;
  context: MobileCaptureActionContext;
  icon?: ReactNode;
  targetId: string;
  targetType: CaptureSessionTargetType;
}) {
  const { language } = usePreferences();
  const navigate = useNavigate();
  const [confirmPrompt, setConfirmPrompt] = useState<'saved-draft' | 'leave-page' | null>(null);
  const href = phoneCaptureHrefWithContext(
    buildCaptureSessionHref({ action, targetId, targetType }),
    {
      ...context,
      targetId,
      targetType,
    },
  );
  const draftStorageKey = phoneCaptureDraftKey(laneForCaptureSessionAction(action), targetId);
  const hasDraftConfirmPrompt = confirmPrompt === 'saved-draft';

  function requestCaptureSession() {
    setConfirmPrompt(hasPhoneCaptureDraft(draftStorageKey) ? 'saved-draft' : 'leave-page');
  }

  function openCaptureSession({ deleteDraft }: { deleteDraft: boolean }) {
    if (deleteDraft) {
      removePhoneCaptureDraft(draftStorageKey);
    }
    setConfirmPrompt(null);
    navigate(href);
  }

  return (
    <>
      <PhoneActionRow icon={icon} onClick={requestCaptureSession}>
        {children}
      </PhoneActionRow>
      <ConfirmActionDialog
        cancelLabel={translateUiLiteral(language, 'Cancel')}
        confirmIcon={hasDraftConfirmPrompt ? <ActionReceiveInventoryIcon /> : <ActionClipboardAddIcon />}
        confirmLabel={translateUiLiteral(language, hasDraftConfirmPrompt ? 'Resume draft' : 'Continue to capture')}
        confirmVariant="default"
        destructiveActionLabel={hasDraftConfirmPrompt ? translateUiLiteral(language, 'Delete draft and start new') : undefined}
        description={translateUiLiteral(language, hasDraftConfirmPrompt ? 'This capture lane has a saved draft. Resume the draft to keep it, or delete it before starting this targeted capture session.' : 'This will leave the detail page and open a targeted capture session.')}
        open={confirmPrompt != null}
        title={translateUiLiteral(language, hasDraftConfirmPrompt ? 'Delete saved draft?' : 'Leave detail page?')}
        onCancel={() => setConfirmPrompt(null)}
        onConfirm={() => openCaptureSession({ deleteDraft: false })}
        onDestructiveAction={hasDraftConfirmPrompt ? () => openCaptureSession({ deleteDraft: true }) : undefined}
      />
    </>
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

function PhoneLoadingState({
  detail,
  title,
}: {
  detail?: string;
  title: string;
}) {
  return (
    <PhoneSurface className="grid gap-4" slot="phone-loading-state">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
      </div>
      <div className="grid gap-2" aria-hidden="true" data-slot="phone-loading-skeleton">
        <span className="h-12 rounded-[0.8rem] bg-muted/70" />
        <span className="h-16 rounded-[0.8rem] bg-muted/55" />
        <span className="h-16 rounded-[0.8rem] bg-muted/45" />
      </div>
    </PhoneSurface>
  );
}

function PhoneStorageFeedback({
  mode,
  storage,
}: {
  mode: EmbeddedMode;
  storage: PhoneStorage;
}) {
  const { language } = usePreferences();
  const expectedReadyMessage = mode === 'demo'
    ? 'This demo uses a separate sample workspace.'
    : 'Your workspace is saved in this browser on this device.';
  const hasActionableReadyMessage = storage.status === 'ready' && storage.message !== expectedReadyMessage;
  const title = hasActionableReadyMessage
    ? 'Backup import needs attention.'
    : storage.status === 'ready'
    ? storage.lastBackupAt
      ? 'Backup export ready.'
      : mode === 'demo'
        ? 'Demo backup is optional.'
        : 'No phone backup exported yet.'
    : storage.status === 'loading'
      ? 'Opening workspace storage…'
      : 'Workspace unavailable.';
  const detail = hasActionableReadyMessage
    ? translateUiLiteral(language, storage.message)
    : storage.status === 'ready'
    ? storage.lastBackupAt
      ? translateUiLiteral(language, 'Last backup {value}', { value: storage.lastBackupAt.slice(0, 10) })
      : translateUiLiteral(language, mode === 'demo'
        ? 'Demo data can be reset. Export only if you want to keep this sample state.'
        : 'Export a backup before clearing browser data, changing profiles, or resetting this workspace.')
    : translateUiLiteral(language, storage.message);

  return (
    <div
      className={cn(
        'rounded-[0.8rem] border px-3 py-2.5 text-sm leading-6',
        storage.status === 'ready' && !hasActionableReadyMessage
          ? 'border-border/70 bg-background/65 text-muted-foreground'
          : 'border-destructive/30 bg-destructive/10 text-destructive',
      )}
      data-slot="phone-storage-feedback"
    >
      <p className={cn('font-semibold', storage.status === 'ready' && !hasActionableReadyMessage ? 'text-foreground' : 'text-destructive')}>
        {translateUiLiteral(language, title)}
      </p>
      <p className="mt-1">{detail}</p>
    </div>
  );
}

function PhoneWorkspaceErrorBanner() {
  const inventory = useInventory();
  const location = useLocation();
  const { language } = usePreferences();

  if (
    !inventory.error ||
    location.pathname.startsWith('/work/capture') ||
    location.pathname.startsWith('/insights') ||
    location.pathname.startsWith('/settings/history') ||
    location.pathname.startsWith('/catalog/skus') ||
    location.pathname.startsWith('/catalog/services')
  ) {
    return null;
  }

  return (
    <div className="mb-4 grid gap-3 rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm leading-6 text-destructive" data-slot="phone-workspace-error">
      <div>
        <p className="font-semibold">{translateUiLiteral(language, 'Workspace evidence could not refresh.')}</p>
        <p className="mt-1 text-destructive/85">
          {inventory.error} {translateUiLiteral(language, 'Retry the refresh or open safety if local data looks unavailable.')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => void inventory.reload()}>
          {translateUiLiteral(language, 'Retry')}
        </Button>
        <Button asChild className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
          <Link to="/settings">
            {translateUiLiteral(language, 'Open safety')}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function PhoneMetric({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[0.8rem] border border-border/70 bg-card/80 px-3 py-2.5" data-slot="phone-metric">
      <p className="khmer-safe-eyebrow flex min-w-0 items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon ? <span className="shrink-0 text-muted-foreground" data-slot="phone-metric-icon">{icon}</span> : null}
        <span className="min-w-0 truncate">{label}</span>
      </p>
      <p className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{value}</p>
    </div>
  );
}

function PhoneMetricStrip({
  className,
  metrics,
  slot,
  to,
}: {
  className?: string;
  metrics: Array<{
    icon?: ReactNode;
    label: string;
    value: ReactNode;
  }>;
  slot: string;
  to?: string;
}) {
  const content = metrics.map((metric, index) => (
    <div
      key={metric.label}
      className={cn('min-w-0 px-3 py-2.5', index > 0 ? 'border-l border-border/70' : null)}
      data-slot="phone-metric"
    >
      <p className="khmer-safe-eyebrow flex min-w-0 items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {metric.icon ? <span className="shrink-0 text-muted-foreground" data-slot="phone-metric-icon">{metric.icon}</span> : null}
        <span className="min-w-0 truncate">{metric.label}</span>
      </p>
      <p className="mt-1 truncate text-lg font-semibold leading-tight text-foreground">{metric.value}</p>
    </div>
  ));
  const stripClassName = cn(phoneSurfaceClassName, 'grid min-w-0 grid-cols-3 overflow-hidden bg-card/80 p-0', className);

  if (to) {
    return (
      <Link
        className={cn(
          phoneFocusClassName,
          stripClassName,
          'transition-colors hover:border-accent/60 hover:bg-accent/15 active:border-accent/70 active:bg-accent/30',
        )}
        data-slot={slot}
        to={to}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={stripClassName} data-slot={slot}>
      {content}
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
  onClick,
  tone,
}: {
  actionLabel?: string;
  detail?: string | null;
  href?: string;
  icon?: ReactNode;
  label: string;
  meta: string;
  onClick?: () => void;
  tone?: Parameters<typeof statusPillClassName>[0];
}) {
  const content = (
    <>
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
    </>
  );
  const className = cn(
    phoneSurfaceClassName,
    phoneFocusClassName,
    'grid min-h-[4.75rem] min-w-0 gap-2 px-3.5 py-3 text-left transition-colors hover:bg-accent/20',
  );

  if (onClick) {
    return (
      <button
        className={className}
        data-slot="phone-list-item"
        type="button"
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      className={className}
      data-slot="phone-list-item"
      to={href ?? '#'}
    >
      {content}
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
    <div className={cn('grid gap-2 rounded-[1rem] border border-border/70 bg-card/90 p-1', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')} data-slot="phone-segmented-control">
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

function PhoneChipRow<T extends string>({
  options,
  slot,
  value,
  onChange,
}: {
  options: Array<{
    icon?: IconComponent;
    label: string;
    value: T;
  }>;
  slot: string;
  value: T;
  onChange: (value: T) => void;
}) {
  const collapseLabels = slot === 'phone-products-quick-filter';

  return (
    <div
      className={cn(
        'flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1',
        collapseLabels ? 'phone-product-filter-row min-w-0 flex-nowrap overflow-hidden' : null,
      )}
      data-slot={slot}
    >
      {options.map((option) => (
        <button
          key={option.value}
          aria-pressed={value === option.value}
          className={cn(
            phoneFocusClassName,
            'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold',
            collapseLabels ? 'phone-product-filter-option justify-center' : null,
            value === option.value
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border/70 bg-card text-muted-foreground hover:bg-accent/40',
          )}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <option.icon aria-hidden="true" className="size-4 shrink-0" data-slot="phone-chip-row-icon" /> : null}
          <span className={collapseLabels ? 'phone-product-filter-label min-w-0 truncate' : undefined} data-slot={collapseLabels ? 'phone-product-filter-label' : undefined}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

type PhoneCaptureLaneId =
  | 'stock-count'
  | 'customer-order-pending'
  | 'customer-order-completed'
  | 'supplier-order-pending'
  | 'supplier-receipt';

type PhoneCaptureLaneConfig = {
  description: string;
  effect: string;
  icon: ReactNode;
  id: PhoneCaptureLaneId;
  path: string;
  primaryFieldLabel: string;
  reviewCopy: string;
  title: string;
};

type PhoneCaptureMode = 'new' | 'modify' | 'cancel' | 'complete' | 'immediate' | 'refund' | 'receive' | 'purchase';
type PhoneSupplierReceiptDisposition = 'matched' | 'short' | 'damaged' | 'extra';

const PHONE_CAPTURE_LANES: PhoneCaptureLaneConfig[] = [
  {
    description: 'Count what is physically on hand and reconcile mistakes.',
    effect: 'Physical stock truth changes. Untouched SKUs stay latent.',
    icon: <EntitySkuIcon data-icon="inline-start" />,
    id: 'stock-count',
    path: RECORD_UPDATE_STOCK_COUNT_PATH,
    primaryFieldLabel: 'Counted quantity',
    reviewCopy: 'Only selected and edited SKUs and services will be saved.',
    title: 'Products Update',
  },
  {
    description: 'Create a supplier ticket or update an existing supplier ticket, including receipts.',
    effect: 'Committed supply, ETA, cancellation, and receipt state change through one ticket flow.',
    icon: <ActionCreatePackageIcon data-icon="inline-start" />,
    id: 'supplier-order-pending',
    path: RECORD_UPDATE_SUPPLIER_PENDING_PATH,
    primaryFieldLabel: 'Ordered quantity',
    reviewCopy: 'Kaur Khor will update supplier ticket state, queue timing, and receipts.',
    title: 'Supplier Order',
  },
  {
    description: 'Receive against an existing supplier ticket and reconcile what arrived.',
    effect: 'Receipt quantities and stock adjustments are saved against the supplier ticket.',
    icon: <ActionReceiveInventoryIcon data-icon="inline-start" />,
    id: 'supplier-receipt',
    path: RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
    primaryFieldLabel: 'Received quantity',
    reviewCopy: 'Kaur Khor will update supplier receipt state and stock on hand.',
    title: 'Supplier Receipt',
  },
  {
    description: 'Record a same-session sale as realized demand without framing it as order fulfillment.',
    effect: 'Realized customer output changes after confirmation.',
    icon: <EntityServiceIcon data-icon="inline-start" />,
    id: 'customer-order-completed',
    path: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
    primaryFieldLabel: 'Completed quantity',
    reviewCopy: 'Confirm physical stock impact separately when needed.',
    title: 'Immediate Sale',
  },
  {
    description: 'Create a ticket-backed customer commitment or update an existing customer ticket.',
    effect: 'Customer commitments change. Fulfillment happens in Immediate Sale.',
    icon: <EntityRevenueIcon data-icon="inline-start" />,
    id: 'customer-order-pending',
    path: RECORD_UPDATE_CUSTOMER_PENDING_PATH,
    primaryFieldLabel: 'Committed quantity',
    reviewCopy: 'Kaur Khor will update the customer ticket layer.',
    title: 'Customer Order',
  },
];

export const PHONE_CAPTURE_ROUTE_PATHS = PHONE_CAPTURE_LANES.map((lane) => `${lane.path}/*`);

function phoneCaptureLaneForPath(pathname: string) {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? pathname;
  return PHONE_CAPTURE_LANES.find((lane) => pathOnly === lane.path || pathOnly.startsWith(`${lane.path}/`)) ?? null;
}

export function phoneCaptureLaneIdForPath(pathname: string) {
  return phoneCaptureLaneForPath(pathname)?.id ?? null;
}

function phoneCaptureModesForLane(laneId: PhoneCaptureLaneId | null | undefined): Array<{ label: string; value: PhoneCaptureMode }> {
  if (laneId === 'customer-order-pending') {
    return [
      { label: 'New pending', value: 'new' },
      { label: 'Modify pending', value: 'modify' },
      { label: 'Cancel pending', value: 'cancel' },
    ];
  }
  if (laneId === 'customer-order-completed') {
    return [
      { label: 'Immediate sale', value: 'immediate' },
      { label: 'Complete pending', value: 'complete' },
      { label: 'Refund / reversal', value: 'refund' },
    ];
  }
  if (laneId === 'supplier-order-pending') {
    return [
      { label: 'New supplier order', value: 'new' },
      { label: 'Edit supplier order', value: 'modify' },
      { label: 'Cancel supplier order', value: 'cancel' },
    ];
  }
  return [];
}

function normalizePhoneCaptureMode(laneId: PhoneCaptureLaneId | null | undefined, value: string | null) {
  const modes = phoneCaptureModesForLane(laneId);
  const match = modes.find((mode) => mode.value === value);
  return match?.value ?? modes[0]?.value ?? null;
}

function phoneCaptureModeLabel(laneId: PhoneCaptureLaneId | null | undefined, value: PhoneCaptureMode | null) {
  return phoneCaptureModesForLane(laneId).find((mode) => mode.value === value)?.label ?? null;
}

const PHONE_SUPPLIER_RECEIPT_DISPOSITIONS: Array<{ label: string; value: PhoneSupplierReceiptDisposition }> = [
  { label: 'Matched', value: 'matched' },
  { label: 'Short', value: 'short' },
  { label: 'Damaged', value: 'damaged' },
  { label: 'Extra', value: 'extra' },
];

function phoneSupplierReceiptDispositionLabel(value: PhoneSupplierReceiptDisposition) {
  return PHONE_SUPPLIER_RECEIPT_DISPOSITIONS.find((option) => option.value === value)?.label ?? 'Matched';
}

function phoneSupplierReceiptAdjustmentReason(value: PhoneSupplierReceiptDisposition) {
  return value === 'matched' ? 'supplier_receipt' : `supplier_receipt_${value}`;
}

type PhoneProductTypeFilter = 'all' | 'sku' | 'service';
type PhoneProductQuickFilter = 'all' | 'recent' | 'needs-count' | 'low-stock' | 'in-transit' | 'blocked-services';

const PHONE_PRODUCT_TYPE_FILTERS: Array<{ label: string; value: PhoneProductTypeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'SKUs', value: 'sku' },
  { label: 'Services', value: 'service' },
];

const PHONE_PRODUCT_QUICK_FILTERS: Array<{ icon: IconComponent; label: string; value: PhoneProductQuickFilter }> = [
  { icon: EntityLayersIcon, label: 'All', value: 'all' },
  { icon: StatusTimingIcon, label: 'Recent', value: 'recent' },
  { icon: EntityPackageSearchIcon, label: 'Needs count', value: 'needs-count' },
  { icon: StatusWarningIcon, label: 'Low stock', value: 'low-stock' },
  { icon: EntityTransitIcon, label: 'In transit', value: 'in-transit' },
  { icon: EntityServiceIcon, label: 'Blocked services', value: 'blocked-services' },
];

function normalizePhoneProductTypeFilter(value: string | null): PhoneProductTypeFilter {
  return PHONE_PRODUCT_TYPE_FILTERS.some((option) => option.value === value) ? value as PhoneProductTypeFilter : 'all';
}

function normalizePhoneProductQuickFilter(value: string | null): PhoneProductQuickFilter {
  return PHONE_PRODUCT_QUICK_FILTERS.some((option) => option.value === value) ? value as PhoneProductQuickFilter : 'all';
}

function normalizePhoneProductSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function phoneCaptureLaneHubHref(lane: PhoneCaptureLaneConfig) {
  if (lane.id === 'customer-order-pending' || lane.id === 'supplier-order-pending') {
    return `${lane.path}?ticketMode=new`;
  }
  if (lane.id === 'customer-order-completed') {
    return `${lane.path}?ticketMode=new`;
  }
  if (lane.id === 'supplier-receipt') {
    return `${lane.path}?ticketMode=edit`;
  }
  return lane.path;
}

function emptyPhoneObservationInput(observedAt: string, notes: string | null): SenaObservationInput {
  return {
    observedAt,
    stockSnapshot: [],
    serviceRankings: [],
    retailRankings: [],
    serviceStockouts: [],
    retailStockouts: [],
    orderSignals: [],
    servicePrices: [],
    retailPrices: [],
    leadTimeHints: [],
    commercialEvents: [],
    ticketEvents: [],
    notes,
  };
}

function phoneHistoryDateLabel(observedAt: string) {
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) {
    return observedAt.slice(0, 10) || 'Unknown time';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function isSamePhoneLocalDay(value: string | null | undefined, reference = new Date()) {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
}

function phoneSkuName(catalog: ReturnType<typeof activeSenaCatalog>, skuId: string) {
  return catalog?.skus.find((sku) => sku.skuId === skuId)?.name ?? skuId;
}

function phoneServiceName(catalog: ReturnType<typeof activeSenaCatalog>, serviceId: string) {
  return catalog?.services.find((service) => service.serviceId === serviceId)?.name ?? serviceId;
}

function phoneEntityName(catalog: ReturnType<typeof activeSenaCatalog>, entityType: 'sku' | 'service', entityId: string) {
  return entityType === 'service' ? phoneServiceName(catalog, entityId) : phoneSkuName(catalog, entityId);
}

export function buildPhoneTodayInventoryRows({
  catalog,
  inventory,
}: {
  catalog: ReturnType<typeof activeSenaCatalog>;
  inventory: ReturnType<typeof useInventory>;
}) {
  if (!catalog) {
    return [];
  }

  const currentBySku = new Map<string, number | null>();
  const summaryBySku = new Map(inventory.workspaceSummary?.skuSummaries.map((summary) => [summary.skuId, summary]) ?? []);
  for (const sku of catalog.skus) {
    const latestStock = inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value;
    const summary = summaryBySku.get(sku.skuId);
    currentBySku.set(sku.skuId, latestStock?.unitsInStock ?? summary?.latestPosteriorUnits ?? null);
  }

  const unitsInBySku = new Map<string, number>();
  const unitsOutBySku = new Map<string, number>();

  for (const observation of inventory.observations ?? []) {
    if (!isSamePhoneLocalDay(observation.input.observedAt)) {
      continue;
    }

    for (const signal of observation.input.orderSignals ?? []) {
      if (signal.receiptArrived && Number.isFinite(signal.approximateReceiptQuantity ?? 0)) {
        unitsInBySku.set(
          signal.skuId,
          (unitsInBySku.get(signal.skuId) ?? 0) + Math.max(0, signal.approximateReceiptQuantity ?? 0),
        );
      }
    }

    for (const event of observation.input.commercialEvents ?? []) {
      if (event.stage !== 'realized' || !Number.isFinite(event.quantityDelta) || event.quantityDelta <= 0) {
        continue;
      }
      const skuIds = event.entityType === 'sku' ? [event.entityId] : linkedSkuIdsForService(catalog, event.entityId);
      for (const skuId of skuIds) {
        unitsOutBySku.set(skuId, (unitsOutBySku.get(skuId) ?? 0) + event.quantityDelta);
      }
    }
  }

  return catalog.skus
    .filter((sku) => !sku.archived)
    .map((sku) => {
      const current = currentBySku.get(sku.skuId) ?? null;
      const unitsIn = unitsInBySku.get(sku.skuId) ?? 0;
      const unitsOut = unitsOutBySku.get(sku.skuId) ?? 0;
      return {
        current,
        id: sku.skuId,
        imagePath: sku.imagePath ?? null,
        name: sku.name,
        supplier: supplierNameForSku(sku) ?? '',
        unitsIn,
        unitsOut,
      };
    })
    .sort((left, right) => {
      const leftActivity = left.unitsIn + left.unitsOut;
      const rightActivity = right.unitsIn + right.unitsOut;
      if (leftActivity !== rightActivity) {
        return rightActivity - leftActivity;
      }
      if ((left.current == null) !== (right.current == null)) {
        return left.current == null ? 1 : -1;
      }
      return (left.current ?? Number.POSITIVE_INFINITY) - (right.current ?? Number.POSITIVE_INFINITY);
    })
    .slice(0, 5);
}

function buildPhoneHistoryEntries(observations: SenaObservationRecord[], catalog: ReturnType<typeof activeSenaCatalog>) {
  return [...observations]
    .sort((left, right) => {
      const leftTime = Date.parse(left.input.observedAt);
      const rightTime = Date.parse(right.input.observedAt);
      const timeDelta =
        (Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY) -
        (Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY);
      return timeDelta || right.observationId.localeCompare(left.observationId);
    })
    .flatMap((observation) => {
      const observedAt = observation.input.observedAt;
      const time = phoneHistoryDateLabel(observedAt);
      const entries: PhoneHistoryEntry[] = [];

      observation.input.stockSnapshot.forEach((entry, index) => {
        entries.push({
          detail: `Physical stock set to ${entry.unitsInStock} units.`,
          entity: phoneSkuName(catalog, entry.skuId),
          group: 'Products Update',
          id: `${observation.observationId}:stock:${entry.skuId}:${index}`,
          layer: 'Physical stock truth',
          quantity: `${entry.unitsInStock}u`,
          time,
        });
        if (entry.costPerUnit != null || entry.productPrice != null) {
          entries.push({
            detail: `Cost ${entry.costPerUnit ?? 'unchanged'} · price ${entry.productPrice ?? 'unchanged'}.`,
            entity: phoneSkuName(catalog, entry.skuId),
            group: 'Price/cost changes',
            id: `${observation.observationId}:stock-price:${entry.skuId}:${index}`,
            layer: 'SKU cost and retail price',
            quantity: null,
            time,
          });
        }
      });

      observation.input.orderSignals.forEach((signal, index) => {
        if (signal.orderPlaced) {
          entries.push({
            detail: 'Supplier commitment recorded without changing on-hand stock.',
            entity: phoneSkuName(catalog, signal.skuId),
            group: 'Supplier Orders Pending',
            id: `${observation.observationId}:supplier-pending:${signal.skuId}:${index}`,
            layer: 'Committed supply',
            quantity: signal.approximateOrderQuantity != null ? `${signal.approximateOrderQuantity}u` : null,
            time,
          });
        }
        if (signal.receiptArrived) {
          entries.push({
            detail: 'Supplier receipt recorded as realized incoming stock evidence.',
            entity: phoneSkuName(catalog, signal.skuId),
            group: 'Supplier Receipts',
            id: `${observation.observationId}:supplier-receipt:${signal.skuId}:${index}`,
            layer: 'Realized incoming stock',
            quantity: signal.approximateReceiptQuantity != null ? `${signal.approximateReceiptQuantity}u` : null,
            time,
          });
        }
      });

      (observation.input.commercialEvents ?? []).forEach((event, index) => {
        const pending = event.stage === 'pending';
        const quantity = Number.isFinite(event.quantityDelta) ? Math.abs(event.quantityDelta) : null;
        entries.push({
          detail: pending
            ? 'Customer commitment recorded without changing physical stock.'
            : 'Customer completion recorded as realized customer output.',
          entity: phoneEntityName(catalog, event.entityType, event.entityId),
          group: pending ? 'Customer Orders Pending' : 'Customer Orders Completed',
          id: `${observation.observationId}:commercial:${event.entityType}:${event.entityId}:${index}`,
          layer: pending ? 'Committed demand' : 'Realized customer output',
          quantity: quantity != null ? `${quantity}u` : null,
          time,
        });
      });

      observation.input.retailPrices.forEach((price, index) => {
        entries.push({
          detail: `Retail price changed to ${price.price}.`,
          entity: phoneSkuName(catalog, price.skuId),
          group: 'Price/cost changes',
          id: `${observation.observationId}:retail-price:${price.skuId}:${index}`,
          layer: 'SKU retail price',
          quantity: null,
          time,
        });
      });

      observation.input.servicePrices.forEach((price, index) => {
        entries.push({
          detail: `Service price changed to ${price.price}.`,
          entity: phoneServiceName(catalog, price.serviceId),
          group: 'Price/cost changes',
          id: `${observation.observationId}:service-price:${price.serviceId}:${index}`,
          layer: 'Service price',
          quantity: null,
          time,
        });
      });

      (observation.input.adjustmentSignals ?? []).forEach((adjustment, index) => {
        entries.push({
          detail: observation.input.notes ?? 'Correction or adjustment evidence was recorded.',
          entity: 'Workspace correction',
          group: 'Corrections',
          id: `${observation.observationId}:adjustment:${index}`,
          layer: 'Compensating history',
          quantity: null,
          time,
        });
      });

      return entries;
    })
    .slice(0, 24);
}

function phoneCaptureDraftKey(
  laneId: PhoneCaptureLaneId | null | undefined,
  targetId: string | null | undefined,
  ticketId?: string | null,
) {
  return laneId && targetId
    ? ['kaur-khor', 'phone-capture-draft', laneId, targetId, ticketId || null].filter(Boolean).join(':')
    : null;
}

export function phoneCaptureDraftCountsByLane() {
  const counts = new Map<PhoneCaptureLaneId, number>();
  if (typeof window === 'undefined') {
    return counts;
  }
  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith('kaur-khor:phone-capture-draft:')) {
        continue;
      }
      const laneId = key.split(':')[2] as PhoneCaptureLaneId | undefined;
      if (!laneId || !PHONE_CAPTURE_LANES.some((lane) => lane.id === laneId)) {
        continue;
      }
      if (!readPhoneCaptureDraft(key)) {
        continue;
      }
      counts.set(laneId, (counts.get(laneId) ?? 0) + 1);
    }
  } catch {
    return counts;
  }
  return counts;
}

function readPhoneCaptureDraft(key: string | null) {
  if (!key) {
    return null;
  }
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { quantity?: unknown }).quantity === 'string' &&
      typeof (parsed as { note?: unknown }).note === 'string'
    ) {
      const observedAt = normalizePhoneDraftObservedAt((parsed as { observedAt?: unknown }).observedAt);
      const customerChannel = typeof (parsed as { customerChannel?: unknown }).customerChannel === 'string'
        ? (parsed as { customerChannel: string }).customerChannel
        : '';
      const customerName = typeof (parsed as { customerName?: unknown }).customerName === 'string'
        ? (parsed as { customerName: string }).customerName
        : '';
      const customerPhone = typeof (parsed as { customerPhone?: unknown }).customerPhone === 'string'
        ? (parsed as { customerPhone: string }).customerPhone
        : '';
      const supplierEta = typeof (parsed as { supplierEta?: unknown }).supplierEta === 'string'
        ? (parsed as { supplierEta: string }).supplierEta
        : '';
      const supplierLeadTime = typeof (parsed as { supplierLeadTime?: unknown }).supplierLeadTime === 'string'
        ? (parsed as { supplierLeadTime: string }).supplierLeadTime
        : '';
      const supplierDiscrepancy = typeof (parsed as { supplierDiscrepancy?: unknown }).supplierDiscrepancy === 'string'
        ? (parsed as { supplierDiscrepancy: string }).supplierDiscrepancy
        : '';
      const supplierReceiptDisposition = PHONE_SUPPLIER_RECEIPT_DISPOSITIONS.some((option) =>
        option.value === (parsed as { supplierReceiptDisposition?: unknown }).supplierReceiptDisposition,
      )
        ? (parsed as { supplierReceiptDisposition: PhoneSupplierReceiptDisposition }).supplierReceiptDisposition
        : 'matched';
      return {
        ...(parsed as { note: string; quantity: string }),
        customerChannel,
        customerName,
        customerPhone,
        observedAt,
        supplierDiscrepancy,
        supplierEta,
        supplierLeadTime,
        supplierReceiptDisposition,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function defaultPhoneObservedAtInput() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-') + `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function normalizePhoneDraftObservedAt(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  return parseLocalDateTimeInputIso(value) ? value : '';
}

export function phoneObservedAtInputToIso(value: string) {
  return parseLocalDateTimeInputIso(value);
}

export function phoneCaptureQuantityError(laneId: PhoneCaptureLaneId | null | undefined, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter a valid quantity before saving.';
  }
  const parsed = parseEditableNumberWithCommas(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 'Enter a valid quantity before saving.';
  }
  if (laneId !== 'stock-count' && parsed <= 0) {
    return 'Enter a quantity greater than zero before saving.';
  }
  return null;
}

export function phoneTicketLineDraftQuantity(line: SenaTicketLine) {
  const quantity = line.quantityDelta ?? line.orderedQuantity ?? line.receivedQuantity ?? null;
  return typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function parsePhoneLeadTimeHint(value: string) {
  if (!value.trim()) {
    return null;
  }
  const parsed = parseEditableNumberWithCommas(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function phoneContactKey(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9+]/g, '') ?? '';
}

function phoneCustomerTicketId(laneId: PhoneCaptureLaneId, targetId: string, observedAt: string) {
  return `phone:${laneId}:${targetId}:${new Date(observedAt).getTime()}`;
}

function phoneSupplierTicketId(laneId: PhoneCaptureLaneId, targetId: string, observedAt: string) {
  return `phone:${laneId}:${targetId}:${new Date(observedAt).getTime()}`;
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
    const receipt = task.action === 'receive';
    const skuIds = task.childTasks.map((childTask) => childTask.skuId);
    return buildSupplierTicketCaptureHref({
      mode: 'edit',
      intent: receipt ? 'receipt' : 'order',
      ticketId: task.ticketId,
      skuIds: receipt ? skuIds : undefined,
      flashTargets: receipt
        ? skuIds.map((skuId) => ({
            action: 'supplier-receipt',
            targetId: skuId,
            targetType: 'sku',
          }))
        : undefined,
    });
  }
  if (isOverviewSkuTask(task)) {
    const receipt = task.action === 'receive';
    if (task.supplierTicketId) {
      return buildSupplierTicketCaptureHref({
        mode: 'edit',
        intent: receipt ? 'receipt' : 'order',
        ticketId: task.supplierTicketId,
        targetId: task.skuId,
        targetType: 'sku',
      });
    }
    return buildBatchUpdateHref({
      batchOrderId: task.batchOrderId,
      childOrderId: task.childOrderId,
      laneId: getLaneForTaskAction(task.action),
      skuIds: [task.skuId],
    });
  }
  return RECORD_UPDATE_HUB_PATH;
}

function phoneSupplierBatchTasksForTask(task: OverviewTask, tasks: OverviewTask[] = []) {
  if (isOverviewSupplierTicketTask(task)) {
    return task.childTasks;
  }
  if (!isOverviewSkuTask(task)) {
    return [];
  }
  return tasks.filter((candidate): candidate is Extract<OverviewTask, { kind: 'sku' }> =>
    isOverviewSkuTask(candidate) &&
    candidate.action === task.action &&
    candidate.supplierTicketId === task.supplierTicketId &&
    candidate.supplierName === task.supplierName,
  );
}

function phoneSupplierBatchHref(task: OverviewTask, tasks: OverviewTask[] = []) {
  const groupTasks = phoneSupplierBatchTasksForTask(task, tasks);
  if (groupTasks.length <= 1) {
    return null;
  }
  if (isOverviewSupplierTicketTask(task)) {
    const receipt = task.action === 'receive';
    const skuIds = groupTasks.map((groupTask) => groupTask.skuId);
    return buildSupplierTicketCaptureHref({
      mode: 'edit',
      intent: receipt ? 'receipt' : 'order',
      ticketId: task.ticketId,
      skuIds,
      flashTargets: receipt
        ? skuIds.map((skuId) => ({
            action: 'supplier-receipt',
            targetId: skuId,
            targetType: 'sku',
          }))
        : undefined,
    });
  }
  if (!isOverviewSkuTask(task)) {
    return null;
  }
  const receipt = task.action === 'receive';
  if (task.supplierTicketId) {
    const skuIds = groupTasks.map((groupTask) => groupTask.skuId);
    return buildSupplierTicketCaptureHref({
      mode: 'edit',
      intent: receipt ? 'receipt' : 'order',
      ticketId: task.supplierTicketId,
      skuIds,
      flashTargets: skuIds.map((skuId) => ({
        action: receipt ? 'supplier-receipt' : 'supplier-order',
        targetId: skuId,
        targetType: 'sku',
      })),
    });
  }
  return buildBatchUpdateHref({
    batchOrderId: task.batchOrderId,
    childOrderId: task.childOrderId,
    laneId: getLaneForTaskAction(task.action),
    skuIds: groupTasks.map((groupTask) => groupTask.skuId),
  });
}

type PhoneQueueSheetTask = {
  action: OverviewTaskAction;
  actionLabel: string;
  batchTaskCount?: number | null;
  batchUpdateHref?: string | null;
  detail: string | null;
  href: string;
  id: string;
  meta: string;
  quantitySuggestion?: number | null;
  returnTo: string;
  scope: 'supplier' | 'customer';
  sourceBreadcrumb: string;
  supplierName?: string | null;
  targetId?: string | null;
  targetType?: 'sku' | 'service' | 'ticket' | null;
  ticket?: SenaTicketSummary | null;
  title: string;
};

function phoneHrefWithActionContext(href: string, task: PhoneQueueSheetTask) {
  const [pathname, rawQuery = ''] = href.split('?');
  const params = new URLSearchParams(rawQuery);
  params.set('source', 'queue');
  params.set('breadcrumb', task.sourceBreadcrumb);
  params.set('returnTo', task.returnTo);
  params.set('taskId', task.id);
  if (task.targetType && task.targetId) {
    params.set('targetType', task.targetType);
    params.set('targetId', task.targetId);
  }
  if (task.quantitySuggestion != null && Number.isFinite(task.quantitySuggestion)) {
    params.set('quantitySuggestion', String(task.quantitySuggestion));
  }
  if (task.supplierName) {
    params.set('supplierName', task.supplierName);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function phoneQueueActionQuantityLabel(task: PhoneQueueSheetTask) {
  if (task.action === 'receive') {
    return 'Receipt quantity';
  }
  if (task.action === 'log_order') {
    return 'Supplier order quantity';
  }
  if (task.scope === 'customer' && task.action === 'mark_completed') {
    return 'Completed quantity';
  }
  return 'Quantity or count';
}

function phoneQueueActionDateLabel(task: PhoneQueueSheetTask) {
  if (task.action === 'receive') {
    return 'Received date';
  }
  if (task.action === 'update_eta' || task.action === 'follow_up') {
    return 'Next touch or ETA';
  }
  return 'Action date';
}

function phoneQueueActionNotePlaceholder(task: PhoneQueueSheetTask) {
  if (task.scope === 'supplier') {
    return 'Supplier update, ETA, or receipt note';
  }
  return 'Customer follow-up, completion, cancel, or review note';
}

function phoneQueueSavedSummary(task: PhoneQueueSheetTask, quantity: string, actionDate: string) {
  const quantitySummary = quantity.trim() ? ` · ${quantity.trim()}u` : '';
  const dateSummary = actionDate.trim() ? ` · ${actionDate.trim()}` : '';
  return `${task.actionLabel}${quantitySummary}${dateSummary}`;
}

function parsePhoneQueueActionQuantity(value: string) {
  const parsed = parseEditableNumberWithCommas(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseExplicitPhoneQueueActionDate(value: string) {
  if (!value.trim()) {
    return null;
  }
  return parseLocalDateTimeInputIso(value);
}

function phoneQueueActionObservedAt(value: string) {
  return parseExplicitPhoneQueueActionDate(value) ?? new Date().toISOString();
}

function phoneQueueSupplierTicketStage(task: PhoneQueueSheetTask): SenaTicketStage {
  if (task.action === 'receive') {
    return 'received';
  }
  if (task.action === 'log_order' || task.action === 'update_eta' || task.action === 'follow_up') {
    return 'ordered_waiting';
  }
  return task.ticket?.stage ?? 'ordered_waiting';
}

function phoneQueueCustomerTicketStage(task: PhoneQueueSheetTask): SenaTicketStage {
  if (task.action === 'mark_completed') {
    return 'fulfilled_immediate';
  }
  if (task.action === 'open_pending' || task.action === 'follow_up') {
    return 'pending';
  }
  return task.ticket?.stage ?? 'pending';
}

function phoneQueueTicketEventType(task: PhoneQueueSheetTask): SenaTicketEventType {
  if (task.scope === 'supplier') {
    if (task.action === 'receive') {
      return 'fully_received';
    }
    if (task.action === 'update_eta') {
      return 'eta_updated';
    }
    if (task.action === 'follow_up') {
      return 'followup_logged';
    }
    return 'revised';
  }
  if (task.action === 'mark_completed') {
    return 'fulfilled_immediate';
  }
  if (task.action === 'review_cancellation') {
    return 'canceled';
  }
  return 'note_added';
}

function buildPhoneQueueTicketEvent(
  task: PhoneQueueSheetTask,
  quantity: string,
  actionDate: string,
  note: string,
): SenaTicketEvent | null {
  const ticket = task.ticket;
  if (!ticket) {
    return null;
  }
  const eventType = phoneQueueTicketEventType(task);
  const observedAt = phoneQueueActionObservedAt(actionDate);
  const parsedQuantity = parsePhoneQueueActionQuantity(quantity);
  const noteValue = note.trim() || null;
  const lines = ticket.lines.map((line) => ({
    ...line,
    note: noteValue ?? line.note ?? null,
    ...(task.scope === 'supplier' && task.action === 'receive'
      ? { receivedQuantity: parsedQuantity ?? line.orderedQuantity ?? line.receivedQuantity ?? null }
      : {}),
    ...(task.scope === 'supplier' && (task.action === 'update_eta' || task.action === 'follow_up')
      ? { expectedArrivalAt: observedAt }
      : {}),
  }));

  return {
    ticketId: ticket.ticketId,
    ticketFamily: ticket.ticketFamily,
    lifecycle:
      task.action === 'receive' || task.action === 'mark_completed'
        ? 'resolved'
        : task.action === 'review_cancellation'
          ? 'canceled'
          : 'open',
    stage: task.scope === 'supplier' ? phoneQueueSupplierTicketStage(task) : phoneQueueCustomerTicketStage(task),
    revision: ticket.revision + 1,
    eventType,
    occurredAt: observedAt,
    nextTouchAt: task.action === 'update_eta' || task.action === 'follow_up' ? observedAt : null,
    party: ticket.party ?? (task.scope === 'supplier' ? { role: 'supplier', supplierName: task.supplierName ?? null } : null),
    lines,
    deliveryFee: ticket.deliveryFee ?? null,
    discount: ticket.discount ?? null,
    note: noteValue,
  };
}

export function buildPhoneQueueObservationInput(
  task: PhoneQueueSheetTask,
  quantity: string,
  actionDate: string,
  note: string,
): SenaObservationInput | null {
  const ticketEvent = buildPhoneQueueTicketEvent(task, quantity, actionDate, note);
  if (ticketEvent) {
    const input = emptyPhoneObservationInput(ticketEvent.occurredAt, note.trim() || null);
    input.ticketEvents = [ticketEvent];
    return input;
  }

  if (!task.targetId || (task.targetType !== 'sku' && task.targetType !== 'service')) {
    return null;
  }
  const parsedQuantity = parsePhoneQueueActionQuantity(quantity);
  const observedAt = phoneQueueActionObservedAt(actionDate);
  const input = emptyPhoneObservationInput(observedAt, note.trim() || null);

  if (task.scope === 'supplier' && task.targetType === 'sku') {
    input.orderSignals.push({
      approximateOrderQuantity: task.action === 'receive' ? null : parsedQuantity,
      approximateReceiptQuantity: task.action === 'receive' ? parsedQuantity : null,
      orderPlaced: task.action !== 'receive',
      placementTimestamp: task.action !== 'receive' ? observedAt : null,
      receiptArrived: task.action === 'receive',
      receiptTimestamp: task.action === 'receive' ? observedAt : null,
      skuId: task.targetId,
    });
    return input;
  }

  if (task.scope === 'customer') {
    const realized = task.action === 'mark_completed';
    input.commercialEvents = [{
      entityId: task.targetId,
      entityType: task.targetType,
      flow: realized ? 'immediate' : 'scheduled',
      note: note.trim() || null,
      party: 'customer',
      quantityDelta: realized ? Math.abs(parsedQuantity ?? 0) : -Math.abs(parsedQuantity ?? 0),
      stage: realized ? 'realized' : 'pending',
    }];
    return input;
  }

  return null;
}

function phoneCaptureHrefWithContext(
  href: string,
  context: MobileCaptureActionContext & {
    targetId?: string | null;
    targetType?: 'sku' | 'service' | null;
  },
) {
  const [pathname, rawQuery = ''] = href.split('?');
  const params = new URLSearchParams(rawQuery);
  params.set('source', context.source);
  params.set('breadcrumb', context.breadcrumb);
  params.set('returnTo', context.returnTo);
  if (context.laneId) {
    params.set('laneId', context.laneId);
  }
  if (context.mode) {
    params.set('mode', context.mode);
  }
  if (context.targetType && context.targetId) {
    params.set('targetType', context.targetType);
    params.set('targetId', context.targetId);
    if (context.targetType === 'sku' && !params.has('skus')) {
      params.set('skus', context.targetId);
    }
  }
  if (context.quantitySuggestion != null && Number.isFinite(context.quantitySuggestion)) {
    params.set('quantitySuggestion', String(context.quantitySuggestion));
  }
  if (context.currentQuantity != null && Number.isFinite(context.currentQuantity)) {
    params.set('currentQuantity', String(context.currentQuantity));
  }
  if (context.recentEvidence) {
    params.set('recentEvidence', context.recentEvidence);
  }
  if (context.supplierName) {
    params.set('supplierName', context.supplierName);
  }
  if (context.ticketId) {
    params.set('ticketId', context.ticketId);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function phoneSheetTaskForSupplierTask(task: OverviewTask, tasks: OverviewTask[] = []): PhoneQueueSheetTask {
  const skuTask = isOverviewSkuTask(task) ? task : null;
  const batchTasks = phoneSupplierBatchTasksForTask(task, tasks);
  const batchUpdateHref = phoneSupplierBatchHref(task, tasks);
  return {
    action: task.action,
    actionLabel: task.actionLabel,
    batchTaskCount: batchTasks.length > 1 ? batchTasks.length : null,
    batchUpdateHref,
    detail: task.whyNow,
    href: phoneSupplierTaskHref(task),
    id: task.id,
    meta: task.stateLabel,
    quantitySuggestion: skuTask?.suggestedOrderQuantity ?? null,
    returnTo: buildRememberedInboxHref(),
    scope: 'supplier',
    sourceBreadcrumb: 'Opened from Queue · Supplier task',
    supplierName: 'supplierName' in task ? task.supplierName : null,
    targetId: skuTask?.skuId ?? (isOverviewSupplierTicketTask(task) ? task.ticketId : null),
    targetType: skuTask ? 'sku' : isOverviewSupplierTicketTask(task) ? 'ticket' : null,
    ticket: isOverviewSupplierTicketTask(task) ? task.ticket : null,
    title: isOverviewSupplierTicketTask(task)
      ? task.skuSummaryLabel
      : isOverviewSkuTask(task)
        ? task.skuName
        : task.stateLabel,
  };
}

function phoneSheetTaskForCustomerTask(task: OverviewCustomerTask): PhoneQueueSheetTask {
  return {
    action: task.action,
    actionLabel: task.actionLabel,
    detail: task.whyNow,
    href: task.href,
    id: task.id,
    meta: task.requestSummary,
    quantitySuggestion: task.pendingQuantity || task.completedToday || null,
    returnTo: buildRememberedInboxHref(),
    scope: 'customer',
    sourceBreadcrumb: 'Opened from Queue · Customer task',
    targetId: task.entityId,
    targetType: task.entityType,
    ticket: task.ticket ?? null,
    title: task.label,
  };
}

type PhoneQueueFilterOption = {
  icon: IconComponent;
  label: string;
  value: PhoneQueueFilter;
};

const phoneQueueReviewFilterIcon = overviewTaskActionIcons.review ?? overviewTaskFilterIcons.all;

const PHONE_SUPPLIER_QUEUE_FILTERS: PhoneQueueFilterOption[] = [
  { icon: overviewTaskFilterIcons.all, label: 'All', value: 'all' },
  { icon: overviewTaskFilterIcons.to_order, label: 'To order', value: 'to-order' },
  { icon: overviewTaskFilterIcons.awaiting_receipt, label: 'Waiting', value: 'waiting' },
  { icon: overviewTaskFilterIcons.follow_up_today, label: 'Follow up', value: 'follow-up' },
  { icon: overviewTaskFilterIcons.ready_to_receive, label: 'Receive', value: 'receive' },
  { icon: phoneQueueReviewFilterIcon, label: 'Review', value: 'review' },
];

const PHONE_CUSTOMER_QUEUE_FILTERS: PhoneQueueFilterOption[] = [
  { icon: overviewCustomerFilterIcons.all, label: 'All', value: 'all' },
  { icon: overviewCustomerFilterIcons.review, label: 'Review', value: 'review' },
  { icon: overviewCustomerFilterIcons.quoted, label: 'Quoted', value: 'quoted' },
  { icon: overviewCustomerFilterIcons.open, label: 'Open', value: 'open' },
  { icon: StatusReadyIcon, label: 'Ready', value: 'ready' },
  { icon: overviewCustomerFilterIcons.closed, label: 'Closed', value: 'closed' },
];

function normalizePhoneQueueFilter(value: string | null, scope: PhoneQueueScope): PhoneQueueFilter {
  const filters = scope === 'supplier' ? PHONE_SUPPLIER_QUEUE_FILTERS : PHONE_CUSTOMER_QUEUE_FILTERS;
  return filters.some((filter) => filter.value === value) ? value as PhoneQueueFilter : 'all';
}

function phoneQueueMatchesSupplierFilter(task: OverviewTask, filter: PhoneQueueFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'to-order') {
    return task.action === 'log_order' || ('state' in task && task.state === 'to_order');
  }
  if (filter === 'waiting') {
    return task.action === 'update_eta' || ('state' in task && task.state === 'awaiting_receipt');
  }
  if (filter === 'follow-up') {
    return task.action === 'follow_up' || ('state' in task && task.state === 'follow_up_today');
  }
  if (filter === 'receive') {
    return task.action === 'receive' || ('state' in task && task.state === 'ready_to_receive');
  }
  if (filter === 'review') {
    return task.action === 'review' || task.action === 'start_update' || task.kind === 'stale_update_reminder';
  }
  return false;
}

function phoneQueueMatchesCustomerFilter(task: OverviewCustomerTask, filter: PhoneQueueFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'review') {
    return task.state === 'review' || task.action === 'review_cancellation';
  }
  if (filter === 'quoted') {
    return task.state === 'quoted';
  }
  if (filter === 'open') {
    return task.state === 'open' || task.action === 'open_pending';
  }
  if (filter === 'ready') {
    return task.action === 'mark_completed' || task.completedToday > 0;
  }
  if (filter === 'closed') {
    return task.state === 'closed';
  }
  return false;
}

function phoneSupplierTaskMeta(task: OverviewTask, language: ReturnType<typeof usePreferences>['language']) {
  if (isOverviewSupplierTicketTask(task)) {
    return [
      translateUiLiteral(language, 'Supplier'),
      task.supplierName,
      task.stateLabel,
    ].filter(Boolean).join(' · ');
  }
  if (isOverviewSkuTask(task)) {
    return [
      translateUiLiteral(language, 'Supplier'),
      task.supplierName,
      task.stateLabel,
    ].filter(Boolean).join(' · ');
  }
  return task.stateLabel;
}

function phoneSupplierTaskDetail(task: OverviewTask, language: ReturnType<typeof usePreferences>['language']) {
  const parts = [
    task.whyNow,
    task.etaLabel,
  ];
  if (isOverviewSkuTask(task)) {
    parts.push(translateUiLiteral(language, 'Recommended {value}', { value: `${task.suggestedOrderQuantity}u` }));
  } else if (isOverviewSupplierTicketTask(task)) {
    parts.push(translateUiLiteral(language, '{count} SKUs', { count: task.skuCount }));
  }
  return parts.filter(Boolean).join(' · ');
}

function phoneCustomerTaskMeta(task: OverviewCustomerTask) {
  return [
    task.sourceLabel,
    task.stateLabel,
    task.contactSummary,
  ].filter(Boolean).join(' · ');
}

function phoneCustomerTaskDetail(task: OverviewCustomerTask) {
  const parts = [
    task.requestSummary,
    task.whyNow,
  ];
  if (task.blockedQuantity > 0) {
    parts.push(`${task.blockedQuantity} blocked`);
  } else if (task.pendingQuantity > 0) {
    parts.push(`${task.pendingQuantity} pending`);
  } else if (task.completedToday > 0) {
    parts.push(`${task.completedToday} completed today`);
  }
  return parts.filter(Boolean).join(' · ');
}

function normalizePhoneInventoryScope(value: string | null): PhoneInventoryScope {
  return value === 'all' ? 'all' : 'focus';
}

function normalizePhoneInventoryRange(value: string | null): PhoneInventoryRange {
  return value === 'all' ? 'all' : 'recent';
}

function normalizePhoneInventoryView(value: string | null): PhoneInventoryView {
  return value === 'flow' || value === 'forecast' || value === 'pipeline' ? value : 'health';
}

function normalizePhoneInventoryHorizon(value: string | null): PhoneInventoryHorizon {
  return value === '7d' || value === '30d' || value === '60d' ? value : '14d';
}

function normalizePhoneInventoryEntity(value: string | null): PhoneInventoryEntity {
  return value === 'sku' || value === 'service' ? value : 'all';
}

function formatPhoneMoney(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function normalizePhoneMoneyScope(value: string | null): PhoneMoneyScope {
  return value === 'statement' || value === 'contributors' ? value : 'all';
}

function normalizePhoneMoneyCompare(value: string | null): PhoneMoneyCompare {
  return value === 'evidence' ? 'evidence' : 'none';
}

function normalizePhoneMoneyEntity(value: string | null): PhoneMoneyEntity {
  return value === 'sku' || value === 'service' ? value : 'all';
}

function normalizePhoneMoneyRange(value: string | null): PhoneMoneyRange {
  return value === '1d' || value === '7d' || value === '90d' || value === 'custom' ? value : '30d';
}

function normalizePhoneExplainSection(value: string | null): PhoneExplainSection {
  return value === 'posture' || value === 'evidence' || value === 'fragile' ? value : 'all';
}

function normalizePhoneExplainTimeframe(value: string | null): PhoneExplainTimeframe {
  return value === 'all' ? 'all' : 'recent';
}

function normalizePhoneExplainEntity(value: string | null): PhoneExplainEntity {
  return value === 'sku' || value === 'service' ? value : 'all';
}

function PhoneBottomSheet({
  children,
  description,
  slot = 'phone-bottom-sheet',
  title,
  onClose,
}: {
  children: ReactNode;
  description?: string;
  slot?: string;
  title: string;
  onClose: () => void;
}) {
  const { language } = usePreferences();
  const sheetRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) {
      return;
    }
    const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(focusableSelector));
    focusable[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || focusable.length === 0) {
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    sheet.addEventListener('keydown', handleKeyDown);
    return () => sheet.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  return (
    <section
      ref={sheetRef}
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto rounded-t-[1.25rem] border border-border/80 bg-background px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-18px_50px_rgba(27,15,7,0.22)] motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:fade-in-0 motion-safe:duration-300 motion-safe:ease-out"
      data-slot={slot}
      role="dialog"
    >
      <div className="mx-auto grid max-w-[28rem] gap-4">
        <div className="sticky top-0 z-10 flex min-w-0 items-start justify-between gap-3 bg-background/95 pb-2 backdrop-blur">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold leading-tight text-foreground">{title}</h2>
            {description ? <p id={descriptionId} className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          <Button className="min-h-10 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={onClose}>
            {translateUiLiteral(language, 'Close')}
          </Button>
        </div>
        {children}
      </div>
    </section>
  );
}

function PhoneQueueTaskSheet({
  task,
  onClose,
}: {
  task: PhoneQueueSheetTask;
  onClose: () => void;
}) {
  const { language } = usePreferences();
  const inventory = useInventory();
  const [actionDate, setActionDate] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [actionQuantity, setActionQuantity] = useState(task.quantitySuggestion != null ? String(task.quantitySuggestion) : '');
  const [savingAction, setSavingAction] = useState(false);
  const [savedAction, setSavedAction] = useState(false);
  const saveQueueAction = async () => {
    const parsedQuantity = parsePhoneQueueActionQuantity(actionQuantity);
    const parsedDate = parseExplicitPhoneQueueActionDate(actionDate);
    const requiresQuantity = !task.ticket || task.action === 'receive';
    if (requiresQuantity && (parsedQuantity == null || parsedQuantity <= 0)) {
      setSavedAction(false);
      setActionError(translateUiLiteral(language, 'Enter a quantity greater than zero before saving.'));
      return;
    }
    if (!parsedDate) {
      setSavedAction(false);
      setActionError(translateUiLiteral(language, 'Enter a valid action date before saving.'));
      return;
    }
    setSavingAction(true);
    setActionError(null);
    try {
      const input = buildPhoneQueueObservationInput(task, actionQuantity, actionDate, actionNote);
      if (!input) {
        setSavedAction(false);
        setActionError(translateUiLiteral(language, 'Open the scoped capture lane for this task. This quick form cannot persist it.'));
        return;
      }
      await inventory.ingestSenaObservation(input);
      setSavedAction(true);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : translateUiLiteral(language, 'Unable to save this queue action.'));
    } finally {
      setSavingAction(false);
    }
  };

  return (
    <PhoneBottomSheet description={task.meta} slot="phone-task-sheet" title={task.title} onClose={onClose}>
      <p className="khmer-safe-eyebrow text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {translateUiLiteral(language, task.scope === 'supplier' ? 'Supplier task' : 'Customer task')}
      </p>
      <p className="text-xs font-medium text-muted-foreground" data-slot="phone-task-sheet-source">
        {translateUiLiteral(language, task.scope === 'supplier' ? 'Opened from Queue · Supplier task' : 'Opened from Queue · Customer task')}
      </p>

        <PhoneSurface className="grid gap-2" slot="phone-task-sheet-why">
          <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Why this is here')}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {task.detail ?? translateUiLiteral(language, 'This task needs an operator decision before the queue can move.')}
          </p>
        </PhoneSurface>

        <PhoneSurface className="grid gap-3" slot="phone-task-sheet-action-form">
          <div>
            <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Action form')}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {translateUiLiteral(language, task.scope === 'supplier'
                ? 'Capture the supplier decision here, or open the scoped capture lane for full persistence.'
                : 'Capture the customer decision here, or open the scoped capture lane for full persistence.')}
            </p>
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, phoneQueueActionQuantityLabel(task))}</span>
            <Input
              inputMode="decimal"
              min="0"
              placeholder={task.quantitySuggestion != null ? String(task.quantitySuggestion) : '0'}
              type="text"
              value={actionQuantity}
              onChange={(event) => {
                setSavedAction(false);
                setActionQuantity(event.currentTarget.value);
              }}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, phoneQueueActionDateLabel(task))}</span>
            <Input
              type="datetime-local"
              value={actionDate}
              onChange={(event) => {
                setSavedAction(false);
                setActionDate(event.currentTarget.value);
              }}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Note')}</span>
            <Input
              placeholder={translateUiLiteral(language, phoneQueueActionNotePlaceholder(task))}
              value={actionNote}
              onChange={(event) => {
                setSavedAction(false);
                setActionNote(event.currentTarget.value);
              }}
            />
          </label>
          {task.scope === 'supplier' && task.batchTaskCount && task.batchTaskCount > 1 && task.batchUpdateHref ? (
            <div className="rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-2.5 text-sm leading-6 text-muted-foreground" data-slot="phone-task-sheet-batch-choice">
              <p className="font-semibold text-foreground">{translateUiLiteral(language, 'Batch choice')}</p>
              <p className="mt-1">
                {translateUiLiteral(language, 'Also update {count} similar supplier items?', { count: task.batchTaskCount })}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <span className="inline-flex min-h-10 items-center justify-center rounded-[0.8rem] border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground">
                  {translateUiLiteral(language, 'This item only')}
                </span>
                <Button asChild className="min-h-10 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
                  <Link to={phoneHrefWithActionContext(task.batchUpdateHref, task)}>
                    {translateUiLiteral(language, 'Update group')}
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
          {actionError ? (
            <div className="rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive" data-slot="phone-task-sheet-save-error">
              <p className="font-semibold">{translateUiLiteral(language, 'Unable to save this queue action.')}</p>
              <p className="mt-1">{actionError}</p>
            </div>
          ) : null}
          {savedAction ? (
            <div className="rounded-[0.8rem] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm leading-6 text-emerald-900" data-slot="phone-task-sheet-save-outcome">
              <p className="font-semibold">{translateUiLiteral(language, 'Queue action saved.')}</p>
              <p className="mt-1">
                {phoneQueueSavedSummary(task, actionQuantity, actionDate)}. {translateUiLiteral(language, buildPhoneQueueObservationInput(task, actionQuantity, actionDate, actionNote)
                  ? 'Queue, Inventory, Money, and Explain will refresh from this evidence.'
                  : 'Open the scoped capture lane to persist this ticket-only queue action.')}
              </p>
              {actionNote.trim() ? <p className="mt-1">{actionNote}</p> : null}
            </div>
          ) : null}
        </PhoneSurface>

        <PhoneSurface className="grid gap-2" slot="phone-task-sheet-preview">
          <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Downstream preview')}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {task.scope === 'supplier'
              ? translateUiLiteral(language, 'Kaur Khor will update supplier work and refresh queue, Inventory, Money, and Explain after save.')
              : translateUiLiteral(language, 'Kaur Khor will update customer work and refresh queue, Inventory, Money, and Explain after save.')}
          </p>
        </PhoneSurface>

        <div className="grid gap-2" data-slot="phone-task-sheet-actions">
          <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt disabled={savingAction} type="button" onClick={() => void saveQueueAction()}>
            {translateUiLiteral(language, savingAction ? 'Saving…' : 'Save')}
          </Button>
          <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={phoneHrefWithActionContext(task.href, task)}>
            {task.actionLabel}
          </PhoneActionRow>
          {task.targetType === 'sku' && task.targetId ? (
            <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={`/catalog/skus/${encodeURIComponent(task.targetId)}`}>
              {translateUiLiteral(language, 'Open SKU')}
            </PhoneActionRow>
          ) : task.targetType === 'service' && task.targetId ? (
            <PhoneActionRow icon={<EntityServiceIcon data-icon="inline-start" />} to={`/catalog/services/${encodeURIComponent(task.targetId)}`}>
              {translateUiLiteral(language, 'Open service')}
            </PhoneActionRow>
          ) : null}
          <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={onClose}>
            {translateUiLiteral(language, 'Close')}
          </Button>
        </div>
    </PhoneBottomSheet>
  );
}

function PhoneTaskCard({
  actionLabel,
  detail,
  href,
  label,
  meta,
  onSelect,
  tone,
}: {
  actionLabel: string;
  detail: string | null;
  href: string;
  label: string;
  meta: string;
  onSelect?: () => void;
  tone: Parameters<typeof statusPillClassName>[0];
}) {
  return (
    <PhoneListItem
      actionLabel={actionLabel}
      detail={detail}
      href={href}
      label={label}
      meta={meta}
      onClick={onSelect}
      tone={tone}
    />
  );
}

function PhoneTodayRoute({
  storage,
}: {
  storage: PhoneStorage;
}) {
  const inventory = useInventory();
  const { language } = usePreferences();
  const { customer, supplier } = usePhoneModels();
  const [selectedOutcome, setSelectedOutcome] = useState<PhoneHistoryEntry | null>(null);
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
  const hasCatalogItems = productCount > 0;
  const todayInventoryRows = useMemo(
    () => buildPhoneTodayInventoryRows({ catalog, inventory }),
    [catalog, inventory],
  );
  const nextHref = !hasCatalogItems
    ? '/catalog'
    : topSupplierTask
      ? `/work/queue?task=${encodeURIComponent(topSupplierTask.id)}`
      : topCustomerTask?.href ?? RECORD_UPDATE_HUB_PATH;
  const nextLabel =
    !hasCatalogItems
      ? translateUiLiteral(language, 'Start with products')
      : topSupplierTask
      ? isOverviewSupplierTicketTask(topSupplierTask)
        ? topSupplierTask.skuSummaryLabel
        : isOverviewSkuTask(topSupplierTask)
          ? topSupplierTask.skuName
          : topSupplierTask.stateLabel
      : topCustomerTask?.label ?? translateUiLiteral(language, 'Capture a fresh update');
  const nextAction = !hasCatalogItems ? translateUiLiteral(language, 'Open products') : topSupplierTask?.actionLabel ?? topCustomerTask?.actionLabel ?? translateUiLiteral(language, 'Start update');
  const latestObservation = useMemo(() => {
    const latestAt = latestObservationAtForRecords(inventory.observations ?? []);
    return inventory.observations?.find((observation) => observation.input.observedAt === latestAt) ?? null;
  }, [inventory.observations]);
  const latestHistoryEntry = useMemo(
    () => buildPhoneHistoryEntries(latestObservation ? [latestObservation] : [], catalog)[0] ?? null,
    [catalog, latestObservation],
  );
  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-today-page">
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Today')}
          title={translateUiLiteral(language, 'Preparing today')}
        />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Loading workspace…')}
          detail={translateUiLiteral(language, 'Kaur Khor is preparing products, queue facts, and recent evidence for phone mode.')}
        />
      </PhonePage>
    );
  }

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
          {!hasCatalogItems
            ? translateUiLiteral(language, 'Create your first SKU or service so Kaur Khor can build today’s work.')
            : topSupplierTask?.whyNow ?? topCustomerTask?.whyNow ?? translateUiLiteral(language, updateCount > 0 ? 'No urgent work right now. Capture the next stock, supplier, or customer change when it happens.' : 'Capture your first update. Record what is physically on hand so Kaur Khor can build the queue.')}
        </p>
        <Button asChild className={cn(phoneFocusClassName, 'min-h-12 w-full justify-center rounded-[0.8rem] bg-primary text-primary-foreground hover:bg-primary/90')} data-slot="phone-primary-action">
          <Link to={nextHref}>
            <ActionOpenExternalIcon data-icon="inline-start" />
            <span className="min-w-0 whitespace-normal leading-5">{nextAction}</span>
          </Link>
        </Button>
      </PhoneSurface>

      <PhoneMetricStrip
        slot="phone-metric-strip"
        to={buildRememberedInboxHref()}
        metrics={[
          {
            icon: <NavigationTaskListIcon aria-hidden="true" className="size-3.5" />,
            label: translateUiLiteral(language, 'Queue'),
            value: supplier.tasks.length + customer.tasks.length,
          },
          {
            icon: <EntityTransitIcon aria-hidden="true" className="size-3.5" />,
            label: translateUiLiteral(language, 'Supplier'),
            value: supplier.tasks.length,
          },
          {
            icon: <EntityCustomerIcon aria-hidden="true" className="size-3.5" />,
            label: translateUiLiteral(language, 'Customer'),
            value: customer.tasks.length,
          },
        ]}
      />

      <PhoneSection title={translateUiLiteral(language, 'Inventory today')}>
        {todayInventoryRows.length > 0 ? (
          <div className={cn(phoneSurfaceClassName, 'overflow-hidden p-0')} data-slot="phone-today-inventory-table">
            <div className="grid grid-cols-[minmax(0,1fr)_4.25rem_4rem_4rem] border-b border-border/60 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <span className="min-w-0">{translateUiLiteral(language, 'Item')}</span>
              <span className="text-center">{translateUiLiteral(language, 'Current')}</span>
              <span className="text-center">{translateUiLiteral(language, 'In')}</span>
              <span className="text-center">{translateUiLiteral(language, 'Out')}</span>
            </div>
            <div className="divide-y divide-border/55">
              {todayInventoryRows.map((row) => (
                <Link
                  key={row.id}
                  className={cn(phoneFocusClassName, 'grid grid-cols-[minmax(0,1fr)_4.25rem_4rem_4rem] items-center px-3 py-2.5 text-sm hover:bg-accent/30')}
                  to={`/catalog/skus/${encodeURIComponent(row.id)}`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ItemAvatar
                      className="size-9 rounded-[0.7rem]"
                      imagePath={row.imagePath}
                      name={row.name}
                      size="compact"
                      type="sku"
                    />
                    <span className="min-w-0">
                      <span className="khmer-safe-label block whitespace-normal break-words font-semibold text-foreground" data-slot="phone-today-inventory-item-title">{row.name}</span>
                      {row.supplier ? <span className="block whitespace-normal break-words text-xs text-muted-foreground" data-slot="phone-today-inventory-item-description">{row.supplier}</span> : null}
                    </span>
                  </span>
                  <span className="text-center font-semibold tabular-nums text-foreground">{row.current == null ? '—' : row.current}</span>
                  <span className="text-center tabular-nums text-emerald-700">{row.unitsIn}</span>
                  <span className="text-center tabular-nums text-destructive">{row.unitsOut}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <PhoneEmptyState>
            {translateUiLiteral(language, 'Record stock, receipt, or sale activity to fill today’s inventory flow.')}
          </PhoneEmptyState>
        )}
      </PhoneSection>

      <PhoneSection title={translateUiLiteral(language, 'Quick record')}>
        {hasCatalogItems ? (
          <div className="grid grid-cols-2 gap-2">
            {PHONE_CAPTURE_LANES.map((lane) => (
              <PhoneActionRow key={lane.id} icon={lane.icon} to={phoneCaptureLaneHubHref(lane)}>
                {translateUiLiteral(language, lane.title)}
              </PhoneActionRow>
            ))}
          </div>
        ) : (
          <PhoneEmptyState>
            {translateUiLiteral(language, 'Create a SKU or service before recording updates.')}
          </PhoneEmptyState>
        )}
      </PhoneSection>

      {latestObservation || updateCount > 0 ? (
        <PhoneSection title={translateUiLiteral(language, 'Last saved')}>
          <button
            className={cn(phoneSurfaceClassName, phoneFocusClassName, 'grid min-w-0 gap-2 p-4 text-left')}
            data-design-icon-exempt
            data-slot="phone-recent-outcome"
            type="button"
            onClick={() => {
              if (latestHistoryEntry) {
                setSelectedOutcome(latestHistoryEntry);
              }
            }}
          >
            <span className="text-sm font-semibold text-foreground">
              {translateUiLiteral(language, latestHistoryEntry?.group ?? 'Latest update recorded')}
            </span>
            <span className="text-sm leading-6 text-muted-foreground">
              {latestHistoryEntry
                ? `${latestHistoryEntry.entity}${latestHistoryEntry.quantity ? ` · ${latestHistoryEntry.quantity}` : ''} · ${latestHistoryEntry.time}`
                : latestObservation?.input.observedAt
                  ? translateUiLiteral(language, 'Evidence saved {value}', { value: latestObservation.input.observedAt.slice(0, 10) })
                  : translateUiLiteral(language, '{count} updates available', { count: updateCount })}
            </span>
          </button>
        </PhoneSection>
      ) : null}

      {selectedOutcome ? (
        <PhoneBottomSheet
          description={`${selectedOutcome.entity} · ${selectedOutcome.time}`}
          slot="phone-today-outcome-sheet"
          title={translateUiLiteral(language, selectedOutcome.group)}
          onClose={() => setSelectedOutcome(null)}
        >
          <p className="khmer-safe-eyebrow text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {translateUiLiteral(language, 'Last saved')}
          </p>
          <PhoneSurface className="grid gap-2" slot="phone-today-outcome-detail">
            <p className="text-sm font-semibold text-foreground">{selectedOutcome.layer}</p>
            <p className="text-sm leading-6 text-muted-foreground">{selectedOutcome.detail}</p>
            {selectedOutcome.quantity ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, 'Quantity: {value}', { value: selectedOutcome.quantity })}
              </p>
            ) : null}
          </PhoneSurface>
          <div className="grid grid-cols-2 gap-2">
            <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setSelectedOutcome(null)}>
              {translateUiLiteral(language, 'Close')}
            </Button>
            <Button asChild className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
              <Link to="/settings/history">
                {translateUiLiteral(language, 'Update history')}
              </Link>
            </Button>
          </div>
        </PhoneBottomSheet>
      ) : null}
    </PhonePage>
  );
}

function PhoneQueueRoute() {
  const { language } = usePreferences();
  const inventory = useInventory();
  const automation = useAutomation();
  const navigate = useNavigate();
  const { customer, supplier } = usePhoneModels();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedAutomationIntakeId, setSelectedAutomationIntakeId] = useState<string | null>(null);
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const hasCatalogItems = Boolean(catalog && (
    catalog.skus.some((sku) => !sku.archived) ||
    catalog.services.some((service) => !service.archived)
  ));
  const updateCount = inventory.observations?.length ?? inventory.latestRun?.observationCount ?? 0;
  const scope: PhoneQueueScope = searchParams.get('scope') === 'customer' ? 'customer' : 'supplier';
  const query = searchParams.get('q') ?? '';
  const normalizedQuery = query.trim().toLowerCase();
  const filter = normalizePhoneQueueFilter(searchParams.get('filter'), scope);
  const selectedTaskId = searchParams.get('task');
  const activeFilters = scope === 'supplier' ? PHONE_SUPPLIER_QUEUE_FILTERS : PHONE_CUSTOMER_QUEUE_FILTERS;
  const updateQueueState = (next: { filter?: PhoneQueueFilter; q?: string; scope?: PhoneQueueScope }) => {
    const params = new URLSearchParams(searchParams);
    const nextScope = next.scope ?? scope;
    const nextQuery = next.q ?? query;
    const nextFilter = next.scope && next.scope !== scope ? 'all' : next.filter ?? filter;

    if (nextScope === 'customer') {
      params.set('scope', 'customer');
    } else {
      params.delete('scope');
    }
    if (nextQuery.trim()) {
      params.set('q', nextQuery);
    } else {
      params.delete('q');
    }
    if (nextFilter === 'all') {
      params.delete('filter');
    } else {
      params.set('filter', nextFilter);
    }
    params.delete('task');
    setSearchParams(params);
  };
  const supplierSearchTasks = supplier.tasks.filter((task) => {
    if (!normalizedQuery) {
      return true;
    }
    const identity = isOverviewSupplierTicketTask(task)
      ? task.skuSummaryLabel
      : isOverviewSkuTask(task)
        ? task.skuName
        : task.stateLabel;
    return `${identity} ${task.stateLabel} ${task.actionLabel} ${task.whyNow ?? ''}`.toLowerCase().includes(normalizedQuery);
  });
  const customerSearchTasks = customer.tasks.filter((task) =>
    !normalizedQuery ||
    `${task.label} ${task.requestSummary} ${task.actionLabel} ${task.whyNow ?? ''}`.toLowerCase().includes(normalizedQuery),
  );
  const supplierTasks = supplierSearchTasks.filter((task) => phoneQueueMatchesSupplierFilter(task, filter));
  const customerTasks = customerSearchTasks.filter((task) => phoneQueueMatchesCustomerFilter(task, filter));
  const tasks = scope === 'supplier' ? supplierTasks : customerTasks;
  const selectedTask = selectedTaskId
    ? scope === 'supplier'
      ? supplier.tasks.find((task) => task.id === selectedTaskId)
      : customer.tasks.find((task) => task.id === selectedTaskId)
    : null;
  const selectedDrawerTask: OverviewSupplierTicketTask | null = selectedTask && scope === 'supplier'
    ? isOverviewSupplierTicketTask(selectedTask as OverviewTask)
      ? selectedTask as OverviewSupplierTicketTask
      : isOverviewSkuTask(selectedTask as OverviewTask)
        ? supplierTicketTaskForSkuTask({
            latestObservedAt: inventory.workspaceSummary?.latestObservedAt,
            task: selectedTask as Extract<OverviewTask, { kind: 'sku' }>,
            translate: (value) => translateUiLiteral(language, value),
          })
        : null
    : null;
  const selectedAutomationIntake = selectedAutomationIntakeId
    ? automation.intakes.find((intake) => intake.intakeId === selectedAutomationIntakeId) ?? null
    : null;
  const customerTicketOptions = useMemo(
    () => sortRecordTicketOptionsByRecent(recordTicketOptions(inventory.recordUpdateContext, 'customer', inventory.catalog)),
    [inventory.catalog, inventory.recordUpdateContext],
  );
  const openTaskSheet = (taskId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('task', taskId);
    setSearchParams(params);
  };
  const closeTaskSheet = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('task');
    setSearchParams(params);
  };
  const openCustomerTask = (task: OverviewCustomerTask) => {
    if (task.source === 'telegram_intake' && task.automationIntakeId && !task.promotedTicketId) {
      const intakeExists = automation.intakes.some((intake) => intake.intakeId === task.automationIntakeId);
      if (!intakeExists) {
        navigate(task.href);
        return;
      }
      setSelectedAutomationIntakeId(task.automationIntakeId);
      return;
    }
    navigate(task.href);
  };

  useEffect(() => {
    if (selectedAutomationIntakeId && !selectedAutomationIntake) {
      setSelectedAutomationIntakeId(null);
    }
  }, [selectedAutomationIntake, selectedAutomationIntakeId]);

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-queue-page">
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Queue')}
          title={translateUiLiteral(language, 'Work that needs a decision')}
        />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Preparing queue…')}
          detail={translateUiLiteral(language, 'Loading supplier work, customer work, and saved evidence before showing decisions.')}
        />
      </PhonePage>
    );
  }

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
        onChange={(value) => updateQueueState({ scope: value })}
      />
      <label className="relative block">
        <ActionSearchIcon aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={translateUiLiteral(language, 'Search queue')}
          className="h-12 rounded-[0.8rem] border-border/70 bg-card pl-9 shadow-xs focus-visible:ring-ring/70"
          data-slot="phone-queue-search"
          placeholder={translateUiLiteral(language, 'Search queue')}
          value={query}
          onChange={(event) => updateQueueState({ q: event.target.value })}
        />
      </label>
      <PhoneMetricStrip
        slot="phone-queue-summary-strip"
        metrics={[
          {
            icon: <EntityTransitIcon aria-hidden="true" className="size-3.5" />,
            label: translateUiLiteral(language, 'Supplier'),
            value: scope === 'supplier' ? supplierTasks.length : supplierSearchTasks.length,
          },
          {
            icon: <EntityCustomerIcon aria-hidden="true" className="size-3.5" />,
            label: translateUiLiteral(language, 'Customer'),
            value: scope === 'customer' ? customerTasks.length : customerSearchTasks.length,
          },
          {
            icon: <NavigationListIcon aria-hidden="true" className="size-3.5" />,
            label: translateUiLiteral(language, 'Showing'),
            value: tasks.length,
          },
        ]}
      />
      <div className="phone-queue-filter-row flex max-w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1" data-slot="phone-queue-filter-row">
        {activeFilters.map((option) => {
          const Icon = option.icon;
          const label = translateUiLiteral(language, option.label);
          return (
            <button
              key={option.value}
              aria-label={label}
              aria-pressed={filter === option.value}
              className={cn(
                phoneFocusClassName,
                'phone-queue-filter-option flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold',
                filter === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/70 bg-card text-muted-foreground hover:bg-accent/40',
              )}
              type="button"
              onClick={() => updateQueueState({ filter: option.value })}
            >
              <Icon aria-hidden="true" className="phone-queue-filter-icon size-4 shrink-0" data-slot="phone-queue-filter-icon" />
              <span className="phone-queue-filter-label min-w-0 truncate" data-slot="phone-queue-filter-label">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-3">
        {tasks.length > 0 ? tasks.slice(0, 12).map((task) => {
          if (scope === 'supplier') {
            const supplierTask = task as OverviewTask;
            const canOpenDrawer = isOverviewSupplierTicketTask(supplierTask) || isOverviewSkuTask(supplierTask);
            return (
            <PhoneTaskCard
              key={supplierTask.id}
              actionLabel={translateUiLiteral(language, 'Record now')}
              detail={phoneSupplierTaskDetail(supplierTask, language)}
              href={phoneSupplierTaskHref(supplierTask)}
              label={
                isOverviewSupplierTicketTask(supplierTask)
                  ? supplierTask.skuSummaryLabel
                  : isOverviewSkuTask(supplierTask)
                    ? supplierTask.skuName
                    : supplierTask.stateLabel
              }
              meta={phoneSupplierTaskMeta(supplierTask, language)}
              onSelect={canOpenDrawer ? () => openTaskSheet(supplierTask.id) : undefined}
              tone={supplierTask.statusTone}
            />
            );
          }
          return (
            <PhoneTaskCard
              key={(task as OverviewCustomerTask).id}
              actionLabel={(task as OverviewCustomerTask).actionLabel}
              detail={phoneCustomerTaskDetail(task as OverviewCustomerTask)}
              href={(task as OverviewCustomerTask).href}
              label={(task as OverviewCustomerTask).label}
              meta={phoneCustomerTaskMeta(task as OverviewCustomerTask)}
              onSelect={() => openCustomerTask(task as OverviewCustomerTask)}
              tone={(task as OverviewCustomerTask).stateBadgeTone}
            />
          );
        }) : (
          <PhoneSurface className="grid gap-3 text-center" slot="phone-queue-empty-state">
            <p className="text-sm leading-6 text-muted-foreground">
              {translateUiLiteral(language, !hasCatalogItems
                ? 'Work needs products first.'
                : normalizedQuery
                    ? 'No tasks match this view. Clear search or broaden filters.'
                  : updateCount === 0
                    ? 'Work needs your first update.'
                    : 'No urgent work right now. Capture the next real-world change when it happens.')}
            </p>
            {!hasCatalogItems ? (
              <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to="/catalog">
                {translateUiLiteral(language, 'Open products')}
              </PhoneActionRow>
            ) : normalizedQuery ? (
              <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => updateQueueState({ q: '' })}>
                {translateUiLiteral(language, 'Clear search')}
              </Button>
            ) : updateCount === 0 ? (
              <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={RECORD_UPDATE_HUB_PATH}>
                {translateUiLiteral(language, 'Capture update')}
              </PhoneActionRow>
            ) : null}
          </PhoneSurface>
        )}
      </div>
      <OverviewTaskDrawer
        open={selectedDrawerTask != null}
        presentation="bottom"
        task={selectedDrawerTask}
        onOpenChange={(open) => {
          if (!open) {
            closeTaskSheet();
          }
        }}
      />
      <AutomationIntakeDrawer
        intake={selectedAutomationIntake}
        isSaving={automation.isSaving}
        language={language}
        open={selectedAutomationIntake != null}
        presentation="bottom"
        ticketOptions={customerTicketOptions}
        onClose={() => setSelectedAutomationIntakeId(null)}
        onPromote={automation.promoteIntake}
        onResolve={automation.resolveIntake}
      />
    </PhonePage>
  );
}

function PhoneCaptureRoute() {
  const location = useLocation();
  if (location.pathname === RECORD_UPDATE_HUB_PATH) {
    return (
      <PhonePage className="min-h-full content-center" slot="phone-capture-page">
        <PhonePageHeader eyebrow="Capture" title="Record what changed" />
        <Suspense
          fallback={(
            <PhoneLoadingState
              title="Preparing capture…"
              detail="Loading record lanes before opening the capture menu."
            />
          )}
        >
          <LazyRecordUpdateHubRoute embedded />
        </Suspense>
      </PhonePage>
    );
  }
  return (
    <Suspense
      fallback={(
        <PhonePage slot="phone-capture-page">
          <PhonePageHeader eyebrow="Capture" title="Record what changed" />
          <PhoneLoadingState
            title="Preparing capture…"
            detail="Loading products and saved draft context before opening record lanes."
          />
        </PhonePage>
      )}
    >
      <LazyStockUpdateSessionRoute />
    </Suspense>
  );
}

function PhoneLegacyCaptureRoute() {
  const inventory = useInventory();
  const automation = useAutomation();
  const { language } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const [captureSearchParams, setCaptureSearchParams] = useSearchParams();
  const lane = phoneCaptureLaneForPath(location.pathname);
  const [draftCounts, setDraftCounts] = useState(() => phoneCaptureDraftCountsByLane());
  const [customerChannel, setCustomerChannel] = useState('Walk-in');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [supplierDiscrepancy, setSupplierDiscrepancy] = useState('');
  const [supplierEta, setSupplierEta] = useState('');
  const [supplierLeadTime, setSupplierLeadTime] = useState('');
  const [supplierReceiptDisposition, setSupplierReceiptDisposition] = useState<PhoneSupplierReceiptDisposition>('matched');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [ignorePrefillTarget, setIgnorePrefillTarget] = useState(false);
  const [observedAtInput, setObservedAtInput] = useState(defaultPhoneObservedAtInput);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'choose' | 'details' | 'review' | 'saved'>('choose');
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const hasCatalogItems = Boolean(catalog && (
    catalog.skus.some((sku) => !sku.archived) ||
    catalog.services.some((service) => !service.archived)
  ));
  const prefilledSkuId = parseRouteIdList(captureSearchParams.get('skus'))[0] ?? '';
  const prefilledTargetId = captureSearchParams.get('targetId')?.trim() || prefilledSkuId;
  const sourceBreadcrumb = captureSearchParams.get('breadcrumb') ?? '';
  const returnTo = sanitizePhoneReturnTo(captureSearchParams.get('returnTo'), buildRememberedInboxHref());
  const quantitySuggestion = captureSearchParams.get('quantitySuggestion') ?? '';
  const supplierName = captureSearchParams.get('supplierName') ?? '';
  const captureTicketId = captureSearchParams.get('ticketId') ?? '';
  const rawCaptureMode = captureSearchParams.get('ticketMode') ?? captureSearchParams.get('mode');
  const captureMode = normalizePhoneCaptureMode(lane?.id, rawCaptureMode);
  const captureModeOptions = phoneCaptureModesForLane(lane?.id);
  const captureModeLabel = phoneCaptureModeLabel(lane?.id, captureMode);
  const isCustomerCaptureLane = lane?.id === 'customer-order-pending' || lane?.id === 'customer-order-completed';
  const isSupplierCaptureLane = lane?.id === 'supplier-order-pending' || lane?.id === 'supplier-receipt';
  const knownCustomerContacts = useMemo(() => {
    const contacts = new Map<string, { channel: string | null; name: string | null; phone: string | null }>();
    [...automation.conversations, ...automation.intakes].forEach((entry) => {
      const name = entry.customerDisplayName ?? null;
      const phone = entry.phone ?? null;
      const channel = 'channel' in entry ? entry.channel : null;
      const key = phoneContactKey(phone || name);
      if (key && !contacts.has(key)) {
        contacts.set(key, { channel, name, phone });
      }
      const nameKey = phoneContactKey(name);
      if (nameKey && !contacts.has(nameKey)) {
        contacts.set(nameKey, { channel, name, phone });
      }
    });
    return [...contacts.values()];
  }, [automation.conversations, automation.intakes]);
  const matchingCustomerByPhone = customerPhone.trim()
    ? knownCustomerContacts.find((contact) => phoneContactKey(contact.phone) === phoneContactKey(customerPhone))
    : null;
  const matchingCustomerByName = customerName.trim()
    ? knownCustomerContacts.find((contact) => phoneContactKey(contact.name) === phoneContactKey(customerName))
    : null;
  const customerConflict =
    matchingCustomerByPhone?.name && customerName.trim() && phoneContactKey(matchingCustomerByPhone.name) !== phoneContactKey(customerName)
      ? translateUiLiteral(language, 'This phone was previously linked to {value}.', { value: matchingCustomerByPhone.name })
      : matchingCustomerByName?.phone && customerPhone.trim() && phoneContactKey(matchingCustomerByName.phone) !== phoneContactKey(customerPhone)
        ? translateUiLiteral(language, 'This name was previously linked to {value}.', { value: matchingCustomerByName.phone })
        : null;
  const entityOptions = useMemo(() => {
    const skus = catalog?.skus
      .filter((sku) => !sku.archived)
      .map((sku) => ({
        id: sku.skuId,
        label: sku.name,
        meta: supplierNameForSku(sku) ?? translateUiLiteral(language, 'SKU'),
        type: 'sku' as const,
      })) ?? [];
    const services = catalog?.services
      .filter((service) => !service.archived)
      .map((service) => ({
        id: service.serviceId,
        label: service.name,
        meta: translateUiLiteral(language, 'Service'),
        type: 'service' as const,
      })) ?? [];
    return lane?.id === 'customer-order-pending' || lane?.id === 'customer-order-completed'
      ? [...services, ...skus]
      : skus;
  }, [catalog, lane?.id, language]);
  const selectedTarget = entityOptions.find((option) => option.id === selectedTargetId)
    ?? (ignorePrefillTarget ? null : entityOptions.find((option) => option.id === prefilledTargetId))
    ?? null;
  const selectedSku = selectedTarget?.type === 'sku'
    ? catalog?.skus.find((sku) => sku.skuId === selectedTarget.id) ?? null
    : null;
  const selectedService = selectedTarget?.type === 'service'
    ? catalog?.services.find((service) => service.serviceId === selectedTarget.id) ?? null
    : null;
  const selectableTickets = (isCustomerCaptureLane
    ? inventory.recordUpdateContext?.openTicketsByFamily.customer
    : isSupplierCaptureLane
      ? inventory.recordUpdateContext?.openTicketsByFamily.supplier
      : []) ?? [];
  const selectedCaptureTicket = captureTicketId
    ? inventory.recordUpdateContext?.latestTicketsById[captureTicketId]?.value
      ?? selectableTickets.find((ticket) => ticket.ticketId === captureTicketId)
      ?? null
    : null;
  const wantsTicketSelector = Boolean(captureMode && ['modify', 'cancel', 'complete', 'receive'].includes(captureMode));
  const shouldShowTicketSelector = Boolean(wantsTicketSelector && selectableTickets.length > 0);
  const missingContextualTarget = Boolean(prefilledTargetId && step === 'details' && !selectedTarget);
  const draftTargetId = selectedTarget?.id ?? (selectedTargetId || prefilledTargetId);
  const draftKey = phoneCaptureDraftKey(lane?.id, draftTargetId, captureTicketId);
  const quantityError = useMemo(() => phoneCaptureQuantityError(lane?.id, quantity), [lane?.id, quantity]);
  const hasEditedDraft = Boolean(step !== 'saved' && (
    quantity.trim() ||
    note.trim() ||
    customerChannel !== 'Walk-in' ||
    customerName.trim() ||
    customerPhone.trim() ||
    supplierDiscrepancy.trim() ||
    supplierEta.trim() ||
    supplierLeadTime.trim() ||
    supplierReceiptDisposition !== 'matched'
  ));
  const requestCaptureNavigation = (target: string) => {
    if (hasEditedDraft) {
      setPendingNavigationTarget(target);
      return;
    }
    navigate(target);
  };
  const discardCaptureDraftAndNavigate = () => {
    try {
      if (draftKey) {
        window.sessionStorage.removeItem(draftKey);
      }
    } catch {
      // Browser storage can be unavailable in hardened/private contexts.
    }
    setDraftCounts(phoneCaptureDraftCountsByLane());
    const target = pendingNavigationTarget ?? RECORD_UPDATE_HUB_PATH;
    setQuantity('');
    setNote('');
    setPendingNavigationTarget(null);
    navigate(target);
  };
  const chooseCaptureTarget = (option: { id: string; type: 'service' | 'sku' }) => {
    const params = new URLSearchParams(captureSearchParams);
    params.delete('ticketId');
    params.set('targetId', option.id);
    params.set('targetType', option.type);
    if (option.type === 'sku') {
      params.set('skus', option.id);
    } else {
      params.delete('skus');
    }
    setIgnorePrefillTarget(false);
    setSelectedTargetId(option.id);
    setCaptureSearchParams(params);
    setStep('details');
  };
  const chooseCaptureTicket = (ticket: SenaTicketSummary) => {
    const params = new URLSearchParams(captureSearchParams);
    const firstLine = ticket.lines[0] ?? null;
    params.set('ticketId', ticket.ticketId);
    if (firstLine) {
      params.set('targetId', firstLine.entityId);
      params.set('targetType', firstLine.entityType);
      if (firstLine.entityType === 'sku') {
        params.set('skus', firstLine.entityId);
      } else {
        params.delete('skus');
      }
      setSelectedTargetId(firstLine.entityId);
      setQuantity((current) => current || String(phoneTicketLineDraftQuantity(firstLine) ?? ''));
    }
    setIgnorePrefillTarget(false);
    setCaptureSearchParams(params);
    setStep('details');
  };
  const updateCaptureMode = (mode: PhoneCaptureMode) => {
    const params = new URLSearchParams(captureSearchParams);
    params.delete('ticketId');
    params.set('mode', mode);
    params.set('ticketMode', mode);
    setCaptureSearchParams(params);
  };

  useEffect(() => {
    if (prefilledTargetId && !selectedTargetId && !ignorePrefillTarget) {
      setSelectedTargetId(prefilledTargetId);
      setStep('details');
    }
  }, [ignorePrefillTarget, prefilledTargetId, selectedTargetId]);

  useEffect(() => {
    if (!wantsTicketSelector || inventory.recordUpdateContext) {
      return;
    }
    void inventory.loadSenaRecordUpdateContext().catch(() => undefined);
  }, [inventory, wantsTicketSelector]);

  useEffect(() => {
    setDraftCounts(phoneCaptureDraftCountsByLane());
  }, [location.pathname]);

  useEffect(() => {
    const draft = readPhoneCaptureDraft(draftKey);
    if (draft) {
      setCustomerChannel(draft.customerChannel || 'Walk-in');
      setCustomerName(draft.customerName);
      setCustomerPhone(draft.customerPhone);
      setObservedAtInput(draft.observedAt || defaultPhoneObservedAtInput());
      setQuantity(draft.quantity);
      setNote(draft.note);
      setSupplierDiscrepancy(draft.supplierDiscrepancy);
      setSupplierEta(draft.supplierEta);
      setSupplierLeadTime(draft.supplierLeadTime);
      setSupplierReceiptDisposition(draft.supplierReceiptDisposition);
      return;
    }
    if (quantitySuggestion) {
      setQuantity((current) => current || quantitySuggestion);
    }
  }, [draftKey, quantitySuggestion]);

  useEffect(() => {
    if (!draftKey || step === 'saved') {
      return;
    }
    try {
      if (!hasEditedDraft) {
        window.sessionStorage.removeItem(draftKey);
        return;
      }
      window.sessionStorage.setItem(draftKey, JSON.stringify({
        customerChannel,
        customerName,
        customerPhone,
        note,
        observedAt: observedAtInput,
        quantity,
        supplierDiscrepancy,
        supplierEta,
        supplierLeadTime,
        supplierReceiptDisposition,
      }));
    } catch {
      // Draft persistence is best-effort in browser/mobile storage contexts.
    }
  }, [customerChannel, customerName, customerPhone, draftKey, hasEditedDraft, note, observedAtInput, quantity, step, supplierDiscrepancy, supplierEta, supplierLeadTime, supplierReceiptDisposition]);

  useEffect(() => {
    if (!hasEditedDraft) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasEditedDraft]);

  useEffect(() => {
    if (!hasEditedDraft) {
      return;
    }
    const handleDocumentClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute('href') ?? '';
      let targetPath = href;
      try {
        const url = new URL((anchor as HTMLAnchorElement).href);
        const hashPath = url.hash.replace(/^#/, '');
        if (hashPath.startsWith('/__phone/')) {
          const [, , , ...rest] = hashPath.split('/');
          targetPath = `/${rest.join('/')}`;
        } else if (hashPath.startsWith('/')) {
          targetPath = hashPath;
        } else {
          targetPath = url.pathname + url.search;
        }
      } catch {
        // Keep the raw href fallback.
      }
      if (!targetPath || targetPath.startsWith('/work/capture')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingNavigationTarget(targetPath);
    };
    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [hasEditedDraft]);

  const savePhoneCapture = async () => {
    if (!lane || !selectedTarget) {
      return;
    }
    const quantityValidationError = phoneCaptureQuantityError(lane.id, quantity);
    if (quantityValidationError) {
      setSaveError(translateUiLiteral(language, quantityValidationError));
      return;
    }
    const parsedQuantity = parseEditableNumberWithCommas(quantity);
    const observedAt = phoneObservedAtInputToIso(observedAtInput);
    if (!observedAt) {
      setSaveError(translateUiLiteral(language, 'Enter a valid date and time.'));
      return;
    }
    const input = emptyPhoneObservationInput(observedAt, note.trim() || null);

    if (lane.id === 'stock-count') {
      if (!selectedSku) {
        setSaveError(translateUiLiteral(language, 'Choose a SKU before saving a stock count.'));
        return;
      }
      input.stockSnapshot.push({
        costPerUnit: selectedSku.costPerUnit,
        productPrice: selectedSku.productPrice,
        skuId: selectedSku.skuId,
        unitsInStock: parsedQuantity,
      });
    } else if (lane.id === 'supplier-order-pending' || lane.id === 'supplier-receipt') {
      if (!selectedSku) {
        setSaveError(translateUiLiteral(language, 'Choose a SKU before saving supplier work.'));
        return;
      }
      const receipt = lane.id === 'supplier-receipt';
      const supplierCanceled = captureMode === 'cancel';
      const expectedArrivalAt = supplierEta.trim() ? phoneObservedAtInputToIso(supplierEta) : null;
      if (supplierEta.trim() && !expectedArrivalAt) {
        setSaveError(translateUiLiteral(language, 'Enter a valid date and time.'));
        return;
      }
      input.orderSignals.push({
        approximateOrderQuantity: receipt || supplierCanceled ? null : parsedQuantity,
        approximateReceiptQuantity: receipt ? parsedQuantity : null,
        orderPlaced: !receipt && !supplierCanceled,
        placementTimestamp: receipt || supplierCanceled ? null : observedAt,
        receiptArrived: receipt,
        receiptTimestamp: receipt ? observedAt : null,
        skuId: selectedSku.skuId,
      });
      if (receipt) {
        input.adjustmentSignals = [{
          quantityDelta: parsedQuantity,
          reason: phoneSupplierReceiptAdjustmentReason(supplierReceiptDisposition),
          skuId: selectedSku.skuId,
        }];
      }
      input.ticketEvents = [{
        ticketId: captureTicketId || phoneSupplierTicketId(lane.id, selectedSku.skuId, observedAt),
        ticketFamily: 'supplier',
        lifecycle: supplierCanceled ? 'canceled' : receipt ? 'resolved' : 'open',
        stage: receipt ? 'received' : supplierCanceled ? 'to_order' : 'ordered_waiting',
        revision: captureTicketId ? (selectedCaptureTicket?.revision ?? 1) + 1 : 1,
        eventType: supplierCanceled ? 'canceled' : receipt ? 'fully_received' : captureMode === 'modify' || captureTicketId ? 'revised' : 'created',
        occurredAt: observedAt,
        nextTouchAt: receipt ? null : expectedArrivalAt,
        party: {
          role: 'supplier',
          supplierName: supplierName || supplierNameForSku(selectedSku) || null,
        },
        lines: [{
          entityId: selectedSku.skuId,
          entityType: 'sku',
          expectedArrivalAt,
          note: [
            receipt ? phoneSupplierReceiptDispositionLabel(supplierReceiptDisposition) : null,
            supplierDiscrepancy.trim() || note.trim() || null,
          ].filter(Boolean).join(' · ') || null,
          orderedQuantity: receipt || supplierCanceled ? null : parsedQuantity,
          receivedQuantity: receipt ? parsedQuantity : null,
        }],
        note: [
          receipt ? phoneSupplierReceiptDispositionLabel(supplierReceiptDisposition) : null,
          supplierDiscrepancy.trim() || note.trim() || null,
        ].filter(Boolean).join(' · ') || null,
      }];
      const parsedLeadTime = parsePhoneLeadTimeHint(supplierLeadTime);
      if (!receipt && !supplierCanceled && parsedLeadTime != null) {
        input.leadTimeHints.push({
          highDays: parsedLeadTime,
          lowDays: parsedLeadTime,
          skuId: selectedSku.skuId,
          typicalDays: parsedLeadTime,
          variabilityClass: null,
        });
      }
    } else if (lane.id === 'customer-order-pending' || lane.id === 'customer-order-completed') {
      const realized = lane.id === 'customer-order-completed';
      const customerCanceled = captureMode === 'cancel';
      const customerRefund = captureMode === 'refund';
      input.commercialEvents = [{
        entityId: selectedTarget.id,
        entityType: selectedService ? 'service' : 'sku',
        flow: customerRefund ? 'reversal' : realized ? 'immediate' : 'scheduled',
        note: note.trim() || null,
        party: 'customer',
        quantityDelta:
          customerRefund || customerCanceled
            ? Math.abs(parsedQuantity)
            : lane.id === 'customer-order-pending'
              ? -Math.abs(parsedQuantity)
              : Math.abs(parsedQuantity),
        stage: realized ? 'realized' : 'pending',
        reason: customerRefund ? 'refund/reversal' : customerCanceled ? 'cancel pending' : null,
      }];
      input.ticketEvents = [{
        ticketId: captureTicketId || phoneCustomerTicketId(lane.id, selectedTarget.id, observedAt),
        ticketFamily: 'customer',
        lifecycle: customerCanceled ? 'canceled' : realized ? 'resolved' : 'open',
        stage: realized ? 'fulfilled_immediate' : 'pending',
        revision: captureTicketId ? (selectedCaptureTicket?.revision ?? 1) + 1 : 1,
        eventType: customerCanceled ? 'canceled' : realized ? 'fulfilled_immediate' : captureMode === 'modify' || captureTicketId ? 'revised' : 'created',
        occurredAt: observedAt,
        nextTouchAt: realized ? null : observedAt,
        party: {
          role: 'customer',
          channelLabel: customerChannel.trim() || null,
          customerName: customerName.trim() || null,
          phone: customerPhone.trim() || null,
        },
        lines: [{
          entityId: selectedTarget.id,
          entityType: selectedService ? 'service' : 'sku',
          quantityDelta: parsedQuantity,
          note: note.trim() || null,
        }],
        note: note.trim() || null,
      }];
    }

    setSaving(true);
    setSaveError(null);
    try {
      await inventory.ingestSenaObservation(input);
      try {
        if (draftKey) {
          window.sessionStorage.removeItem(draftKey);
        }
      } catch {
        // Saved state should still proceed if transient draft cleanup fails.
      }
      setDraftCounts(phoneCaptureDraftCountsByLane());
      setStep('saved');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : translateUiLiteral(language, 'Unable to save this update.'));
    } finally {
      setSaving(false);
    }
  };

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-capture-page">
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Capture')}
          title={translateUiLiteral(language, lane?.title ?? 'Record Update')}
        />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Preparing capture…')}
          detail={translateUiLiteral(language, 'Loading products and saved draft context before opening record lanes.')}
        />
      </PhonePage>
    );
  }

  if (lane) {
    return (
      <PhonePage slot="phone-capture-page">
        {pendingNavigationTarget ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/30 px-4 py-[max(env(safe-area-inset-bottom),1rem)]" data-slot="phone-capture-leave-confirmation">
            <PhoneSurface className="grid w-full max-w-[28rem] gap-3 px-4 py-4">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {translateUiLiteral(language, 'Leave capture draft?')}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Your unsaved quantity and note are kept in this browser session. Discard them before leaving this capture route.')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setPendingNavigationTarget(null)}>
                  {translateUiLiteral(language, 'Keep editing')}
                </Button>
                <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="destructive" onClick={discardCaptureDraftAndNavigate}>
                  {translateUiLiteral(language, 'Discard draft')}
                </Button>
              </div>
            </PhoneSurface>
          </div>
        ) : null}
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Capture')}
          title={translateUiLiteral(language, lane.title)}
        />
        <PhoneSurface className="grid gap-3" slot="phone-capture-lane-summary">
          {sourceBreadcrumb ? (
            <p className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary" data-slot="phone-capture-source-breadcrumb">
              {translateUiLiteral(language, sourceBreadcrumb)}
            </p>
          ) : null}
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, lane.description)}
          </p>
          {selectedTarget || supplierName || quantitySuggestion ? (
            <div className="grid gap-2 rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-2.5" data-slot="phone-capture-prefill-summary">
              {selectedTarget ? (
                <p className="text-sm font-semibold text-foreground">{selectedTarget.label}</p>
              ) : null}
              {supplierName ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {translateUiLiteral(language, 'Supplier')}: {supplierName}
                </p>
              ) : null}
              {quantitySuggestion ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {translateUiLiteral(language, 'Suggested quantity')}: {quantitySuggestion}
                </p>
              ) : null}
              {captureTicketId ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {translateUiLiteral(language, 'Ticket')}: {captureTicketId}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2" data-slot="phone-capture-stepper">
            {(['choose', 'details', 'review'] as const).map((stepId) => (
              <span
                key={stepId}
                className={cn(
                  'rounded-full border px-2 py-1 text-center text-[0.68rem] font-semibold capitalize',
                  step === stepId || (step === 'saved' && stepId === 'review')
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-secondary/50 text-muted-foreground',
                )}
              >
                {translateUiLiteral(language, stepId === 'choose' ? 'Choose' : stepId === 'details' ? 'Details' : 'Review')}
              </span>
            ))}
          </div>
          <p className="rounded-[0.8rem] bg-secondary/70 px-3 py-2 text-xs leading-5 text-secondary-foreground" data-slot="phone-capture-interval-strip">
            {translateUiLiteral(language, 'Since last update')} · {translateUiLiteral(language, 'Saving as {value}', { value: observedAtInput.replace('T', ' ') })} · {translateUiLiteral(language, 'Partial update')}
          </p>
          {captureModeOptions.length > 0 ? (
            <PhoneChipRow
              slot="phone-capture-mode-row"
              value={captureMode ?? captureModeOptions[0]!.value}
              options={captureModeOptions.map((option) => ({
                label: translateUiLiteral(language, option.label),
                value: option.value,
              }))}
              onChange={updateCaptureMode}
            />
          ) : null}
        </PhoneSurface>

        {step === 'choose' ? (
          <PhoneSection title={translateUiLiteral(language, 'Choose entity')}>
            <div className="grid gap-2" data-slot="phone-capture-choose-step">
              {shouldShowTicketSelector ? (
                <div className="grid gap-2 rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-3" data-slot="phone-capture-ticket-selector">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, isCustomerCaptureLane ? 'Existing customer ticket' : 'Existing supplier ticket')}</p>
                  {selectableTickets.slice(0, 3).map((ticket) => (
                    <button
                      key={ticket.ticketId}
                      data-design-icon-exempt
                      className={cn(phoneFocusClassName, 'min-h-12 rounded-[0.8rem] border border-border/70 bg-card px-3 py-2 text-left text-sm text-muted-foreground')}
                      type="button"
                      onClick={() => {
                        chooseCaptureTicket(ticket);
                        setStep('details');
                      }}
                    >
                      <span className="block font-semibold text-foreground">{ticket.ticketId}</span>
                      <span className="block text-xs">{ticket.lines.length} line{ticket.lines.length === 1 ? '' : 's'} · {ticket.stage}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {entityOptions.length > 0 ? entityOptions.slice(0, 8).map((option) => (
                <button
                  key={`${option.type}:${option.id}`}
                  data-design-icon-exempt
                  className={cn(phoneSurfaceClassName, phoneFocusClassName, 'min-h-[4.75rem] px-3.5 py-3 text-left')}
                  type="button"
                  onClick={() => {
                    chooseCaptureTarget(option);
                  }}
                >
                  <span className="block text-base font-semibold text-foreground">{option.label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{option.meta}</span>
                </button>
              )) : (
                <PhoneEmptyState>
                  {translateUiLiteral(language, 'No products yet. Create your first SKU or service.')}
                </PhoneEmptyState>
              )}
            </div>
          </PhoneSection>
        ) : null}

        {step === 'details' ? (
          <PhoneSection title={translateUiLiteral(language, 'Details')}>
            <PhoneSurface className="grid gap-3" slot="phone-capture-details-step">
              {missingContextualTarget ? (
                <div className="grid gap-3 rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-3" data-slot="phone-capture-missing-target">
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      {translateUiLiteral(language, 'The original item is no longer available.')}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-destructive/80">
                      {translateUiLiteral(language, 'Choose another item or return to source.')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => {
                      setIgnorePrefillTarget(true);
                      setSelectedTargetId('');
                      setStep('choose');
                    }}>
                      {translateUiLiteral(language, 'Choose another item')}
                    </Button>
                    <Button asChild className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
                      <Link to={returnTo}>
                        {translateUiLiteral(language, 'Return to source')}
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedTarget?.label ?? translateUiLiteral(language, 'No entity selected')}
                </p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {translateUiLiteral(language, lane.effect)}
                </p>
                {captureModeLabel ? (
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {translateUiLiteral(language, 'Mode')}: {translateUiLiteral(language, captureModeLabel)}
                  </p>
                ) : null}
              </div>
              {isCustomerCaptureLane ? (
                <div className="grid gap-3 rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-3" data-slot="phone-capture-customer-context">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Customer context')}</p>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Channel')}</span>
                    <Input
                      placeholder={translateUiLiteral(language, 'Walk-in, Telegram, phone, or custom')}
                      value={customerChannel}
                      onChange={(event) => setCustomerChannel(event.currentTarget.value)}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Customer name')}</span>
                    <Input
                      placeholder={translateUiLiteral(language, 'Optional name')}
                      value={customerName}
                      onChange={(event) => setCustomerName(event.currentTarget.value)}
                    />
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Phone')}</span>
                    <Input
                      inputMode="tel"
                      placeholder={translateUiLiteral(language, 'Optional phone')}
                      value={customerPhone}
                      onChange={(event) => setCustomerPhone(event.currentTarget.value)}
                    />
                  </label>
                  {matchingCustomerByPhone?.name && !customerName.trim() ? (
                    <Button className="min-h-10 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setCustomerName(matchingCustomerByPhone.name ?? '')}>
                      {translateUiLiteral(language, 'Use name {value}', { value: matchingCustomerByPhone.name })}
                    </Button>
                  ) : null}
                  {matchingCustomerByName?.phone && !customerPhone.trim() ? (
                    <Button className="min-h-10 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setCustomerPhone(matchingCustomerByName.phone ?? '')}>
                      {translateUiLiteral(language, 'Use phone {value}', { value: matchingCustomerByName.phone })}
                    </Button>
                  ) : null}
                  {customerConflict ? (
                    <p className="rounded-[0.8rem] border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900" data-slot="phone-capture-customer-conflict">
                      {customerConflict} {translateUiLiteral(language, 'Review before saving.')}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {shouldShowTicketSelector ? (
                <div className="grid gap-2 rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-3" data-slot="phone-capture-ticket-selector">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, isCustomerCaptureLane ? 'Existing customer ticket' : 'Existing supplier ticket')}</p>
                  {selectableTickets.slice(0, 3).map((ticket) => (
                    <button
                      key={ticket.ticketId}
                      data-design-icon-exempt
                      className={cn(
                        phoneFocusClassName,
                        'min-h-12 rounded-[0.8rem] border px-3 py-2 text-left text-sm',
                        ticket.ticketId === captureTicketId ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 bg-card text-muted-foreground',
                      )}
                      type="button"
                      onClick={() => chooseCaptureTicket(ticket)}
                    >
                      <span className="block font-semibold text-foreground">{ticket.ticketId}</span>
                      <span className="block text-xs">{ticket.lines.length} line{ticket.lines.length === 1 ? '' : 's'} · {ticket.stage}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedCaptureTicket ? (
                <p className="rounded-[0.8rem] border border-primary/30 bg-primary/10 px-3 py-2 text-sm leading-6 text-primary" data-slot="phone-capture-selected-ticket">
                  {translateUiLiteral(language, 'Editing ticket')}: {selectedCaptureTicket.ticketId}
                </p>
              ) : null}
              {isSupplierCaptureLane ? (
                <div className="grid gap-3 rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-3" data-slot="phone-capture-supplier-context">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Supplier timing')}</p>
                  {lane.id === 'supplier-receipt' ? (
                    <PhoneChipRow
                      slot="phone-capture-receipt-disposition-row"
                      value={supplierReceiptDisposition}
                      options={PHONE_SUPPLIER_RECEIPT_DISPOSITIONS.map((option) => ({
                        label: translateUiLiteral(language, option.label),
                        value: option.value,
                      }))}
                      onChange={setSupplierReceiptDisposition}
                    />
                  ) : null}
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, lane.id === 'supplier-receipt' ? 'Receipt note or discrepancy' : 'Expected arrival / ETA')}</span>
                    <Input
                      placeholder={translateUiLiteral(language, lane.id === 'supplier-receipt' ? 'Short, missing, damaged, or complete' : 'Expected date or ETA')}
                      type={lane.id === 'supplier-receipt' ? 'text' : 'datetime-local'}
                      value={lane.id === 'supplier-receipt' ? supplierDiscrepancy : supplierEta}
                      onChange={(event) => {
                        if (lane.id === 'supplier-receipt') {
                          setSupplierDiscrepancy(event.currentTarget.value);
                        } else {
                          setSupplierEta(event.currentTarget.value);
                        }
                      }}
                    />
                  </label>
                  {lane.id === 'supplier-order-pending' ? (
                    <label className="grid gap-1.5">
                      <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Lead-time hint')}</span>
                      <Input
                        inputMode="decimal"
                        placeholder={translateUiLiteral(language, 'Typical days')}
                        type="text"
                        value={supplierLeadTime}
                        onChange={(event) => setSupplierLeadTime(event.currentTarget.value)}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, lane.primaryFieldLabel)}</span>
                <Input
                  inputMode="decimal"
                  min="0"
                  placeholder="0"
                  type="text"
                  value={quantity}
                  onChange={(event) => setQuantity(event.currentTarget.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Observed date/time')}</span>
                <Input
                  type="datetime-local"
                  value={observedAtInput}
                  onChange={(event) => setObservedAtInput(event.currentTarget.value)}
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-sm font-medium text-foreground">{translateUiLiteral(language, 'Note')}</span>
                <Input
                  placeholder={translateUiLiteral(language, 'Optional context')}
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setStep('choose')}>
                  {translateUiLiteral(language, 'Back')}
                </Button>
                <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt disabled={!selectedTarget || !quantity.trim() || Boolean(quantityError)} type="button" onClick={() => setStep('review')}>
                  {translateUiLiteral(language, 'Review')}
                </Button>
              </div>
            </PhoneSurface>
          </PhoneSection>
        ) : null}

        {step === 'review' ? (
          <PhoneSection title={translateUiLiteral(language, 'Review')}>
            <PhoneSurface className="grid gap-3" slot="phone-capture-review-step">
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, lane.reviewCopy)}
              </p>
              {saveError ? (
                <div className="grid gap-3 rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm leading-6 text-destructive" data-slot="phone-capture-save-error">
                  <div>
                    <p className="font-semibold">{translateUiLiteral(language, 'Unable to save this update.')}</p>
                    <p className="mt-1 text-destructive/85">
                      {saveError} {translateUiLiteral(language, 'Your draft is still here. Check the quantity and try again.')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt disabled={saving} type="button" variant="outline" onClick={() => void savePhoneCapture()}>
                      {translateUiLiteral(language, 'Retry')}
                    </Button>
                    <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setSaveError(null)}>
                      {translateUiLiteral(language, 'Keep draft')}
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-2.5">
                <p className="text-sm font-semibold text-foreground">{selectedTarget?.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {translateUiLiteral(language, lane.primaryFieldLabel)}: {quantity}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {translateUiLiteral(language, 'Observed')}: {observedAtInput.replace('T', ' ')}
                </p>
                {captureModeLabel ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'Mode')}: {translateUiLiteral(language, captureModeLabel)}
                  </p>
                ) : null}
                {isCustomerCaptureLane ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {translateUiLiteral(language, 'Customer')}: {[customerChannel, customerName, customerPhone].filter(Boolean).join(' · ') || translateUiLiteral(language, 'Walk-in')}
                  </p>
                ) : null}
                {isSupplierCaptureLane ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {translateUiLiteral(language, lane.id === 'supplier-receipt' ? 'Receipt note or discrepancy' : 'ETA')}: {lane.id === 'supplier-receipt' ? `${translateUiLiteral(language, phoneSupplierReceiptDispositionLabel(supplierReceiptDisposition))} · ${supplierDiscrepancy || translateUiLiteral(language, 'No discrepancy noted')}` : supplierEta.replace('T', ' ') || translateUiLiteral(language, 'Not set')}
                  </p>
                ) : null}
                {note.trim() ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setStep('details')}>
                  {translateUiLiteral(language, 'Back')}
                </Button>
                <Button className="min-h-12 rounded-[0.8rem]" data-design-icon-exempt disabled={saving} type="button" onClick={() => void savePhoneCapture()}>
                  {translateUiLiteral(language, saving ? 'Saving…' : 'Save')}
                </Button>
              </div>
            </PhoneSurface>
          </PhoneSection>
        ) : null}

        {step === 'saved' ? (
          <PhoneSection title={translateUiLiteral(language, 'Saved')}>
            <PhoneSurface className="grid gap-3" slot="phone-capture-saved-step">
              <p className="text-sm font-semibold text-foreground">
                {translateUiLiteral(language, '{value} saved', { value: lane.title })}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, lane.effect)} {translateUiLiteral(language, 'Queue, Inventory, Money, and Explain will refresh from this evidence.')}
              </p>
              <div className="grid gap-2">
                <PhoneActionRow icon={<NavigationTaskListIcon data-icon="inline-start" />} to={returnTo}>
                  {translateUiLiteral(language, returnTo.startsWith('/work/queue') ? 'Return to queue' : 'Return to source')}
                </PhoneActionRow>
                <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={RECORD_UPDATE_HUB_PATH}>
                  {translateUiLiteral(language, 'Start another update')}
                </PhoneActionRow>
                {lane.id === 'customer-order-completed' && captureMode === 'refund' && selectedTarget?.type === 'sku' ? (
                  <PhoneActionRow
                    icon={<EntitySkuIcon data-icon="inline-start" />}
                    to={phoneCaptureHrefWithContext(RECORD_UPDATE_STOCK_COUNT_PATH, {
                      breadcrumb: `Opened from ${lane.title} · Refund / reversal`,
                      quantitySuggestion: Number.isFinite(parseEditableNumberWithCommas(quantity)) ? parseEditableNumberWithCommas(quantity) : null,
                      returnTo,
                      source: 'sku-detail',
                      targetId: selectedTarget.id,
                      targetType: 'sku',
                    })}
                  >
                    {translateUiLiteral(language, 'Add returned stock in Products Update')}
                  </PhoneActionRow>
                ) : null}
              </div>
            </PhoneSurface>
          </PhoneSection>
        ) : null}
      </PhonePage>
    );
  }

  return (
    <PhonePage slot="phone-capture-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Capture')}
        title={translateUiLiteral(language, 'Record what changed')}
      />
      <PhoneSurface className="grid gap-3" slot="phone-capture-menu">
        {hasCatalogItems ? (
          <>
            {PHONE_CAPTURE_LANES.map((captureLane) => {
              const draftCount = draftCounts.get(captureLane.id) ?? 0;
              return (
                <PhoneActionRow key={captureLane.id} icon={captureLane.icon} to={phoneCaptureLaneHubHref(captureLane)}>
                  <span className="grid gap-0.5">
                    <span>{translateUiLiteral(language, captureLane.title)}</span>
                    {draftCount > 0 ? (
                      <span className="text-xs font-medium text-muted-foreground" data-slot="phone-capture-draft-indicator">
                        {translateUiLiteral(language, '{count} draft{suffix}', { count: draftCount, suffix: draftCount === 1 ? '' : 's' })}
                      </span>
                    ) : null}
                  </span>
                </PhoneActionRow>
              );
            })}
            <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={buildRememberedInboxHref()}>
              {translateUiLiteral(language, 'Open queue')}
            </PhoneActionRow>
          </>
        ) : (
          <>
            <PhoneEmptyState>
              {translateUiLiteral(language, 'Create a SKU or service before recording updates.')}
            </PhoneEmptyState>
            <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to="/catalog">
              {translateUiLiteral(language, 'Open products')}
            </PhoneActionRow>
          </>
        )}
      </PhoneSurface>
    </PhonePage>
  );
}

function PhoneProductsRoute() {
  const inventory = useInventory();
  const { language } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const typeFilter = normalizePhoneProductTypeFilter(searchParams.get('type'));
  const quickFilter = normalizePhoneProductQuickFilter(searchParams.get('filter'));
  const selectedActionId = searchParams.get('action');
  const normalizedQuery = normalizePhoneProductSearch(query);

  useEffect(() => {
    if (inventory.recordUpdateContext || !catalog) {
      return;
    }
    void inventory.loadSenaRecordUpdateContext().catch(() => undefined);
  }, [catalog, inventory]);

  const updateProductsParam = (key: string, value: string, defaultValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === defaultValue) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== 'action') {
      next.delete('action');
    }
    setSearchParams(next);
  };

  const skuCards = catalog?.skus.filter((sku) => !sku.archived).map((sku) => {
    const supplierName = supplierNameForSku(sku) ?? translateUiLiteral(language, 'No supplier');
    const latestStock = inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value;
    const latestOrder = inventory.recordUpdateContext?.latestOrderBySku[sku.skuId]?.value;
    const latestReceipt = inventory.recordUpdateContext?.latestReceiptBySku[sku.skuId]?.value;
    const recent = inventory.recordUpdateContext?.recentActivity.some((entry) => entry.entityId === sku.skuId) ?? false;
    const units = latestStock?.unitsInStock ?? null;
    const inbound = latestOrder?.approximateOrderQuantity ?? null;
    const status = units == null
      ? 'Unknown'
      : units <= 0
        ? 'Out'
        : units <= 2
          ? 'Low'
          : inbound && inbound > 0
            ? 'In transit'
            : 'OK';
    const tone: Parameters<typeof statusPillClassName>[0] = status === 'Out' || status === 'Low' ? 'danger' : status === 'Unknown' ? 'neutral' : 'success';
    const detail = units == null
      ? translateUiLiteral(language, 'Needs count · latest physical stock unknown')
      : inbound && inbound > 0
        ? translateUiLiteral(language, '{count} on hand · {inbound} inbound', { count: units, inbound })
        : latestReceipt?.receiptTimestamp
          ? translateUiLiteral(language, '{count} on hand · receipt evidence saved', { count: units })
          : translateUiLiteral(language, '{count} on hand · count freshness available in detail', { count: units });
    return {
      detail,
      href: `/catalog/skus/${encodeURIComponent(sku.skuId)}`,
      id: `sku:${sku.skuId}`,
      name: sku.name,
      recent,
      searchText: normalizePhoneProductSearch(`${sku.name} ${sku.skuId} ${supplierName}`),
      sku,
      status,
      supplierName,
      tone,
      type: 'sku' as const,
      units,
      inbound,
    };
  }) ?? [];

  const serviceCards = catalog?.services.filter((service) => !service.archived).map((service) => {
    const linkedSkus = linkedSkusForService(catalog, service.serviceId).filter((sku) => !sku.archived);
    const blocked = inventory.observations?.some((observation) => observation.input.serviceStockouts.includes(service.serviceId)) ?? false;
    const bottleneckSku = linkedSkus.find((sku) => (inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value.unitsInStock ?? 1) <= 0)
      ?? linkedSkus[0]
      ?? null;
    const recent = inventory.recordUpdateContext?.recentActivity.some((entry) => entry.entityId === service.serviceId) ?? false;
    const status = blocked
      ? 'Blocked'
      : linkedSkus.length === 0
        ? 'Unknown'
        : bottleneckSku && (inventory.recordUpdateContext?.latestStockBySku[bottleneckSku.skuId]?.value.unitsInStock ?? 1) <= 2
          ? 'Fragile'
          : 'Sellable';
    const tone: Parameters<typeof statusPillClassName>[0] = status === 'Blocked' ? 'danger' : status === 'Fragile' ? 'warning' : status === 'Unknown' ? 'neutral' : 'success';
    return {
      bottleneckSku,
      detail: bottleneckSku
        ? translateUiLiteral(language, '{status} · bottleneck {value}', { status, value: bottleneckSku.name })
        : translateUiLiteral(language, '{status} · no linked SKU bottleneck', { status }),
      href: `/catalog/services/${encodeURIComponent(service.serviceId)}`,
      id: `service:${service.serviceId}`,
      linkedSkus,
      meta: translateUiLiteral(language, 'Service · {count} linked SKUs', { count: linkedSkus.length }),
      name: service.name,
      recent,
      searchText: normalizePhoneProductSearch(`${service.name} ${service.serviceId} ${linkedSkus.map((sku) => `${sku.name} ${sku.skuId} ${supplierNameForSku(sku) ?? ''}`).join(' ')}`),
      service,
      status,
      tone,
      type: 'service' as const,
    };
  }) ?? [];

  const allProducts = [...skuCards, ...serviceCards];
  const products = allProducts.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) {
      return false;
    }
    if (normalizedQuery && !item.searchText.includes(normalizedQuery)) {
      return false;
    }
    if (quickFilter === 'recent') {
      return item.recent;
    }
    if (quickFilter === 'needs-count') {
      return item.type === 'sku' && item.units == null;
    }
    if (quickFilter === 'low-stock') {
      return item.type === 'sku' && (item.units ?? Number.POSITIVE_INFINITY) <= 2;
    }
    if (quickFilter === 'in-transit') {
      return item.type === 'sku' && Boolean(item.inbound && item.inbound > 0);
    }
    if (quickFilter === 'blocked-services') {
      return item.type === 'service' && item.status === 'Blocked';
    }
    return true;
  });
  const selectedAction = allProducts.find((item) => item.id === selectedActionId) ?? null;
  const closeProductActions = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next);
  };

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-products-page">
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Products')}
          title={translateUiLiteral(language, 'Offered Selections')}
        />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Loading products…')}
          detail={translateUiLiteral(language, 'Preparing SKU and service lookup for this phone workspace.')}
        />
      </PhonePage>
    );
  }

  return (
    <PhonePage slot="phone-products-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Products')}
        title={translateUiLiteral(language, 'Offered Selections')}
      />
      <div data-slot="phone-products-type-filter">
        <PhoneSegmentedControl
          value={typeFilter}
          options={[
            {
              icon: <EntityLayersIcon aria-hidden="true" className="size-4" data-icon="inline-start" />,
              label: translateUiLiteral(language, 'All'),
              value: 'all',
            },
            {
              icon: <EntitySkuIcon aria-hidden="true" className="size-4" data-icon="inline-start" />,
              label: translateUiLiteral(language, 'SKUs'),
              value: 'sku',
            },
            {
              icon: <EntityServiceIcon aria-hidden="true" className="size-4" data-icon="inline-start" />,
              label: translateUiLiteral(language, 'Services'),
              value: 'service',
            },
          ]}
          onChange={(value: PhoneProductTypeFilter) => updateProductsParam('type', value, 'all')}
        />
      </div>
      <label className="relative block">
        <ActionSearchIcon aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={translateUiLiteral(language, 'Search products')}
          className="h-12 rounded-[0.8rem] border-border/70 bg-card pl-9 shadow-xs focus-visible:ring-ring/70"
          data-slot="phone-products-search"
          placeholder={translateUiLiteral(language, 'Search products')}
          value={query}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            if (event.target.value.trim()) {
              next.set('q', event.target.value);
            } else {
              next.delete('q');
            }
            next.delete('action');
            setSearchParams(next);
          }}
        />
      </label>
      <PhoneChipRow
        slot="phone-products-quick-filter"
        value={quickFilter}
        options={PHONE_PRODUCT_QUICK_FILTERS.map((option) => ({
          icon: option.icon,
          label: translateUiLiteral(language, option.label),
          value: option.value,
        }))}
        onChange={(value) => updateProductsParam('filter', value, 'all')}
      />
      <div className="grid gap-3">
        {products.length > 0 ? products.slice(0, 24).map((item) => {
          const Icon = item.type === 'sku' ? EntitySkuIcon : EntityServiceIcon;
          return (
            <div key={item.id} className={cn(phoneSurfaceClassName, 'grid gap-3 px-3.5 py-3')} data-slot="phone-product-card">
              <Link
                className={cn(phoneFocusClassName, 'grid min-w-0 gap-2 rounded-[0.8rem] text-left')}
                data-slot="phone-list-item"
                to={phoneHrefWithSearch(item.href, searchParams, ['q', 'type', 'filter'])}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[0.8rem] bg-secondary text-secondary-foreground" data-slot="phone-list-item-icon">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block overflow-hidden text-ellipsis text-base font-semibold leading-5 text-foreground">{item.name}</span>
                    <span className="mt-1 block overflow-hidden text-ellipsis text-sm leading-5 text-muted-foreground">{item.type === 'sku' ? `${item.supplierName} · SKU` : item.meta}</span>
                  </span>
                  <span className={cn('max-w-[8.5rem] shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold leading-4', statusPillClassName(item.tone))}>
                    <span className="line-clamp-2">{translateUiLiteral(language, item.status)}</span>
                  </span>
                </span>
                <span className="line-clamp-2 text-sm leading-5 text-muted-foreground">{item.detail}</span>
              </Link>
            </div>
          );
        }) : (
          <PhoneEmptyState>
            {translateUiLiteral(language, allProducts.length === 0 ? 'No products yet. Create your first SKU or service to start tracking stock and sellability.' : 'No products match. Try another search or create a new SKU/service.')}
          </PhoneEmptyState>
        )}
      </div>
      {selectedAction ? (
        <PhoneBottomSheet
          description={translateUiLiteral(language, 'Choose a phone action for this product.')}
          title={selectedAction.name}
          onClose={closeProductActions}
        >
          <div className="grid gap-2" data-slot="phone-product-actions-sheet">
            {selectedAction.type === 'sku' ? (
              <>
                <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(RECORD_UPDATE_STOCK_COUNT_PATH, {
                  breadcrumb: `Opened from Products · Search "${query}"`,
                  returnTo: `/catalog?${searchParams.toString()}`,
                  source: 'products',
                  targetId: selectedAction.sku.skuId,
                  targetType: 'sku',
                })}>
                  {translateUiLiteral(language, 'Products Update')}
                </PhoneActionRow>
                <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`, {
                  breadcrumb: `Opened from Products · Search "${query}"`,
                  returnTo: `/catalog?${searchParams.toString()}`,
                  source: 'products',
                  supplierName: selectedAction.supplierName,
                  targetId: selectedAction.sku.skuId,
                  targetType: 'sku',
                })}>
                  {translateUiLiteral(language, 'Supplier Order')}
                </PhoneActionRow>
                <PhoneActionRow icon={<NavigationListIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo(`/insights/inventory?scope=stock`, `/catalog?${searchParams.toString()}`)}>
                  {translateUiLiteral(language, 'Open Inventory row')}
                </PhoneActionRow>
              </>
            ) : (
              <>
                {selectedAction.bottleneckSku ? (
                  <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={phoneHrefWithSearch(`/catalog/skus/${encodeURIComponent(selectedAction.bottleneckSku.skuId)}`, searchParams, ['q', 'type', 'filter'])}>
                    {translateUiLiteral(language, 'Open bottleneck SKU')}
                  </PhoneActionRow>
                ) : null}
                <PhoneActionRow icon={<EntityTagsIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=service-price`, {
                  breadcrumb: `Opened from Products · Search "${query}"`,
                  returnTo: `/catalog?${searchParams.toString()}`,
                  source: 'products',
                  targetId: selectedAction.service.serviceId,
                  targetType: 'service',
                })}>
                  {translateUiLiteral(language, 'Updated Price')}
                </PhoneActionRow>
                <PhoneActionRow icon={<EntityCustomerIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`, {
                  breadcrumb: `Opened from Products · Search "${query}"`,
                  returnTo: `/catalog?${searchParams.toString()}`,
                  source: 'products',
                  targetId: selectedAction.service.serviceId,
                  targetType: 'service',
                })}>
                  {translateUiLiteral(language, 'Customer Orders Pending')}
                </PhoneActionRow>
                <PhoneActionRow icon={<EntityServiceIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_CUSTOMER_COMPLETED_PATH}?ticketMode=new`, {
                  breadcrumb: `Opened from Products · Search "${query}"`,
                  returnTo: `/catalog?${searchParams.toString()}`,
                  source: 'products',
                  targetId: selectedAction.service.serviceId,
                  targetType: 'service',
                })}>
                  {translateUiLiteral(language, 'Customer Orders Completed')}
                </PhoneActionRow>
                <PhoneActionRow icon={<NavigationListIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo('/insights/explain?section=evidence', `/catalog?${searchParams.toString()}`)}>
                  {translateUiLiteral(language, 'Open Explain evidence')}
                </PhoneActionRow>
              </>
            )}
          </div>
        </PhoneBottomSheet>
      ) : null}
    </PhonePage>
  );
}

function decodePhoneRouteParam(value: string | undefined) {
  if (!value) {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function phoneEvidenceFreshnessLabel(observedAt: string | null, language: ReturnType<typeof usePreferences>['language']) {
  if (!observedAt) {
    return translateUiLiteral(language, 'Unknown');
  }
  const observedTime = new Date(observedAt).getTime();
  if (!Number.isFinite(observedTime)) {
    return translateUiLiteral(language, 'Unknown');
  }
  const ageDays = Math.max(0, Math.floor((Date.now() - observedTime) / 86_400_000));
  return translateUiLiteral(language, ageDays <= 7 ? 'Fresh count' : 'Stale count');
}

function PhoneProductDetailMetric({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-[0.8rem] border border-border/70 bg-background/65 px-3 py-2.5">
      <p className="khmer-safe-eyebrow text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 overflow-hidden text-ellipsis text-sm font-semibold leading-5 text-foreground">{value}</p>
    </div>
  );
}

function PhoneDetailRefresh({
  onRefresh,
}: {
  onRefresh: () => Promise<void>;
}) {
  const { language } = usePreferences();
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshDetail = async () => {
    setRefreshing(true);
    setDetailError(null);
    try {
      await onRefresh();
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : translateUiLiteral(language, 'Unable to refresh product detail.'));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <PhoneSurface className="grid gap-3" slot="phone-detail-refresh">
      <p className="text-sm leading-6 text-muted-foreground">
        {translateUiLiteral(language, 'Refresh detail evidence without leaving this phone page.')}
      </p>
      <Button className="min-h-12 rounded-[0.8rem]" disabled={refreshing} type="button" variant="outline" onClick={() => void refreshDetail()}>
        <StatusInsightIcon data-icon="inline-start" />
        {translateUiLiteral(language, refreshing ? 'Refreshing…' : 'Refresh detail')}
      </Button>
      {detailError ? (
        <div className="grid gap-3 rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm leading-6 text-destructive" data-slot="phone-detail-refresh-error">
          <div>
            <p className="font-semibold">{translateUiLiteral(language, 'Unable to refresh product detail.')}</p>
            <p className="mt-1 text-destructive/85">
              {detailError} {translateUiLiteral(language, 'The catalog summary stays available. Retry or open safety if local data looks unavailable.')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt disabled={refreshing} type="button" variant="outline" onClick={() => void refreshDetail()}>
              {translateUiLiteral(language, 'Retry')}
            </Button>
            <Button asChild className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
              <Link to="/settings">
                {translateUiLiteral(language, 'Open safety')}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </PhoneSurface>
  );
}

function PhoneSkuDetailRoute() {
  const { skuId } = useParams();
  const inventory = useInventory();
  const { currency, language, usdToKhrExchangeRate } = usePreferences();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const decodedSkuId = decodePhoneRouteParam(skuId);
  const sku = catalog?.skus.find((candidate) => candidate.skuId === decodedSkuId && !candidate.archived) ?? null;
  const productsHref = phoneBackHrefFromSearch(searchParams, phoneHrefWithSearch('/catalog', searchParams, ['q', 'type', 'filter']));

  useEffect(() => {
    if (inventory.recordUpdateContext || !catalog) {
      return;
    }
    void inventory.loadSenaRecordUpdateContext().catch(() => undefined);
  }, [catalog, inventory]);

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-product-detail-page">
        <PhonePageHeader eyebrow={translateUiLiteral(language, 'SKU')} title={translateUiLiteral(language, 'Loading product…')} />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Loading product detail…')}
          detail={translateUiLiteral(language, 'Preparing product summary, actions, and evidence for this SKU.')}
        />
      </PhonePage>
    );
  }

  if (!sku) {
    return (
      <PhonePage slot="phone-product-detail-page">
        <PhonePageHeader eyebrow={translateUiLiteral(language, 'Products')} title={translateUiLiteral(language, 'Product not found')} />
        <PhoneEmptyState>
          {translateUiLiteral(language, 'This product is not available in the phone catalog.')}
        </PhoneEmptyState>
        <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to={productsHref}>
          {translateUiLiteral(language, 'Back to products')}
        </PhoneActionRow>
      </PhonePage>
    );
  }

  const detailReturnTo = `${location.pathname}${location.search}`;
  const detailContext = {
    breadcrumb: `Opened from SKU detail · ${sku.name}`,
    returnTo: detailReturnTo,
    source: 'sku-detail' as const,
    supplierName: supplierNameForSku(sku),
    targetId: sku.skuId,
    targetType: 'sku' as const,
  };
  const linkedServices = catalog?.services
    .filter((service) => !service.archived && linkedSkuIdsForService(catalog, service.serviceId).includes(sku.skuId))
    .slice(0, 4) ?? [];
  const latestStock = inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value ?? null;
  const latestOrder = inventory.recordUpdateContext?.latestOrderBySku[sku.skuId]?.value ?? null;
  const latestReceipt = inventory.recordUpdateContext?.latestReceiptBySku[sku.skuId]?.value ?? null;
  const likelyOnHand = latestStock?.unitsInStock ?? null;
  const inboundUnits = latestOrder?.approximateOrderQuantity ?? latestReceipt?.approximateReceiptQuantity ?? null;
  const freshness = phoneEvidenceFreshnessLabel(inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.observedAt ?? null, language);

  return (
    <PhonePage slot="phone-product-detail-page">
      <PhonePageHeader eyebrow={translateUiLiteral(language, 'SKU')} title={sku.name} />
      <PhoneSurface className="grid gap-3" slot="phone-product-detail-summary">
        <div className="grid gap-1" data-slot="phone-sku-heartbeat">
          <p className="text-xl font-semibold leading-tight text-foreground">
            {likelyOnHand == null
              ? translateUiLiteral(language, 'Unknown likely on hand')
              : translateUiLiteral(language, '{count} likely on hand', { count: likelyOnHand })}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, '{supplier} · {freshness} · {inbound}', {
              freshness,
              inbound: inboundUnits && inboundUnits > 0
                ? translateUiLiteral(language, '{count} inbound', { count: inboundUnits })
                : translateUiLiteral(language, 'No inbound receipt recorded'),
              supplier: supplierNameForSku(sku) ?? translateUiLiteral(language, 'Unknown supplier'),
            })}
          </p>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{sku.description}</p>
        <div className="divide-y divide-border/60 rounded-[0.9rem] border border-border/70 bg-background/55" data-slot="phone-detail-metric-strip">
          {[
            [translateUiLiteral(language, 'On hand'), likelyOnHand == null ? translateUiLiteral(language, 'Unknown') : likelyOnHand],
            [translateUiLiteral(language, 'In transit'), inboundUnits && inboundUnits > 0 ? inboundUnits : translateUiLiteral(language, 'None')],
            [translateUiLiteral(language, 'Freshness'), freshness],
            [translateUiLiteral(language, 'Supplier'), supplierNameForSku(sku) ?? translateUiLiteral(language, 'Unknown')],
            [
              translateUiLiteral(language, 'Product price'),
              sku.soldAsProduct && sku.productPrice != null
                ? formatCurrency(sku.productPrice, currency, language, usdToKhrExchangeRate)
                : translateUiLiteral(language, 'Not sold directly'),
            ],
            [translateUiLiteral(language, 'Supplier cost per unit'), formatCurrency(sku.costPerUnit, currency, language, usdToKhrExchangeRate)],
            [
              translateUiLiteral(language, 'Lead time'),
              sku.leadTimeMeanDaysHint == null
                ? translateUiLiteral(language, 'Unknown')
                : translateUiLiteral(language, '{count} days', { count: sku.leadTimeMeanDaysHint }),
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
              <span className="khmer-safe-label min-w-0 truncate text-right text-sm font-semibold text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </PhoneSurface>
      <PhoneSection title={translateUiLiteral(language, 'Linked services')}>
        <div className="grid gap-2" data-slot="phone-sku-services-section">
          {linkedServices.length > 0 ? linkedServices.map((service) => (
            <PhoneListItem
              key={service.serviceId}
              href={phoneHrefWithSearch(`/catalog/services/${encodeURIComponent(service.serviceId)}`, searchParams, ['q', 'type', 'filter'])}
              icon={<EntityServiceIcon aria-hidden="true" className="size-5" />}
              label={service.name}
              meta={formatCurrency(service.price, currency, language, usdToKhrExchangeRate)}
            />
          )) : (
            <PhoneEmptyState>
              {translateUiLiteral(language, 'No linked services.')}
            </PhoneEmptyState>
          )}
        </div>
      </PhoneSection>
      <PhoneSection title={translateUiLiteral(language, 'Actions')}>
        <div className="grid gap-2" data-slot="phone-product-actions">
          <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to={productsHref}>
            {translateUiLiteral(language, 'Back to products')}
          </PhoneActionRow>
          <PhoneCaptureActionRow action="stock" context={detailContext} icon={<ActionAddBadgeIcon data-icon="inline-start" />} targetId={sku.skuId} targetType="sku">
            {translateUiLiteral(language, 'Products Update')}
          </PhoneCaptureActionRow>
          <PhoneCaptureActionRow
            action="supplier-order"
            context={{
              ...detailContext,
              quantitySuggestion: null,
            }}
            icon={<ActionCreatePackageIcon data-icon="inline-start" />}
            targetId={sku.skuId}
            targetType="sku"
          >
            {translateUiLiteral(language, 'Supplier Order')}
          </PhoneCaptureActionRow>
          <PhoneCaptureActionRow action="customer-order" context={detailContext} icon={<EntityCustomerIcon data-icon="inline-start" />} targetId={sku.skuId} targetType="sku">
            {translateUiLiteral(language, 'Customer Order')}
          </PhoneCaptureActionRow>
          <PhoneCaptureActionRow action="immediate-sale" context={detailContext} icon={<EntityRevenueIcon data-icon="inline-start" />} targetId={sku.skuId} targetType="sku">
            {translateUiLiteral(language, 'Immediate Sale')}
          </PhoneCaptureActionRow>
          {sku.soldAsProduct ? (
            <PhoneCaptureActionRow action="sku-price" context={detailContext} icon={<EntityTagsIcon data-icon="inline-start" />} targetId={sku.skuId} targetType="sku">
              {translateUiLiteral(language, 'Updated price')}
            </PhoneCaptureActionRow>
          ) : null}
        </div>
      </PhoneSection>
    </PhonePage>
  );
}

function PhoneServiceDetailRoute() {
  const { serviceId } = useParams();
  const inventory = useInventory();
  const { currency, language, usdToKhrExchangeRate } = usePreferences();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [confirmingBottleneckSku, setConfirmingBottleneckSku] = useState(false);
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const decodedServiceId = decodePhoneRouteParam(serviceId);
  const service = catalog?.services.find((candidate) => candidate.serviceId === decodedServiceId && !candidate.archived) ?? null;
  const linkedSkus = service ? linkedSkusForService(catalog, service.serviceId).filter((sku) => !sku.archived) : [];
  const productsHref = phoneBackHrefFromSearch(searchParams, phoneHrefWithSearch('/catalog', searchParams, ['q', 'type', 'filter']));

  useEffect(() => {
    if (inventory.recordUpdateContext || !catalog) {
      return;
    }
    void inventory.loadSenaRecordUpdateContext().catch(() => undefined);
  }, [catalog, inventory]);

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-product-detail-page">
        <PhonePageHeader eyebrow={translateUiLiteral(language, 'Service')} title={translateUiLiteral(language, 'Loading product…')} />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Loading service detail…')}
          detail={translateUiLiteral(language, 'Preparing service summary, linked SKUs, and capture actions.')}
        />
      </PhonePage>
    );
  }

  if (!service) {
    return (
      <PhonePage slot="phone-product-detail-page">
        <PhonePageHeader eyebrow={translateUiLiteral(language, 'Products')} title={translateUiLiteral(language, 'Product not found')} />
        <PhoneEmptyState>
          {translateUiLiteral(language, 'This product is not available in the phone catalog.')}
        </PhoneEmptyState>
        <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to={productsHref}>
          {translateUiLiteral(language, 'Back to products')}
        </PhoneActionRow>
      </PhonePage>
    );
  }

  const detailReturnTo = `${location.pathname}${location.search}`;
  const bottleneckSku = linkedSkus.find((sku) => (inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value.unitsInStock ?? 1) <= 2)
    ?? linkedSkus[0]
    ?? null;
  const bottleneckUnits = bottleneckSku ? inventory.recordUpdateContext?.latestStockBySku[bottleneckSku.skuId]?.value.unitsInStock ?? null : null;
  const sellableNow = linkedSkus.length === 0
    ? null
    : Math.max(0, Math.min(...linkedSkus.map((sku) => inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value.unitsInStock ?? 0)));
  const serviceStatus = linkedSkus.length === 0
    ? translateUiLiteral(language, 'Sellability unknown')
    : sellableNow != null && sellableNow > 0
      ? translateUiLiteral(language, '{count} service units likely sellable today', { count: sellableNow })
      : translateUiLiteral(language, 'Blocked until linked stock is refreshed');
  const nextInboundSku = linkedSkus.find((sku) => (inventory.recordUpdateContext?.latestOrderBySku[sku.skuId]?.value.approximateOrderQuantity ?? 0) > 0) ?? null;
  const serviceContext = {
    breadcrumb: `Opened from Service detail · ${service.name}`,
    returnTo: detailReturnTo,
    source: 'service-detail' as const,
    targetId: service.serviceId,
    targetType: 'service' as const,
  };
  const bottleneckContext = bottleneckSku
    ? {
        breadcrumb: `Opened from Service detail · ${service.name}`,
        returnTo: detailReturnTo,
        source: 'service-detail' as const,
        supplierName: supplierNameForSku(bottleneckSku),
        targetId: bottleneckSku.skuId,
        targetType: 'sku' as const,
      }
    : null;
  const bottleneckSkuHref = bottleneckSku
    ? phoneHrefWithSearch(`/catalog/skus/${encodeURIComponent(bottleneckSku.skuId)}`, searchParams, ['q', 'type', 'filter'])
    : null;

  return (
    <PhonePage slot="phone-product-detail-page">
      <PhonePageHeader eyebrow={translateUiLiteral(language, 'Service')} title={service.name} />
      <PhoneSurface className="grid gap-3" slot="phone-product-detail-summary">
        <div className="grid gap-1" data-slot="phone-service-heartbeat">
          <p className="text-xl font-semibold leading-tight text-foreground">{serviceStatus}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {bottleneckSku
              ? translateUiLiteral(language, 'Bottleneck: {value}', { value: bottleneckSku.name })
              : translateUiLiteral(language, 'No linked SKU bottleneck is available.')} {nextInboundSku ? translateUiLiteral(language, 'Inbound work may restore capacity.') : translateUiLiteral(language, 'No inbound recovery is recorded.')}
          </p>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">{service.description}</p>
        <div className="divide-y divide-border/60 rounded-[0.9rem] border border-border/70 bg-background/55" data-slot="phone-detail-metric-strip">
          {[
            [translateUiLiteral(language, 'Sellable now'), sellableNow == null ? translateUiLiteral(language, 'Unknown') : sellableNow],
            [translateUiLiteral(language, 'Bottleneck'), bottleneckSku?.name ?? translateUiLiteral(language, 'None')],
            [translateUiLiteral(language, 'Next disruption'), bottleneckUnits == null ? translateUiLiteral(language, 'Unknown') : bottleneckUnits <= 2 ? translateUiLiteral(language, 'Soon') : translateUiLiteral(language, 'Not near')],
            [translateUiLiteral(language, 'Product price'), formatCurrency(service.price, currency, language, usdToKhrExchangeRate)],
            [translateUiLiteral(language, 'Linked SKUs'), linkedSkus.length],
          ].map(([label, value]) => (
            <div key={String(label)} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
              <span className="khmer-safe-label min-w-0 truncate text-right text-sm font-semibold text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </PhoneSurface>
      <PhoneSection title={translateUiLiteral(language, 'Linked SKUs')}>
        <div className="grid gap-2">
          {linkedSkus.length > 0 ? linkedSkus.slice(0, 6).map((sku) => (
            <PhoneListItem
              key={sku.skuId}
              href={phoneHrefWithSearch(`/catalog/skus/${encodeURIComponent(sku.skuId)}`, searchParams, ['q', 'type', 'filter'])}
              icon={<EntitySkuIcon aria-hidden="true" className="size-5" />}
              label={sku.name}
              meta={supplierNameForSku(sku) ?? translateUiLiteral(language, 'SKU')}
            />
          )) : (
            <PhoneEmptyState>
              {translateUiLiteral(language, 'No linked SKUs.')}
            </PhoneEmptyState>
          )}
        </div>
      </PhoneSection>
      <PhoneSection title={translateUiLiteral(language, 'Actions')}>
        <div className="grid gap-2" data-slot="phone-product-actions">
          <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to={productsHref}>
            {translateUiLiteral(language, 'Back to products')}
          </PhoneActionRow>
          {bottleneckSku && bottleneckSkuHref ? (
            <PhoneActionRow icon={<ActionOpenExternalIcon data-icon="inline-start" />} onClick={() => setConfirmingBottleneckSku(true)}>
              {translateUiLiteral(language, 'Open bottleneck SKU')}
            </PhoneActionRow>
          ) : null}
          <PhoneCaptureActionRow action="service-price" context={serviceContext} icon={<EntityTagsIcon data-icon="inline-start" />} targetId={service.serviceId} targetType="service">
            {translateUiLiteral(language, 'Updated price')}
          </PhoneCaptureActionRow>
          <PhoneCaptureActionRow action="customer-order" context={serviceContext} icon={<EntityCustomerIcon data-icon="inline-start" />} targetId={service.serviceId} targetType="service">
            {translateUiLiteral(language, 'Customer Order')}
          </PhoneCaptureActionRow>
          <PhoneCaptureActionRow action="immediate-sale" context={serviceContext} icon={<EntityRevenueIcon data-icon="inline-start" />} targetId={service.serviceId} targetType="service">
            {translateUiLiteral(language, 'Immediate Sale')}
          </PhoneCaptureActionRow>
        </div>
      </PhoneSection>
      {bottleneckSku && bottleneckSkuHref ? (
        <ConfirmActionDialog
          cancelLabel={translateUiLiteral(language, 'Cancel')}
          confirmIcon={<ActionOpenExternalIcon />}
          confirmLabel={translateUiLiteral(language, 'Open bottleneck SKU')}
          confirmVariant="default"
          description={translateUiLiteral(language, 'This will leave the service detail page and open the linked bottleneck SKU.')}
          open={confirmingBottleneckSku}
          title={translateUiLiteral(language, 'Open bottleneck SKU?')}
          onCancel={() => setConfirmingBottleneckSku(false)}
          onConfirm={() => {
            setConfirmingBottleneckSku(false);
            navigate(bottleneckSkuHref);
          }}
        />
      ) : null}
    </PhonePage>
  );
}

function PhoneSafetyRoute({
  mode,
  storage,
  onExport,
  onImport,
  onReset,
}: EmbeddedPhoneAppProps) {
  const {
    currency,
    language,
    savePreferences,
    setCurrency,
    setLanguage,
    setUsdToKhrExchangeRate,
    usdToKhrExchangeRate,
  } = usePreferences();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const preferencesRequestRef = useRef(0);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [exchangeRateDraft, setExchangeRateDraft] = useState(() => String(usdToKhrExchangeRate));
  const [preferencesStatus, setPreferencesStatus] = useState<string | null>(null);
  const ready = storage.status === 'ready';
  const resetLabel = mode === 'demo' ? 'Reset demo' : 'Reset workspace';
  const exchangeRateValue = parsePhoneExchangeRateDraft(exchangeRateDraft);
  const exchangeRateError =
    exchangeRateDraft.trim().length === 0
      ? translateUiLiteral(language, 'Exchange rate is required.')
      : exchangeRateValue == null
        ? translateUiLiteral(language, 'Enter a number greater than zero.')
        : null;

  useEffect(() => {
    setExchangeRateDraft(String(usdToKhrExchangeRate));
  }, [usdToKhrExchangeRate]);

  async function applyPhonePreferences(next: Partial<{
    currency: 'USD' | 'KHR';
    language: 'en' | 'km';
    usdToKhrExchangeRate: number;
  }>) {
    const requestId = preferencesRequestRef.current + 1;
    preferencesRequestRef.current = requestId;
    const nextLanguage = next.language ?? language;
    const nextCurrency = next.currency ?? currency;
    const nextExchangeRate = next.usdToKhrExchangeRate ?? usdToKhrExchangeRate;
    setPreferencesStatus(null);
    try {
      await savePreferences({
        language: nextLanguage,
        currency: nextCurrency,
        usdToKhrExchangeRate: nextExchangeRate,
      });
      if (requestId !== preferencesRequestRef.current) {
        return;
      }
      setLanguage(nextLanguage);
      setCurrency(nextCurrency);
      setUsdToKhrExchangeRate(nextExchangeRate);
      setPreferencesStatus(translateUiLiteral(nextLanguage, 'Preferences saved.'));
    } catch {
      if (requestId === preferencesRequestRef.current) {
        setPreferencesStatus(translateUiLiteral(language, 'Unable to save preferences.'));
      }
    }
  }

  return (
    <PhonePage slot="phone-more-page">
      {confirmingReset ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/30 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]" data-slot="phone-reset-confirmation">
          <PhoneSurface className="w-full max-w-md justify-self-center border-destructive/30 bg-background">
            <div className="grid gap-3">
              <div className="grid gap-1">
                <p className="text-sm font-semibold text-destructive">
                  {translateUiLiteral(language, resetLabel)}
                </p>
                <h2 className="text-lg font-semibold leading-tight text-foreground">
                  {translateUiLiteral(language, mode === 'demo' ? 'Reset this demo workspace?' : 'Reset this browser workspace?')}
                </h2>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(
                  language,
                  mode === 'demo'
                    ? 'This removes the current demo changes and restores sample data. Export first if you want to keep this demo state. This action cannot be undone.'
                    : 'This removes local browser workspace data from this device. Export a backup first if you need this data. This action cannot be undone.',
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button data-design-icon-exempt type="button" variant="outline" onClick={() => setConfirmingReset(false)}>
                  {translateUiLiteral(language, 'Cancel')}
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-design-icon-exempt
                  type="button"
                  onClick={() => {
                    setConfirmingReset(false);
                    onReset({ skipBrowserConfirm: true });
                  }}
                >
                  {translateUiLiteral(language, resetLabel)}
                </Button>
              </div>
            </div>
          </PhoneSurface>
        </div>
      ) : null}
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Safety')}
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
        <PhoneStorageFeedback mode={mode} storage={storage} />
      </PhoneSurface>
      <div className="grid gap-4" data-slot="phone-settings-index">
        <PhoneSection icon={<NavigationSettingsIcon aria-hidden="true" className="size-4" />} title={translateUiLiteral(language, 'Preferences')}>
          <PhoneSurface className="grid gap-4" slot="phone-settings-preferences">
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Language')}</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['en', 'abc', 'English'],
                  ['km', 'កខគ', 'Khmer'],
                ] as const).map(([value, prefix, label]) => (
                  <Button
                    key={value}
                    className="min-h-11 justify-start gap-2 rounded-[0.8rem]"
                    data-design-icon-exempt
                    type="button"
                    variant={language === value ? 'default' : 'outline'}
                    onClick={() => {
                      void applyPhonePreferences({ language: value });
                    }}
                  >
                    <span className={cn(
                      'font-mono text-xs font-semibold uppercase tracking-[0.18em]',
                      language === value ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}>
                      {prefix}
                    </span>
                    <span className="min-w-0 truncate">{translateUiLiteral(language, label)}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Currency')}</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['USD', '$', 'US dollar'],
                  ['KHR', '៛', 'Cambodian riel'],
                ] as const).map(([value, prefix, label]) => (
                  <Button
                    key={value}
                    className="min-h-11 justify-start gap-2 rounded-[0.8rem]"
                    data-design-icon-exempt
                    type="button"
                    variant={currency === value ? 'default' : 'outline'}
                    onClick={() => {
                      void applyPhonePreferences({ currency: value });
                    }}
                  >
                    <span className={cn(
                      'font-mono text-xs font-semibold uppercase tracking-[0.18em]',
                      currency === value ? 'text-primary-foreground/80' : 'text-muted-foreground',
                    )}>
                      {prefix}
                    </span>
                    <span className="min-w-0 truncate">{translateUiLiteral(language, label)}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <label className="grid gap-1.5">
                <span className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'USD to KHR exchange rate')}</span>
                <Input
                  inputMode="decimal"
                  min="0"
                  step="1"
                  type="text"
                  value={exchangeRateDraft}
                  onChange={(event) => {
                    setPreferencesStatus(null);
                    setExchangeRateDraft(event.currentTarget.value);
                  }}
                />
              </label>
              {exchangeRateError ? <p className="text-sm text-destructive">{exchangeRateError}</p> : null}
              {preferencesStatus ? <p className="text-sm text-muted-foreground">{preferencesStatus}</p> : null}
              <Button
                className="min-h-11 rounded-[0.8rem]"
                disabled={Boolean(exchangeRateError)}
                type="button"
                onClick={() => {
                  if (!exchangeRateError && exchangeRateValue != null) {
                    void applyPhonePreferences({ usdToKhrExchangeRate: exchangeRateValue });
                  }
                }}
              >
                <ActionSaveIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Save preferences')}
              </Button>
            </div>
          </PhoneSurface>
        </PhoneSection>
        <PhoneSection icon={<NavigationHistoryIcon aria-hidden="true" className="size-4" />} title={translateUiLiteral(language, 'History')}>
          <PhoneActionRow icon={<NavigationListIcon data-icon="inline-start" />} to="/settings/history">
            {translateUiLiteral(language, 'Update history')}
          </PhoneActionRow>
        </PhoneSection>
        <PhoneSection icon={<ActionOpenFolderIcon aria-hidden="true" className="size-4" />} title={translateUiLiteral(language, 'Local data')}>
          <PhoneSurface className="grid gap-2">
            <p className="text-sm leading-6 text-muted-foreground">
              {translateUiLiteral(language, mode === 'demo'
                ? 'Demo data is stored in this browser profile and can be reset back to sample data.'
                : 'Browser workspace data stays in this browser profile. Export backups before clearing site data or changing profiles.')}
            </p>
          </PhoneSurface>
        </PhoneSection>
        <PhoneSection icon={<ActionExplosionIcon aria-hidden="true" className="size-4" />} title={translateUiLiteral(language, 'Danger zone')}>
          <PhoneSurface className="grid gap-3 border-destructive/25">
            <p className="text-sm leading-6 text-muted-foreground">
              {translateUiLiteral(language, 'Reset is separated from backup controls because it removes local workspace state. Export first if you need this data.')}
            </p>
            <PhoneActionRow className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" icon={<ActionResetIcon data-icon="inline-start" />} onClick={() => setConfirmingReset(true)}>
              {translateUiLiteral(language, resetLabel)}
            </PhoneActionRow>
          </PhoneSurface>
        </PhoneSection>
      </div>
    </PhonePage>
  );
}

function PhoneHelpRoute() {
  const { language } = usePreferences();

  return (
    <PhonePage slot="phone-help-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Settings')}
        title={translateUiLiteral(language, 'Settings and help')}
      />
      <PhoneSurface className="grid gap-3" slot="phone-help-summary">
        <p className="text-sm leading-6 text-muted-foreground">
          {translateUiLiteral(language, 'Phone mode is for live floor work: review queue, capture evidence, find products, and use Insights for compact checks. Use a wider view for advanced analysis and setup.')}
        </p>
        <PhoneActionRow icon={<ActionExportIcon data-icon="inline-start" />} to="/settings">
          {translateUiLiteral(language, 'Workspace safety')}
        </PhoneActionRow>
        <PhoneActionRow icon={<NavigationTaskListIcon data-icon="inline-start" />} to={buildRememberedInboxHref()}>
          {translateUiLiteral(language, 'Open queue')}
        </PhoneActionRow>
      </PhoneSurface>
    </PhonePage>
  );
}

function PhoneInsightsRoute() {
  const { language } = usePreferences();
  const inventory = useInventory();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisRefreshing, setAnalysisRefreshing] = useState(false);
  const [showInventoryFilters, setShowInventoryFilters] = useState(false);
  const [showMoneyFilters, setShowMoneyFilters] = useState(false);
  const [showExplainFilters, setShowExplainFilters] = useState(false);
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const activeSkus = catalog?.skus.filter((sku) => !sku.archived) ?? [];
  const activeServices = catalog?.services.filter((service) => !service.archived) ?? [];
  const hasCatalogItems = activeSkus.length + activeServices.length > 0;
  const recentObservationCount = inventory.observations?.length ?? inventory.latestRun?.observationCount ?? 0;
  const latestObservationAt = latestObservationAtForRecords(inventory.observations ?? []);
  const lens = location.pathname.startsWith('/insights/money')
    ? 'money'
    : location.pathname.startsWith('/insights/explain')
      ? 'explain'
      : location.pathname.startsWith('/insights/inventory')
        ? 'inventory'
        : null;
  const insightReturnTo = `${location.pathname}${location.search}`;
  const inventoryScope = normalizePhoneInventoryScope(searchParams.get('scope'));
  const inventoryRange = normalizePhoneInventoryRange(searchParams.get('range'));
  const inventoryView = normalizePhoneInventoryView(searchParams.get('view'));
  const inventoryHorizon = normalizePhoneInventoryHorizon(searchParams.get('horizon'));
  const inventoryEntity = normalizePhoneInventoryEntity(searchParams.get('entity'));
  const inventorySupplier = searchParams.get('supplier') ?? 'all';
  const selectedInventoryRowId = searchParams.get('row');
  const moneyScope = normalizePhoneMoneyScope(searchParams.get('scope'));
  const moneyCompare = normalizePhoneMoneyCompare(searchParams.get('compare'));
  const moneyEntity = normalizePhoneMoneyEntity(searchParams.get('entity'));
  const moneyRange = normalizePhoneMoneyRange(searchParams.get('range'));
  const moneySupplier = searchParams.get('supplier') ?? 'all';
  const explainSection = normalizePhoneExplainSection(searchParams.get('section'));
  const explainTimeframe = normalizePhoneExplainTimeframe(searchParams.get('timeframe'));
  const explainEntity = normalizePhoneExplainEntity(searchParams.get('entity'));
  const explainSupplier = searchParams.get('supplier') ?? 'all';
  const inventorySkuRows = activeSkus.map((sku) => {
    const latestStock = inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value ?? null;
    const latestOrder = inventory.recordUpdateContext?.latestOrderBySku[sku.skuId]?.value ?? null;
    const latestReceipt = inventory.recordUpdateContext?.latestReceiptBySku[sku.skuId]?.value ?? null;
    const units = latestStock?.unitsInStock ?? null;
    const inbound = latestOrder?.approximateOrderQuantity ?? latestReceipt?.approximateReceiptQuantity ?? 0;
    const status = units == null ? 'Unknown' : units <= 0 ? 'Out' : units <= 2 ? 'Low' : inbound > 0 ? 'In transit' : 'OK';
    const tone: Parameters<typeof statusPillClassName>[0] = status === 'Out' || status === 'Low' ? 'danger' : status === 'Unknown' ? 'neutral' : inbound > 0 ? 'info' : 'success';
    return {
      cover: units == null ? translateUiLiteral(language, 'Cover unknown') : units <= 2 ? translateUiLiteral(language, 'Short cover') : translateUiLiteral(language, 'Covered'),
      detail: [
        units == null ? translateUiLiteral(language, 'On hand unknown') : translateUiLiteral(language, '{count} on hand', { count: units }),
        inbound > 0 ? translateUiLiteral(language, '{count} inbound', { count: inbound }) : translateUiLiteral(language, 'No inbound'),
        phoneEvidenceFreshnessLabel(inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.observedAt ?? null, language),
      ].join(' · '),
      flow: translateUiLiteral(language, 'Units in {inbound} · units out {observations}', { inbound, observations: recentObservationCount }),
      freshness: phoneEvidenceFreshnessLabel(inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.observedAt ?? null, language),
      id: `sku:${sku.skuId}`,
      inbound,
      label: sku.name,
      meta: supplierNameForSku(sku) ?? translateUiLiteral(language, 'SKU'),
      reason: units == null
        ? translateUiLiteral(language, 'Needs a stock count before projection is reliable.')
        : units <= 2
          ? translateUiLiteral(language, 'Low cover is pulling this row into focus.')
          : inbound > 0
            ? translateUiLiteral(language, 'Inbound stock is changing the near-term forecast.')
            : translateUiLiteral(language, 'Stock appears covered in the selected range.'),
      sku,
      status,
      supplier: supplierNameForSku(sku) ?? translateUiLiteral(language, 'No supplier'),
      tone,
      type: 'sku' as const,
      units,
    };
  });
  const inventoryServiceRows = activeServices.map((service) => {
    const linkedSkus = linkedSkusForService(catalog, service.serviceId).filter((sku) => !sku.archived);
    const bottleneckSku = linkedSkus.find((sku) => (inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value.unitsInStock ?? 0) <= 2)
      ?? linkedSkus[0]
      ?? null;
    const sellable = linkedSkus.length === 0
      ? null
      : Math.max(0, Math.min(...linkedSkus.map((sku) => inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value.unitsInStock ?? 0)));
    const supplierNames = Array.from(new Set(linkedSkus.map((sku) => supplierNameForSku(sku)).filter((name): name is string => Boolean(name))));
    const status = linkedSkus.length === 0 ? 'Unknown service' : sellable != null && sellable > 0 ? 'Fragile service' : 'Blocked service';
    const tone: Parameters<typeof statusPillClassName>[0] = status === 'Blocked service' ? 'danger' : status === 'Fragile service' ? 'warning' : 'neutral';
    return {
      bottleneckSku,
      cover: sellable == null ? translateUiLiteral(language, 'Coverage unknown') : sellable > 0 ? translateUiLiteral(language, 'Sellable capacity') : translateUiLiteral(language, 'Blocked capacity'),
      detail: [
        sellable == null ? translateUiLiteral(language, 'Sellability unknown') : translateUiLiteral(language, '{count} sellable', { count: sellable }),
        bottleneckSku ? translateUiLiteral(language, 'bottleneck {value}', { value: bottleneckSku.name }) : translateUiLiteral(language, 'no linked SKU'),
      ].join(' · '),
      flow: translateUiLiteral(language, '{count} linked SKU signals in range', { count: linkedSkus.length }),
      freshness: bottleneckSku ? phoneEvidenceFreshnessLabel(inventory.recordUpdateContext?.latestStockBySku[bottleneckSku.skuId]?.observedAt ?? null, language) : translateUiLiteral(language, 'No linked evidence'),
      id: `service:${service.serviceId}`,
      label: service.name,
      meta: translateUiLiteral(language, '{count} linked SKUs', { count: linkedSkus.length }),
      reason: linkedSkus.length === 0
        ? translateUiLiteral(language, 'Link a SKU before service health can be calculated.')
        : sellable != null && sellable > 0
          ? translateUiLiteral(language, 'Linked SKU stock leaves some sellable capacity.')
          : translateUiLiteral(language, 'The bottleneck SKU blocks this service.'),
      service,
      supplier: supplierNames[0] ?? translateUiLiteral(language, 'No supplier'),
      suppliers: supplierNames,
      status,
      tone,
      type: 'service' as const,
    };
  });
  const allInventoryRows = [...inventorySkuRows, ...inventoryServiceRows].filter((row) => {
    if (inventoryEntity !== 'all' && row.type !== inventoryEntity) {
      return false;
    }
    if (inventorySupplier !== 'all') {
      if (row.type === 'sku') {
        return row.supplier === inventorySupplier;
      }
      return row.suppliers.includes(inventorySupplier);
    }
    return true;
  });
  const inventoryRows = inventoryScope === 'all'
    ? allInventoryRows
    : allInventoryRows.filter((row) => row.status !== 'OK' && row.status !== 'Unknown service').slice(0, 6);
  const shownInventoryRows = inventoryRows.length > 0 ? inventoryRows : (inventoryScope === 'all' ? allInventoryRows : []);
  const selectedInventoryRow = [...inventorySkuRows, ...inventoryServiceRows].find((row) => row.id === selectedInventoryRowId) ?? null;
  const inventorySuppliers = Array.from(new Set(inventorySkuRows.map((row) => row.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const shownMoneyStatements = moneyScope === 'contributors' ? [] : ['Money in', 'Money tied up', 'Money leaking'];
  const moneySkuRows = activeSkus.map((sku, index) => {
    const latestStock = inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value ?? null;
    const units = latestStock?.unitsInStock ?? 0;
    const price = sku.productPrice ?? 0;
    const cost = sku.costPerUnit ?? 0;
    const netSales = Math.max(0, price * Math.max(1, Math.min(3, units)));
    const grossProfit = Math.max(0, (price - cost) * Math.max(1, Math.min(3, units)));
    const capitalTied = Math.max(0, cost * units);
    const supplier = supplierNameForSku(sku) ?? translateUiLiteral(language, 'No supplier');
    return {
      capitalTied,
      detail: translateUiLiteral(language, 'Gross profit {profit} · Net sales {sales}', { profit: formatPhoneMoney(grossProfit), sales: formatPhoneMoney(netSales) }),
      href: phoneHrefWithReturnTo(`/catalog/skus/${encodeURIComponent(sku.skuId)}`, insightReturnTo),
      id: `sku:${sku.skuId}`,
      label: sku.name,
      marginLeak: cost > price * 0.75 ? Math.max(0, cost - price * 0.75) : 0,
      meta: supplier,
      netSales,
      grossProfit,
      reason: units <= 2 ? translateUiLiteral(language, 'Low cover makes this a capital-risk row.') : translateUiLiteral(language, 'Stock value and margin are visible from catalog economics.'),
      slowStock: index % 3 === 0 ? capitalTied * 0.35 : 0,
      status: grossProfit > capitalTied * 0.2 ? 'Efficient earner' : capitalTied > grossProfit * 3 ? 'Capital trap' : 'Margin watch',
      supplier,
      tone: grossProfit > capitalTied * 0.2 ? 'success' as const : capitalTied > grossProfit * 3 ? 'warning' as const : 'info' as const,
      turnQuality: grossProfit > capitalTied * 0.2 ? 'Efficient' : capitalTied > grossProfit * 3 ? 'Slow' : 'Watch',
      type: 'sku' as const,
    };
  });
  const moneyServiceRows = activeServices.map((service) => {
    const linkedSkus = linkedSkusForService(catalog, service.serviceId).filter((sku) => !sku.archived);
    const linkedCost = linkedSkus.reduce((sum, sku) => sum + (sku.costPerUnit ?? 0), 0);
    const price = service.price ?? 0;
    const netSales = Math.max(0, price * Math.max(1, linkedSkus.length));
    const grossProfit = Math.max(0, netSales - linkedCost);
    const capitalTied = linkedSkus.reduce((sum, sku) => {
      const units = inventory.recordUpdateContext?.latestStockBySku[sku.skuId]?.value.unitsInStock ?? 0;
      return sum + (sku.costPerUnit ?? 0) * units;
    }, 0);
    const supplierNames = Array.from(new Set(linkedSkus.map((sku) => supplierNameForSku(sku)).filter((name): name is string => Boolean(name))));
    return {
      capitalTied,
      detail: translateUiLiteral(language, 'Gross profit {profit} · Net sales {sales}', { profit: formatPhoneMoney(grossProfit), sales: formatPhoneMoney(netSales) }),
      href: phoneHrefWithReturnTo(`/catalog/services/${encodeURIComponent(service.serviceId)}`, insightReturnTo),
      id: `service:${service.serviceId}`,
      label: service.name,
      marginLeak: linkedCost > price * 0.7 ? Math.max(0, linkedCost - price * 0.7) : 0,
      meta: translateUiLiteral(language, '{count} linked SKUs', { count: linkedSkus.length }),
      netSales,
      grossProfit,
      reason: linkedSkus.length === 0 ? translateUiLiteral(language, 'No linked SKU cost coverage yet.') : translateUiLiteral(language, 'Service margin is estimated from linked SKU costs.'),
      slowStock: capitalTied > grossProfit * 2 ? capitalTied * 0.25 : 0,
      status: grossProfit > capitalTied * 0.2 ? 'Efficient earner' : capitalTied > grossProfit * 3 ? 'Capital trap' : 'Margin watch',
      supplier: supplierNames[0] ?? translateUiLiteral(language, 'No supplier'),
      suppliers: supplierNames,
      tone: grossProfit > capitalTied * 0.2 ? 'success' as const : capitalTied > grossProfit * 3 ? 'warning' as const : 'info' as const,
      turnQuality: grossProfit > capitalTied * 0.2 ? 'Efficient' : capitalTied > grossProfit * 3 ? 'Slow' : 'Watch',
      type: 'service' as const,
    };
  });
  const moneyRows = [...moneyServiceRows, ...moneySkuRows]
    .filter((row) => moneyEntity === 'all' || row.type === moneyEntity)
    .filter((row) => {
      if (moneySupplier === 'all') {
        return true;
      }
      return row.type === 'sku' ? row.supplier === moneySupplier : row.suppliers.includes(moneySupplier);
    })
    .sort((a, b) => (b.grossProfit + b.capitalTied) - (a.grossProfit + a.capitalTied));
  const moneySuppliers = Array.from(new Set(moneySkuRows.map((row) => row.supplier).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const moneyTotals = moneyRows.reduce((totals, row) => ({
    capitalTied: totals.capitalTied + row.capitalTied,
    grossProfit: totals.grossProfit + row.grossProfit,
    leakage: totals.leakage + row.marginLeak,
    netSales: totals.netSales + row.netSales,
    slowStock: totals.slowStock + row.slowStock,
  }), { capitalTied: 0, grossProfit: 0, leakage: 0, netSales: 0, slowStock: 0 });
  const shownMoneyContributors = moneyScope === 'statement'
    ? []
    : moneyRows.slice(0, moneyScope === 'all' ? 4 : 8);
  const explainSkuRows = inventorySkuRows.map((row) => ({
    actionHref: phoneCaptureHrefWithContext(RECORD_UPDATE_STOCK_COUNT_PATH, {
      breadcrumb: `Opened from Explain · ${row.label}`,
      returnTo: insightReturnTo,
      source: 'explain',
      targetId: row.sku.skuId,
      targetType: 'sku',
    }),
    detailHref: phoneHrefWithReturnTo(`/catalog/skus/${encodeURIComponent(row.sku.skuId)}`, insightReturnTo),
    entity: row.label,
    evidence: row.freshness,
    explanation: row.status === 'OK'
      ? translateUiLiteral(language, 'Stock support looks stable in the selected evidence window.')
      : translateUiLiteral(language, 'Recent stock evidence is weak or structurally pressured.'),
    gap: row.freshness,
    id: row.id,
    meta: row.meta,
    signal: row.status === 'OK' ? 'Coverage signal' : 'Stockout signal',
    supplier: row.supplier,
    tone: row.tone,
    type: 'sku' as const,
  }));
  const explainServiceRows = inventoryServiceRows.map((row) => ({
    actionHref: row.bottleneckSku
      ? phoneHrefWithReturnTo(`/catalog/skus/${encodeURIComponent(row.bottleneckSku.skuId)}`, insightReturnTo)
      : phoneHrefWithReturnTo(`/catalog/services/${encodeURIComponent(row.service.serviceId)}`, insightReturnTo),
    detailHref: phoneHrefWithReturnTo(`/catalog/services/${encodeURIComponent(row.service.serviceId)}`, insightReturnTo),
    entity: row.label,
    evidence: row.freshness,
    explanation: row.bottleneckSku
      ? translateUiLiteral(language, 'Sellability depends on bottleneck {value}.', { value: row.bottleneckSku.name })
      : translateUiLiteral(language, 'Service has no linked SKU evidence.'),
    gap: row.reason,
    id: row.id,
    meta: row.meta,
    signal: row.status === 'Blocked service' ? 'Blocked service signal' : 'Sellability signal',
    supplier: row.supplier,
    suppliers: row.suppliers,
    tone: row.tone,
    type: 'service' as const,
  }));
  const explainRows = [...explainSkuRows, ...explainServiceRows]
    .filter((row) => explainEntity === 'all' || row.type === explainEntity)
    .filter((row) => {
      if (explainSupplier === 'all') {
        return true;
      }
      return row.type === 'sku' ? row.supplier === explainSupplier : row.suppliers.includes(explainSupplier);
    });
  const explainSuppliers = inventorySuppliers;
  const explainTimeline = (inventory.observations ?? []).slice(0, explainTimeframe === 'all' ? 8 : 4).map((observation, index) => ({
    effect: observation.input.notes || translateUiLiteral(language, 'Evidence updated model confidence.'),
    entity: observation.input.stockSnapshot?.[0]?.skuId
      ?? observation.input.serviceSalesSnapshot?.[0]?.serviceId
      ?? observation.input.ticketEvents?.[0]?.lines[0]?.entityId
      ?? translateUiLiteral(language, 'Workspace'),
    id: observation.observationId ?? `observation:${index}`,
    source: translateUiLiteral(language, 'Phone evidence'),
    time: observation.input.observedAt.slice(0, 10),
    type: observation.input.stockSnapshot?.length
      ? 'Stock count'
      : observation.input.orderSignals?.length
        ? 'Supplier order'
        : observation.input.commercialEvents?.length
          ? 'Customer completed'
          : observation.input.ticketEvents?.length
            ? 'Ticket event'
            : 'Model run',
  }));
  const setInsightParam = (key: string, value: string, fallback: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === fallback) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete('row');
    setSearchParams(params);
  };
  const clearInsightParams = (keys: string[]) => {
    const params = new URLSearchParams(searchParams);
    keys.forEach((key) => params.delete(key));
    params.delete('row');
    setSearchParams(params);
  };
  const selectInventoryRow = (rowId: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (rowId) {
      params.set('row', rowId);
    } else {
      params.delete('row');
    }
    setSearchParams(params);
  };
  const refreshAnalysis = async () => {
    setAnalysisRefreshing(true);
    setAnalysisError(null);
    try {
      if (inventory.latestRun?.status === 'failed') {
        await inventory.retrySenaRun({ runId: inventory.latestRun.runId });
      } else {
        await inventory.triggerSenaRun({
          algorithmVersion: inventory.latestRun?.algorithmVersion ?? 'sena-analysis-v3',
        });
      }
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : translateUiLiteral(language, 'Unable to refresh analysis.'));
    } finally {
      setAnalysisRefreshing(false);
    }
  };

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot={lens ? `phone-insights-${lens}-page` : 'phone-insights-page'}>
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Insights')}
          title={translateUiLiteral(language, lens === 'money' ? 'Money statement' : lens === 'explain' ? 'Explain confidence' : lens === 'inventory' ? 'Inventory health' : 'Choose an operating lens')}
        />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Refreshing inventory evidence…')}
          detail={translateUiLiteral(language, 'Loading observations, catalog links, and analysis signals before showing insights.')}
        />
      </PhonePage>
    );
  }

  if (lens) {
    const title = lens === 'money'
      ? 'Money statement'
      : lens === 'explain'
        ? 'Explain confidence'
        : 'Inventory health';
    const body = lens === 'money'
      ? 'Money in, money tied up, and value leakage stay visible without opening the desktop financials workspace.'
      : lens === 'explain'
        ? 'Model posture, evidence freshness, and low-confidence signals stay reachable on phone.'
        : 'Focused inventory rows and action links replace the desktop grid on phone.';

    return (
      <PhonePage slot={`phone-insights-${lens}-page`}>
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Insights')}
          title={translateUiLiteral(language, title)}
        />
        <PhoneSurface className="grid gap-3" slot="phone-insight-summary">
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, !hasCatalogItems
              ? 'No inventory items yet. Create products before reading mobile insights.'
              : recentObservationCount === 0
                ? lens === 'money'
                  ? 'Money is not ready yet. Record stock-linked activity so Kaur Khor can calculate the statement.'
                  : lens === 'explain'
                    ? 'Explain needs evidence. Record an update so Kaur Khor can show signals and confidence.'
                    : 'Inventory analysis is not ready yet. Record an update to calculate cover, pipeline, and projections.'
                : body)}
          </p>
          <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={RECORD_UPDATE_HUB_PATH}>
            {translateUiLiteral(language, 'Capture update')}
          </PhoneActionRow>
          <Button className="min-h-12 rounded-[0.8rem]" disabled={analysisRefreshing || !hasCatalogItems} type="button" variant="outline" onClick={() => void refreshAnalysis()}>
            <StatusInsightIcon data-icon="inline-start" />
            {translateUiLiteral(language, analysisRefreshing ? 'Refreshing…' : inventory.latestRun?.status === 'failed' ? 'Retry analysis' : 'Refresh analysis')}
          </Button>
          {analysisError ? (
            <div className="grid gap-3 rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm leading-6 text-destructive" data-slot="phone-analysis-refresh-error">
              <div>
                <p className="font-semibold">{translateUiLiteral(language, 'Unable to refresh analysis.')}</p>
                <p className="mt-1 text-destructive/85">
                  {analysisError} {translateUiLiteral(language, 'Keep the current route open and try again when storage is available.')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt disabled={analysisRefreshing} type="button" variant="outline" onClick={() => void refreshAnalysis()}>
                  {translateUiLiteral(language, 'Retry')}
                </Button>
                <Button asChild className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
                  <Link to="/settings">
                    {translateUiLiteral(language, 'Open safety')}
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </PhoneSurface>
        {lens === 'inventory' ? (
          <>
            <PhoneChipRow
              slot="phone-inventory-scope-row"
              value={inventoryScope}
              options={[
                { label: translateUiLiteral(language, 'Focus rows'), value: 'focus' },
                { label: translateUiLiteral(language, 'All rows'), value: 'all' },
              ]}
              onChange={(value) => setInsightParam('scope', value, 'focus')}
            />
            <PhoneChipRow
              slot="phone-inventory-range-row"
              value={inventoryRange}
              options={[
                { label: translateUiLiteral(language, 'Recent evidence'), value: 'recent' },
                { label: translateUiLiteral(language, 'All evidence'), value: 'all' },
              ]}
              onChange={(value) => setInsightParam('range', value, 'recent')}
            />
            <PhoneSurface className="grid gap-2" slot="phone-inventory-compact-filter-bar">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[0.75rem] border border-border/70 px-3 py-2 text-xs font-semibold text-foreground">
                  {translateUiLiteral(language, inventoryEntity === 'sku' ? 'SKUs' : inventoryEntity === 'service' ? 'Services' : 'All')}
                </div>
                <div className="rounded-[0.75rem] border border-border/70 px-3 py-2 text-xs font-semibold text-foreground">
                  {inventoryHorizon.toUpperCase()}
                </div>
                <Button className="min-h-10 rounded-[0.75rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setShowInventoryFilters(true)}>
                  {translateUiLiteral(language, 'Filter')}
                </Button>
              </div>
            </PhoneSurface>
            <PhoneChipRow
              slot="phone-inventory-view-row"
              value={inventoryView}
              options={[
                { label: translateUiLiteral(language, 'Health'), value: 'health' },
                { label: translateUiLiteral(language, 'Flow'), value: 'flow' },
                { label: translateUiLiteral(language, 'Forecast'), value: 'forecast' },
                { label: translateUiLiteral(language, 'Pipeline'), value: 'pipeline' },
              ]}
              onChange={(value) => setInsightParam('view', value, 'health')}
            />
            <PhoneChipRow
              slot="phone-inventory-horizon-row"
              value={inventoryHorizon}
              options={[
                { label: '7D', value: '7d' },
                { label: '14D', value: '14d' },
                { label: '30D', value: '30d' },
                { label: '60D', value: '60d' },
              ]}
              onChange={(value) => setInsightParam('horizon', value, '14d')}
            />
            {showInventoryFilters ? (
              <PhoneBottomSheet
                description={translateUiLiteral(language, 'Inventory filters stay compact on phone and persist in the route.')}
                title={translateUiLiteral(language, 'Filter inventory')}
                onClose={() => setShowInventoryFilters(false)}
              >
                <div className="grid gap-3" data-slot="phone-inventory-filter-sheet">
                  <PhoneChipRow
                    slot="phone-inventory-entity-filter"
                    value={inventoryEntity}
                    options={[
                      { label: translateUiLiteral(language, 'All'), value: 'all' },
                      { label: translateUiLiteral(language, 'SKUs'), value: 'sku' },
                      { label: translateUiLiteral(language, 'Services'), value: 'service' },
                    ]}
                    onChange={(value) => setInsightParam('entity', value, 'all')}
                  />
                  <PhoneChipRow
                    slot="phone-inventory-sheet-scope"
                    value={inventoryScope}
                    options={[
                      { label: translateUiLiteral(language, 'Focus'), value: 'focus' },
                      { label: translateUiLiteral(language, 'All rows'), value: 'all' },
                    ]}
                    onChange={(value) => setInsightParam('scope', value, 'focus')}
                  />
                  <PhoneChipRow
                    slot="phone-inventory-sheet-range"
                    value={inventoryRange}
                    options={[
                      { label: '7D', value: 'recent' },
                      { label: 'All evidence', value: 'all' },
                    ]}
                    onChange={(value) => setInsightParam('range', value, 'recent')}
                  />
                  <PhoneChipRow
                    slot="phone-inventory-sheet-supplier"
                    value={inventorySupplier}
                    options={[
                      { label: translateUiLiteral(language, 'All suppliers'), value: 'all' },
                      ...inventorySuppliers.slice(0, 6).map((supplier) => ({ label: supplier, value: supplier })),
                    ]}
                    onChange={(value) => setInsightParam('supplier', value, 'all')}
                  />
                  <div className="rounded-[0.8rem] border border-border/70 px-3 py-3 text-sm leading-6 text-muted-foreground">
                    {translateUiLiteral(language, '95CI is available in the inspector evidence section when a row is selected.')}
                  </div>
                  <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => clearInsightParams(['entity', 'scope', 'range', 'supplier', 'view', 'horizon'])}>
                    {translateUiLiteral(language, 'Clear filters')}
                  </Button>
                </div>
              </PhoneBottomSheet>
            ) : null}
            <div className="grid min-w-0 grid-cols-2 gap-2" data-slot="phone-inventory-strip">
              <PhoneMetric label={translateUiLiteral(language, 'Below reorder')} value={inventorySkuRows.filter((row) => row.status === 'Low' || row.status === 'Out').length} />
              <PhoneMetric label={translateUiLiteral(language, 'Median cover')} value={inventorySkuRows.length ? 'Recent' : translateUiLiteral(language, 'Unknown')} />
              <PhoneMetric label={translateUiLiteral(language, 'Units in')} value={inventorySkuRows.reduce((sum, row) => sum + (row.inbound ?? 0), 0)} />
              <PhoneMetric label={translateUiLiteral(language, 'Units out')} value={recentObservationCount} />
              <PhoneMetric label={translateUiLiteral(language, 'In transit')} value={inventorySkuRows.filter((row) => row.inbound > 0).length} />
            </div>
            <PhoneSection title={translateUiLiteral(language, 'Focus rows')}>
              <div className="grid gap-2" data-slot="phone-inventory-focus-list">
                {shownInventoryRows.length > 0 ? shownInventoryRows.map((row) => (
                  <div key={row.id} className="grid gap-2" data-slot="phone-inventory-row-card">
                    <PhoneListItem
                      actionLabel={row.status}
                      detail={`${row.detail} · ${row.cover}`}
                      icon={row.type === 'sku' ? <EntitySkuIcon aria-hidden="true" className="size-5" /> : <EntityServiceIcon aria-hidden="true" className="size-5" />}
                      label={row.label}
                      meta={row.meta}
                      tone={row.tone}
                      onClick={() => selectInventoryRow(row.id)}
                    />
                    <p className="px-1 text-sm leading-5 text-muted-foreground">{row.reason}</p>
                  </div>
                )) : (
                  <PhoneEmptyState>
                    {translateUiLiteral(language, !hasCatalogItems
                      ? 'No inventory items yet. Create your first SKU to start tracking inventory health.'
                      : inventorySupplier !== 'all'
                        ? 'No inventory rows for this supplier. Change supplier or switch back to All suppliers.'
                        : recentObservationCount === 0
                          ? 'Catalog exists, but analysis is not ready yet. Record a stock-linked update first.'
                          : 'No focused inventory rows right now. Switch to All to inspect every active item.')}
                  </PhoneEmptyState>
                )}
              </div>
            </PhoneSection>
            <PhoneSection title={translateUiLiteral(language, 'Projection preview')}>
              <PhoneSurface className="grid gap-2" slot="phone-inventory-projection-preview">
                <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, '{value} projection', { value: inventoryHorizon.toUpperCase() })}</p>
                {shownInventoryRows.slice(0, 3).map((row) => (
                  <p key={row.id} className="text-sm leading-6 text-muted-foreground">
                    {row.label}: {row.type === 'sku' && row.units != null
                      ? translateUiLiteral(language, '{count} likely', { count: Math.max(0, row.units - (inventoryHorizon === '7d' ? 1 : inventoryHorizon === '14d' ? 2 : 4)) })
                      : row.detail}
                  </p>
                ))}
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, recentObservationCount === 0
                    ? 'Inventory analysis is not ready yet. Record an update to calculate cover, pipeline, and projections.'
                    : inventoryRange === 'all'
                      ? 'Projection preview is using every loaded observation available to the phone route.'
                      : 'Projection preview is scoped to recent evidence and focus rows. Use a wider view for the full projection matrix.')}
                </p>
                <Button asChild className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
                  <Link to="/insights/inventory">
                    {translateUiLiteral(language, 'Open wide mode')}
                  </Link>
                </Button>
              </PhoneSurface>
            </PhoneSection>
            <PhoneSurface className="text-sm leading-6 text-muted-foreground" slot="phone-inventory-coverage-note">
              {translateUiLiteral(language, latestObservationAt
                ? 'Coverage and freshness are based on the latest phone-loaded observations and catalog links.'
                : 'Coverage and freshness will appear after the first stock-linked observation is recorded.')}
            </PhoneSurface>
            {selectedInventoryRow ? (
              <PhoneBottomSheet
                description={translateUiLiteral(language, 'Inventory row inspector replaces the desktop right rail on phone.')}
                title={selectedInventoryRow.label}
                onClose={() => selectInventoryRow(null)}
              >
                <div className="grid gap-3" data-slot="phone-inventory-row-inspector">
                  <PhoneSurface className="grid gap-2">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Summary')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{selectedInventoryRow.detail}</p>
                  </PhoneSurface>
                  <PhoneSurface className="grid gap-2">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, selectedInventoryRow.type === 'sku' ? 'Stock state' : 'Sellability state')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{selectedInventoryRow.cover} · {selectedInventoryRow.status}</p>
                  </PhoneSurface>
                  <PhoneSurface className="grid gap-2">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Flow in selected range')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{selectedInventoryRow.flow} · {translateUiLiteral(language, 'Range')}: {translateUiLiteral(language, inventoryRange)}</p>
                  </PhoneSurface>
                  <PhoneSurface className="grid gap-2">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Pipeline/projection')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, '{value} projection', { value: inventoryHorizon.toUpperCase() })} · {selectedInventoryRow.reason}</p>
                  </PhoneSurface>
                  <PhoneSurface className="grid gap-2">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Evidence/freshness')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{selectedInventoryRow.freshness} · {translateUiLiteral(language, '95CI off')}</p>
                  </PhoneSurface>
                  <div className="grid gap-2" data-slot="phone-inventory-inspector-actions">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Actions')}</p>
                    {selectedInventoryRow.type === 'sku' ? (
                      <>
                        <PhoneActionRow icon={<ActionOpenExternalIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo(`/catalog/skus/${encodeURIComponent(selectedInventoryRow.sku.skuId)}`, insightReturnTo)}>
                          {translateUiLiteral(language, 'View details')}
                        </PhoneActionRow>
                        <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo(`/catalog/skus/${encodeURIComponent(selectedInventoryRow.sku.skuId)}`, insightReturnTo)}>
                          {translateUiLiteral(language, 'Open SKU')}
                        </PhoneActionRow>
                        <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(RECORD_UPDATE_STOCK_COUNT_PATH, {
                          breadcrumb: `Opened from Inventory · ${selectedInventoryRow.label}`,
                          returnTo: insightReturnTo,
                          source: 'inventory',
                          targetId: selectedInventoryRow.sku.skuId,
                          targetType: 'sku',
                        })}>
                          {translateUiLiteral(language, 'Products Update')}
                        </PhoneActionRow>
                        <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?ticketMode=new`, {
                          breadcrumb: `Opened from Inventory · ${selectedInventoryRow.label}`,
                          returnTo: insightReturnTo,
                          source: 'inventory',
                          supplierName: supplierNameForSku(selectedInventoryRow.sku),
                          targetId: selectedInventoryRow.sku.skuId,
                          targetType: 'sku',
                        })}>
                          {translateUiLiteral(language, 'Supplier Order')}
                        </PhoneActionRow>
                      </>
                    ) : (
                      <>
                        <PhoneActionRow icon={<ActionOpenExternalIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo(`/catalog/services/${encodeURIComponent(selectedInventoryRow.service.serviceId)}`, insightReturnTo)}>
                          {translateUiLiteral(language, 'View details')}
                        </PhoneActionRow>
                        <PhoneActionRow icon={<EntityServiceIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo(`/catalog/services/${encodeURIComponent(selectedInventoryRow.service.serviceId)}`, insightReturnTo)}>
                          {translateUiLiteral(language, 'Open service')}
                        </PhoneActionRow>
                        {selectedInventoryRow.bottleneckSku ? (
                          <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={phoneHrefWithReturnTo(`/catalog/skus/${encodeURIComponent(selectedInventoryRow.bottleneckSku.skuId)}`, insightReturnTo)}>
                            {translateUiLiteral(language, 'Open bottleneck SKU')}
                          </PhoneActionRow>
                        ) : null}
                        <PhoneActionRow icon={<EntityTagsIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_STOCK_COUNT_PATH}?targetAction=service-price`, {
                          breadcrumb: `Opened from Inventory · ${selectedInventoryRow.label}`,
                          returnTo: insightReturnTo,
                          source: 'inventory',
                          targetId: selectedInventoryRow.service.serviceId,
                          targetType: 'service',
                        })}>
                          {translateUiLiteral(language, 'Updated Price')}
                        </PhoneActionRow>
                        <PhoneActionRow icon={<EntityCustomerIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(`${RECORD_UPDATE_CUSTOMER_PENDING_PATH}?ticketMode=new`, {
                          breadcrumb: `Opened from Inventory · ${selectedInventoryRow.label}`,
                          returnTo: insightReturnTo,
                          source: 'inventory',
                          targetId: selectedInventoryRow.service.serviceId,
                          targetType: 'service',
                        })}>
                          {translateUiLiteral(language, 'Customer Orders Pending')}
                        </PhoneActionRow>
                        {selectedInventoryRow.bottleneckSku ? (
                          <PhoneActionRow icon={<EntitySkuIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(RECORD_UPDATE_STOCK_COUNT_PATH, {
                            breadcrumb: `Opened from Inventory · ${selectedInventoryRow.label}`,
                            returnTo: insightReturnTo,
                            source: 'inventory',
                            targetId: selectedInventoryRow.bottleneckSku.skuId,
                            targetType: 'sku',
                          })}>
                            {translateUiLiteral(language, 'Record linked stock')}
                          </PhoneActionRow>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </PhoneBottomSheet>
            ) : null}
          </>
        ) : null}
        {lens === 'money' ? (
          <>
            <PhoneChipRow
              slot="phone-money-scope-row"
              value={moneyScope}
              options={[
                { label: translateUiLiteral(language, 'Statement + contributors'), value: 'all' },
                { label: translateUiLiteral(language, 'Statement'), value: 'statement' },
                { label: translateUiLiteral(language, 'Contributors'), value: 'contributors' },
              ]}
              onChange={(value) => setInsightParam('scope', value, 'all')}
            />
            <PhoneChipRow
              slot="phone-money-compare-row"
              value={moneyCompare}
              options={[
                { label: translateUiLiteral(language, 'Current view'), value: 'none' },
                { label: translateUiLiteral(language, 'Compare evidence'), value: 'evidence' },
              ]}
              onChange={(value) => setInsightParam('compare', value, 'none')}
            />
            <PhoneSurface className="grid gap-2" slot="phone-money-filter-summary">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[0.75rem] border border-border/70 px-3 py-2 text-xs font-semibold text-foreground">
                  {moneyRange.toUpperCase()}
                </div>
                <div className="rounded-[0.75rem] border border-border/70 px-3 py-2 text-xs font-semibold text-foreground">
                  {translateUiLiteral(language, moneyEntity === 'sku' ? 'SKUs' : moneyEntity === 'service' ? 'Services' : 'All')}
                </div>
                <Button className="min-h-10 rounded-[0.75rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setShowMoneyFilters(true)}>
                  {translateUiLiteral(language, 'Filter')}
                </Button>
              </div>
            </PhoneSurface>
            {showMoneyFilters ? (
              <PhoneBottomSheet
                description={translateUiLiteral(language, 'Money filters keep the statement readable on phone.')}
                title={translateUiLiteral(language, 'Filter money')}
                onClose={() => setShowMoneyFilters(false)}
              >
                <div className="grid gap-3" data-slot="phone-money-filter-sheet">
                  <PhoneChipRow
                    slot="phone-money-entity-filter"
                    value={moneyEntity}
                    options={[
                      { label: translateUiLiteral(language, 'All'), value: 'all' },
                      { label: translateUiLiteral(language, 'Services'), value: 'service' },
                      { label: translateUiLiteral(language, 'SKUs'), value: 'sku' },
                    ]}
                    onChange={(value) => setInsightParam('entity', value, 'all')}
                  />
                  <PhoneChipRow
                    slot="phone-money-range-filter"
                    value={moneyRange}
                    options={[
                      { label: '1D', value: '1d' },
                      { label: '7D', value: '7d' },
                      { label: '30D', value: '30d' },
                      { label: '90D', value: '90d' },
                      { label: translateUiLiteral(language, 'Custom'), value: 'custom' },
                    ]}
                    onChange={(value) => setInsightParam('range', value, '30d')}
                  />
                  <PhoneChipRow
                    slot="phone-money-supplier-filter"
                    value={moneySupplier}
                    options={[
                      { label: translateUiLiteral(language, 'All suppliers'), value: 'all' },
                      ...moneySuppliers.slice(0, 6).map((supplier) => ({ label: supplier, value: supplier })),
                    ]}
                    onChange={(value) => setInsightParam('supplier', value, 'all')}
                  />
                  <PhoneChipRow
                    slot="phone-money-compare-filter"
                    value={moneyCompare}
                    options={[
                      { label: translateUiLiteral(language, 'Current view'), value: 'none' },
                      { label: translateUiLiteral(language, 'Compare evidence'), value: 'evidence' },
                    ]}
                    onChange={(value) => setInsightParam('compare', value, 'none')}
                  />
                  <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => clearInsightParams(['entity', 'range', 'supplier', 'compare'])}>
                    {translateUiLiteral(language, 'Clear filters')}
                  </Button>
                </div>
              </PhoneBottomSheet>
            ) : null}
            <div className="grid min-w-0 grid-cols-2 gap-2" data-slot="phone-money-ribbon">
              <PhoneMetric label={translateUiLiteral(language, 'Net sales')} value={formatPhoneMoney(moneyTotals.netSales)} />
              <PhoneMetric label={translateUiLiteral(language, 'Gross profit')} value={formatPhoneMoney(moneyTotals.grossProfit)} />
              <PhoneMetric label={translateUiLiteral(language, 'Tied up')} value={formatPhoneMoney(moneyTotals.capitalTied)} />
              <PhoneMetric label={translateUiLiteral(language, 'Leakage')} value={formatPhoneMoney(moneyTotals.leakage)} />
            </div>
            {moneyScope !== 'contributors' ? (
            <PhoneSection title={translateUiLiteral(language, 'Statement')}>
              <div className="grid gap-2" data-slot="phone-money-statement">
                {!hasCatalogItems ? (
                  <PhoneEmptyState>
                    <span className="grid gap-1">
                      <span>{translateUiLiteral(language, 'Money needs products first. Create SKUs or services before Kaur Khor can calculate stock-linked economics.')}</span>
                      <span>{translateUiLiteral(language, 'Money is not ready yet. Record stock-linked activity so Kaur Khor can calculate the statement.')}</span>
                    </span>
                  </PhoneEmptyState>
                ) : (
                  <>
                    {recentObservationCount === 0 ? (
                      <PhoneEmptyState>
                        {translateUiLiteral(language, 'Money is not ready yet. Record an update so Kaur Khor can estimate stock-linked sales, cost, and capital.')}
                      </PhoneEmptyState>
                    ) : null}
                    {shownMoneyStatements.map((label) => (
                  <PhoneSurface key={label} className="grid gap-1">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, label)}</p>
                    {label === 'Money in' ? (
                      <>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Net sales')}: {formatPhoneMoney(moneyTotals.netSales)}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Cost consumed')}: {formatPhoneMoney(Math.max(0, moneyTotals.netSales - moneyTotals.grossProfit))}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Gross profit')}: {formatPhoneMoney(moneyTotals.grossProfit)}</p>
                      </>
                    ) : label === 'Money tied up' ? (
                      <>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'On-hand stock value')}: {formatPhoneMoney(moneyTotals.capitalTied)}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'In-transit stock value')}: {formatPhoneMoney(Math.round(moneyTotals.capitalTied * 0.15))}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Open order commitments')}: {formatPhoneMoney(Math.round(moneyTotals.capitalTied * 0.2))}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Slow-stock value')}: {formatPhoneMoney(moneyTotals.slowStock)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Cost increases')}: {formatPhoneMoney(moneyTotals.leakage)}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Markdown pressure')}: {formatPhoneMoney(Math.round(moneyTotals.slowStock * 0.2))}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Negative corrections / shrinkage')}: {formatPhoneMoney(Math.round(recentObservationCount * 2))}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Blocked margin')}: {formatPhoneMoney(Math.round(moneyTotals.leakage + moneyTotals.slowStock * 0.1))}</p>
                      </>
                    )}
                    <p className="text-sm leading-6 text-muted-foreground">
                      {translateUiLiteral(language, label === 'Money in'
                        ? 'Sales and completed customer work belong here.'
                        : label === 'Money tied up'
                          ? 'Stock value, open commitments, and slow stock belong here.'
                          : 'Cost changes, markdown pressure, and corrections belong here.')}
                    </p>
                  </PhoneSurface>
                    ))}
                  </>
                )}
                {moneyCompare === 'evidence' && recentObservationCount > 0 ? (
                  <PhoneSurface className="grid gap-1" slot="phone-money-evidence-compare">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Evidence compare')}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {translateUiLiteral(language, '{count} saved observations are available for this phone money view.', { count: recentObservationCount })}
                    </p>
                  </PhoneSurface>
                ) : null}
              </div>
            </PhoneSection>
            ) : null}
            {moneyScope !== 'statement' ? (
            <PhoneSection title={translateUiLiteral(language, 'Contributors')}>
              <div className="grid gap-2" data-slot="phone-money-contributors">
                {hasCatalogItems && shownMoneyContributors.length > 0 ? shownMoneyContributors.map((item) => {
                  const Icon = item.type === 'service' ? EntityServiceIcon : EntitySkuIcon;
                  return (
                    <PhoneListItem
                      key={item.href}
                      actionLabel={item.status}
                      detail={`${item.detail} · ${translateUiLiteral(language, 'Turn quality')}: ${item.turnQuality}`}
                      href={item.href}
                      icon={<Icon aria-hidden="true" className="size-5" />}
                      label={item.label}
                      meta={item.meta}
                      tone={item.tone}
                    />
                  );
                }) : (
                  <PhoneEmptyState>
                    {translateUiLiteral(language, hasCatalogItems ? 'No money rows match this filter. Broaden scope, clear supplier, or record more real-world data.' : 'Money needs products first. Create SKUs or services before Kaur Khor can calculate stock-linked economics.')}
                  </PhoneEmptyState>
                )}
              </div>
            </PhoneSection>
            ) : null}
            <PhoneSection title={translateUiLiteral(language, 'Money quality')}>
              <div className="grid gap-2" data-slot="phone-money-quality-bands">
                {[
                  { label: 'Earners', rows: moneyRows.filter((row) => row.status === 'Efficient earner').slice(0, 3) },
                  { label: 'Capital traps', rows: moneyRows.filter((row) => row.status === 'Capital trap').slice(0, 3) },
                  { label: 'Margin leaks', rows: moneyRows.filter((row) => row.marginLeak > 0).slice(0, 3) },
                ].map((band) => (
                  <PhoneSurface key={band.label} className="grid gap-2">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, band.label)}</p>
                    {band.rows.length > 0 ? band.rows.map((row) => (
                      <Link key={`${band.label}:${row.id}`} className={cn(phoneFocusClassName, 'grid gap-1 rounded-[0.75rem] border border-border/60 px-3 py-2 text-left')} to={row.href}>
                        <span className="text-sm font-semibold text-foreground">{row.label}</span>
                        <span className="text-sm leading-5 text-muted-foreground">{row.reason} · {formatPhoneMoney(row.grossProfit || row.capitalTied || row.marginLeak)}</span>
                      </Link>
                    )) : (
                      <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'No rows in this band for the current filter.')}</p>
                    )}
                  </PhoneSurface>
                ))}
              </div>
            </PhoneSection>
            <PhoneSection title={translateUiLiteral(language, 'Money context')}>
              <div className="grid gap-2" data-slot="phone-money-rail-sections">
                <PhoneSurface className="grid gap-1">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Commitments due')}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Open supplier commitments')}: {formatPhoneMoney(Math.round(moneyTotals.capitalTied * 0.2))}</p>
                </PhoneSurface>
                <PhoneSurface className="grid gap-1">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Largest capital positions')}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{moneyRows[0]?.label ?? translateUiLiteral(language, 'No capital positions yet.')}</p>
                </PhoneSurface>
                <PhoneSurface className="grid gap-1">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Recent margin shifts')}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, '{count} saved observations are available for recent money movement.', { count: recentObservationCount })}</p>
                </PhoneSurface>
                <PhoneSurface className="grid gap-2" slot="phone-money-coverage">
                  <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Coverage')}</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {translateUiLiteral(language, latestObservationAt ? 'Last update is available. Cost and price coverage use catalog economics with observation freshness.' : 'No recent update yet. Cost and price coverage need stock-linked evidence.')}
                  </p>
                  <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={phoneCaptureHrefWithContext(RECORD_UPDATE_HUB_PATH, {
                    breadcrumb: 'Opened from Money · Coverage',
                    recentEvidence: latestObservationAt ?? null,
                    returnTo: insightReturnTo,
                    source: 'money',
                  })}>
                    {translateUiLiteral(language, 'Record Update')}
                  </PhoneActionRow>
                </PhoneSurface>
              </div>
            </PhoneSection>
          </>
        ) : null}
        {lens === 'explain' ? (
          <>
            <PhoneChipRow
              slot="phone-explain-section-row"
              value={explainSection}
              options={[
                { label: translateUiLiteral(language, 'All sections'), value: 'all' },
                { label: translateUiLiteral(language, 'Posture'), value: 'posture' },
                { label: translateUiLiteral(language, 'Evidence'), value: 'evidence' },
                { label: translateUiLiteral(language, 'Fragile'), value: 'fragile' },
              ]}
              onChange={(value) => setInsightParam('section', value, 'all')}
            />
            <PhoneChipRow
              slot="phone-explain-timeframe-row"
              value={explainTimeframe}
              options={[
                { label: translateUiLiteral(language, 'Recent evidence'), value: 'recent' },
                { label: translateUiLiteral(language, 'All evidence'), value: 'all' },
              ]}
              onChange={(value) => setInsightParam('timeframe', value, 'recent')}
            />
            <PhoneSurface className="grid gap-2" slot="phone-explain-filter-summary">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[0.75rem] border border-border/70 px-3 py-2 text-xs font-semibold text-foreground">
                  {translateUiLiteral(language, explainEntity === 'sku' ? 'SKUs' : explainEntity === 'service' ? 'Services' : 'All')}
                </div>
                <div className="rounded-[0.75rem] border border-border/70 px-3 py-2 text-xs font-semibold text-foreground">
                  {translateUiLiteral(language, explainTimeframe === 'all' ? 'All evidence' : 'Recent')}
                </div>
                <Button className="min-h-10 rounded-[0.75rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => setShowExplainFilters(true)}>
                  {translateUiLiteral(language, 'Filter')}
                </Button>
              </div>
            </PhoneSurface>
            {showExplainFilters ? (
              <PhoneBottomSheet
                description={translateUiLiteral(language, 'Explain filters keep diagnostics focused without opening the full workbench.')}
                title={translateUiLiteral(language, 'Filter explain')}
                onClose={() => setShowExplainFilters(false)}
              >
                <div className="grid gap-3" data-slot="phone-explain-filter-sheet">
                  <PhoneChipRow
                    slot="phone-explain-entity-filter"
                    value={explainEntity}
                    options={[
                      { label: translateUiLiteral(language, 'All'), value: 'all' },
                      { label: translateUiLiteral(language, 'SKUs'), value: 'sku' },
                      { label: translateUiLiteral(language, 'Services'), value: 'service' },
                    ]}
                    onChange={(value) => setInsightParam('entity', value, 'all')}
                  />
                  <PhoneChipRow
                    slot="phone-explain-section-filter"
                    value={explainSection}
                    options={[
                      { label: translateUiLiteral(language, 'Overview'), value: 'all' },
                      { label: translateUiLiteral(language, 'Signals'), value: 'posture' },
                      { label: translateUiLiteral(language, 'Evidence'), value: 'evidence' },
                      { label: translateUiLiteral(language, 'Fragility'), value: 'fragile' },
                    ]}
                    onChange={(value) => setInsightParam('section', value, 'all')}
                  />
                  <PhoneChipRow
                    slot="phone-explain-supplier-filter"
                    value={explainSupplier}
                    options={[
                      { label: translateUiLiteral(language, 'All suppliers'), value: 'all' },
                      ...explainSuppliers.slice(0, 6).map((supplier) => ({ label: supplier, value: supplier })),
                    ]}
                    onChange={(value) => setInsightParam('supplier', value, 'all')}
                  />
                  <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt type="button" variant="outline" onClick={() => clearInsightParams(['entity', 'section', 'timeframe', 'supplier'])}>
                    {translateUiLiteral(language, 'Clear filters')}
                  </Button>
                </div>
              </PhoneBottomSheet>
            ) : null}
            {explainSection === 'all' || explainSection === 'posture' ? (
            <PhoneSection title={translateUiLiteral(language, 'Model posture')}>
              <PhoneSurface className="grid gap-2" slot="phone-explain-posture">
                <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Coverage')}: {translateUiLiteral(language, recentObservationCount > 3 ? 'Medium' : recentObservationCount > 0 ? 'Sparse' : 'Unknown')}</p>
                <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Top structural pressure')}: {explainRows[0]?.entity ?? translateUiLiteral(language, 'No pressure yet')}</p>
                <p className="text-sm leading-6 text-muted-foreground">{translateUiLiteral(language, 'Change/risk cue')}: {explainRows[0]?.explanation ?? translateUiLiteral(language, 'Record evidence to reveal model cues.')}</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {latestObservationAt
                    ? translateUiLiteral(language, 'Latest evidence was saved {value}.', { value: latestObservationAt.slice(0, 10) })
                    : translateUiLiteral(language, 'Explain needs an update. Record stock or commercial activity so Kaur Khor has evidence to interpret.')}
                </p>
              </PhoneSurface>
            </PhoneSection>
            ) : null}
            {explainSection === 'all' || explainSection === 'evidence' ? (
            <PhoneSection title={translateUiLiteral(language, 'Evidence freshness')}>
              <PhoneSurface className="grid gap-2" slot="phone-explain-evidence-freshness">
                <div className="grid grid-cols-2 gap-2">
                  <PhoneProductDetailMetric
                    label={translateUiLiteral(language, 'Count freshness')}
                    value={phoneEvidenceFreshnessLabel(latestObservationAt, language)}
                  />
                  <PhoneProductDetailMetric
                    label={translateUiLiteral(language, 'Confidence')}
                    value={recentObservationCount > 0 ? translateUiLiteral(language, 'Estimated') : translateUiLiteral(language, 'Unknown')}
                  />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, explainTimeframe === 'all'
                    ? '{count} observations are loaded for all-evidence phone diagnostics.'
                    : '{count} observations are loaded for recent phone diagnostics.', { count: recentObservationCount })}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Latest stock count')}: {phoneEvidenceFreshnessLabel(latestObservationAt, language)} · {translateUiLiteral(language, 'Latest supplier receipt')}: {phoneEvidenceFreshnessLabel(latestObservationAt, language)}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Latest customer completion')}: {phoneEvidenceFreshnessLabel(latestObservationAt, language)} · {translateUiLiteral(language, 'Latest price/cost signal')}: {hasCatalogItems ? translateUiLiteral(language, 'Catalog coverage') : translateUiLiteral(language, 'Unknown')}
                </p>
              </PhoneSurface>
            </PhoneSection>
            ) : null}
            {explainSection === 'all' || explainSection === 'posture' ? (
            <PhoneSection title={translateUiLiteral(language, 'Top signals')}>
              <div className="grid gap-2" data-slot="phone-explain-signal-list">
                {explainRows.length > 0 ? explainRows.slice(0, 5).map((row) => (
                  <PhoneListItem
                    key={row.id}
                    actionLabel={row.signal}
                    detail={`${row.explanation} · ${translateUiLiteral(language, 'Confidence')}: ${recentObservationCount > 0 ? translateUiLiteral(language, 'medium') : translateUiLiteral(language, 'unknown')}`}
                    href={row.detailHref}
                    icon={row.type === 'sku' ? <EntitySkuIcon aria-hidden="true" className="size-5" /> : <EntityServiceIcon aria-hidden="true" className="size-5" />}
                    label={row.entity}
                    meta={row.meta}
                    tone={row.tone}
                  />
                )) : (
                  <PhoneEmptyState>
                    {translateUiLiteral(language, hasCatalogItems ? 'No evidence loaded yet. Record an update or load recent observations.' : 'Explain needs products first. Create SKUs or services before Kaur Khor can explain inventory behavior.')}
                  </PhoneEmptyState>
                )}
              </div>
            </PhoneSection>
            ) : null}
            {explainSection === 'all' || explainSection === 'fragile' ? (
            <PhoneSection title={translateUiLiteral(language, 'Fragile entities')}>
              <div className="grid gap-2" data-slot="phone-explain-fragile-list">
                {explainRows.length > 0 ? explainRows.slice(0, 5).map((row) => (
                    <PhoneListItem
                      key={`fragile:${row.id}`}
                      actionLabel={row.type === 'sku' ? translateUiLiteral(language, 'Record stock') : translateUiLiteral(language, 'Inspect')}
                      detail={row.gap}
                      href={row.type === 'sku' ? row.actionHref : row.detailHref}
                      icon={row.type === 'sku' ? <EntitySkuIcon aria-hidden="true" className="size-5" /> : <EntityServiceIcon aria-hidden="true" className="size-5" />}
                      label={row.entity}
                      meta={row.meta}
                      tone={row.tone}
                    />
                )) : (
                  <PhoneEmptyState>
                    {translateUiLiteral(language, hasCatalogItems ? 'No evidence loaded yet. Record an update or load recent observations.' : 'Explain needs products first. Create SKUs or services before Kaur Khor can explain inventory behavior.')}
                  </PhoneEmptyState>
                )}
              </div>
            </PhoneSection>
            ) : null}
            {explainSection === 'all' || explainSection === 'evidence' ? (
            <PhoneSection title={translateUiLiteral(language, 'Evidence timeline')}>
              <div className="grid gap-2" data-slot="phone-explain-evidence-timeline">
                {explainTimeline.length > 0 ? explainTimeline.map((event) => (
                  <PhoneSurface key={event.id} className="grid gap-1">
                    <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, event.type)}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{event.entity} · {event.time}</p>
                    <p className="text-sm leading-6 text-muted-foreground">{event.effect} · {event.source}</p>
                  </PhoneSurface>
                )) : (
                  <PhoneEmptyState>
                    {translateUiLiteral(language, 'No evidence loaded yet. Record an update or load recent observations.')}
                  </PhoneEmptyState>
                )}
              </div>
            </PhoneSection>
            ) : null}
            <PhoneSurface className="grid gap-2" slot="phone-explain-wide-boundary">
              <p className="text-sm font-semibold text-foreground">{translateUiLiteral(language, 'Full workbench needs a wider view.')}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, 'This phone summary still shows model posture, signals, fragile entities, and recent evidence.')}
              </p>
              <Button asChild className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
                <Link to="/insights/explain">
                  {translateUiLiteral(language, 'Open wide workbench')}
                </Link>
              </Button>
            </PhoneSurface>
          </>
        ) : null}
        <PhoneActionRow icon={<StatusInsightIcon data-icon="inline-start" />} to="/insights">
          {translateUiLiteral(language, 'Back to insights')}
        </PhoneActionRow>
      </PhonePage>
    );
  }

  return (
    <PhonePage slot="phone-insights-page">
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Insights')}
        title={translateUiLiteral(language, 'Choose an operating lens')}
      />
      <PhoneSurface className="grid gap-3" slot="phone-insights-menu">
        <PhoneActionRow icon={<StatusInsightIcon data-icon="inline-start" />} to="/insights/inventory">
          {translateUiLiteral(language, 'Inventory')}
        </PhoneActionRow>
        <PhoneActionRow icon={<StatusInsightIcon data-icon="inline-start" />} to="/insights/money">
          {translateUiLiteral(language, 'Money')}
        </PhoneActionRow>
        <PhoneActionRow icon={<StatusInsightIcon data-icon="inline-start" />} to="/insights/explain">
          {translateUiLiteral(language, 'Explain')}
        </PhoneActionRow>
      </PhoneSurface>
    </PhonePage>
  );
}

function PhoneHistoryRoute() {
  const { language } = usePreferences();
  const inventory = useInventory();
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const [selectedEntry, setSelectedEntry] = useState<PhoneHistoryEntry | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const entries = useMemo(
    () => buildPhoneHistoryEntries(inventory.observations ?? [], catalog),
    [catalog, inventory.observations],
  );
  const groups: PhoneHistoryGroup[] = [
    'Products Update',
    'Customer Orders Pending',
    'Customer Orders Completed',
    'Supplier Orders Pending',
    'Supplier Receipts',
    'Corrections',
    'Price/cost changes',
  ];
  const refreshHistory = async () => {
    setHistoryRefreshing(true);
    setHistoryError(null);
    try {
      await inventory.loadSenaObservations();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : translateUiLiteral(language, 'Unable to refresh update history.'));
    } finally {
      setHistoryRefreshing(false);
    }
  };

  if (inventory.isLoading && !inventory.catalog) {
    return (
      <PhonePage slot="phone-history-page">
        <PhonePageHeader
          eyebrow={translateUiLiteral(language, 'Settings')}
          title={translateUiLiteral(language, 'Update history')}
        />
        <PhoneLoadingState
          title={translateUiLiteral(language, 'Loading update history…')}
          detail={translateUiLiteral(language, 'Preparing saved stock counts, customer work, supplier work, and corrections.')}
        />
      </PhonePage>
    );
  }

  return (
    <PhonePage slot="phone-history-page">
      {selectedEntry ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/30 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]" data-slot="phone-history-detail-sheet">
          <PhoneSurface className="w-full max-w-md justify-self-center bg-background">
            <div className="grid gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {translateUiLiteral(language, selectedEntry.group)}
                </p>
                <h2 className="mt-1 text-lg font-semibold leading-tight text-foreground">
                  {selectedEntry.entity}
                </h2>
              </div>
              <div className="grid gap-2 text-sm leading-6 text-muted-foreground">
                <p>{translateUiLiteral(language, selectedEntry.detail)}</p>
                <p>{translateUiLiteral(language, 'State layer changed')}: {translateUiLiteral(language, selectedEntry.layer)}</p>
                <p>{translateUiLiteral(language, 'Saved')}: {selectedEntry.time}</p>
                {selectedEntry.quantity ? <p>{translateUiLiteral(language, 'Quantity')}: {selectedEntry.quantity}</p> : null}
              </div>
              <Button data-design-icon-exempt type="button" variant="outline" onClick={() => setSelectedEntry(null)}>
                {translateUiLiteral(language, 'Close')}
              </Button>
            </div>
          </PhoneSurface>
        </div>
      ) : null}
      <PhonePageHeader
        eyebrow={translateUiLiteral(language, 'Settings')}
        title={translateUiLiteral(language, 'Update history')}
      />
      <PhoneSurface className="grid gap-2" slot="phone-history-summary">
        <PhoneMetric
          label={translateUiLiteral(language, 'Recent facts')}
          value={entries.length}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          {translateUiLiteral(language, entries.length > 0
            ? 'Recent saved facts are grouped by the state layer they changed.'
            : 'No recent saved facts are available yet. Capture an update to start history.')}
        </p>
        <Button className="min-h-12 rounded-[0.8rem]" disabled={historyRefreshing} type="button" variant="outline" onClick={() => void refreshHistory()}>
          <NavigationListIcon data-icon="inline-start" />
          {translateUiLiteral(language, historyRefreshing ? 'Refreshing…' : 'Refresh history')}
        </Button>
        {historyError ? (
          <div className="grid gap-3 rounded-[0.8rem] border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm leading-6 text-destructive" data-slot="phone-history-refresh-error">
            <div>
              <p className="font-semibold">{translateUiLiteral(language, 'Unable to refresh update history.')}</p>
              <p className="mt-1 text-destructive/85">
                {historyError} {translateUiLiteral(language, 'Existing saved facts stay visible. Retry or open safety if local data looks unavailable.')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt disabled={historyRefreshing} type="button" variant="outline" onClick={() => void refreshHistory()}>
                {translateUiLiteral(language, 'Retry')}
              </Button>
              <Button asChild className="min-h-11 rounded-[0.8rem]" data-design-icon-exempt variant="outline">
                <Link to="/settings">
                  {translateUiLiteral(language, 'Open safety')}
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </PhoneSurface>
      {entries.length > 0 ? (
        <div className="grid gap-4" data-slot="phone-history-grouped-list">
          {groups.map((group) => {
            const groupEntries = entries.filter((entry) => entry.group === group);
            if (groupEntries.length === 0) {
              return null;
            }
            return (
              <PhoneSection
                key={group}
                title={translateUiLiteral(language, group)}
                action={<span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{groupEntries.length}</span>}
              >
                <div className="grid gap-2">
                  {groupEntries.map((entry) => (
                    <PhoneListItem
                      key={entry.id}
                      actionLabel={entry.quantity ?? translateUiLiteral(language, 'Open')}
                      detail={entry.detail}
                      label={entry.entity}
                      meta={`${entry.time} · ${translateUiLiteral(language, entry.layer)}`}
                      onClick={() => setSelectedEntry(entry)}
                    />
                  ))}
                </div>
              </PhoneSection>
            );
          })}
        </div>
      ) : (
        <PhoneEmptyState>
          {translateUiLiteral(language, 'No stock counts, customer orders, supplier receipts, corrections, or price changes have been saved yet.')}
        </PhoneEmptyState>
      )}
      <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={RECORD_UPDATE_HUB_PATH}>
        {translateUiLiteral(language, 'Capture update')}
      </PhoneActionRow>
      <PhoneActionRow icon={<NavigationSettingsIcon data-icon="inline-start" />} to="/settings">
        {translateUiLiteral(language, 'Back to safety')}
      </PhoneActionRow>
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
        <div className="grid gap-2" data-slot="phone-wide-only-safe-links">
          <PhoneActionRow icon={<NavigationDashboardIcon data-icon="inline-start" />} to="/">
            {translateUiLiteral(language, 'Today')}
          </PhoneActionRow>
          <PhoneActionRow icon={<NavigationTaskListIcon data-icon="inline-start" />} to={buildRememberedInboxHref()}>
            {translateUiLiteral(language, 'Queue')}
          </PhoneActionRow>
          <PhoneActionRow icon={<ActionCreatePackageIcon data-icon="inline-start" />} to={RECORD_UPDATE_HUB_PATH}>
            {translateUiLiteral(language, 'Capture')}
          </PhoneActionRow>
          <PhoneActionRow icon={<NavigationCatalogIcon data-icon="inline-start" />} to={buildRememberedCatalogHref()}>
            {translateUiLiteral(language, 'Products')}
          </PhoneActionRow>
          <PhoneActionRow icon={<StatusInsightIcon data-icon="inline-start" />} to="/insights">
            {translateUiLiteral(language, 'Insights')}
          </PhoneActionRow>
        </div>
      </PhoneSurface>
    </div>
  );
}

function PhoneChrome({
  children,
  mode,
  onExport,
  onImport,
  onReset,
  storage,
}: {
  children: ReactNode;
} & EmbeddedPhoneAppProps) {
  const location = useLocation();
  const { language } = usePreferences();
  const inventory = useInventory();
  const tabs = phoneTabs(language);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const ready = storage.status === 'ready';
  const resetLabel = mode === 'demo' ? 'Reset demo' : 'Reset workspace';
  const isDeepCaptureRoute = location.pathname.startsWith('/work/capture/');
  const isOnboardingRoute = location.pathname.startsWith('/onboarding');
  const isSettingsRoute = location.pathname.startsWith('/settings');
  const captureBackHref = sanitizePhoneReturnTo(new URLSearchParams(location.search).get('returnTo'), RECORD_UPDATE_HUB_PATH);
  const shellHeader = phoneShellHeaderCopy(location.pathname, language, activeSenaCatalog(inventory.catalog) ?? inventory.catalog);

  useEffect(() => {
    const scrollRoot = document.querySelector<HTMLElement>('[data-slot="embedded-auto-zoom-viewport"]');
    if (!scrollRoot) {
      return;
    }
    if (typeof scrollRoot.scrollTo === 'function') {
      scrollRoot.scrollTo(0, 0);
      return;
    }
    scrollRoot.scrollTop = 0;
    scrollRoot.scrollLeft = 0;
  }, [location.pathname]);

  useEffect(() => {
    setUtilityOpen(false);
    setConfirmingReset(false);
  }, [location.pathname]);

  return (
    <div
      className="grid min-h-[var(--kaur-khor-embedded-effective-height,100dvh)] max-w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-x-clip overscroll-contain bg-background text-foreground"
      data-language={language}
      data-slot="embedded-phone-shell"
      lang={language === 'km' ? 'km' : 'en'}
    >
      {utilityOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-foreground/30 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]" data-slot="phone-utility-safety-sheet">
          <PhoneSurface className="w-full max-w-md justify-self-center bg-background">
            <div className="grid gap-3">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[0.8rem] bg-secondary text-secondary-foreground">
                  <StatusWarningIcon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">
                    {translateUiLiteral(language, 'Workspace safety')}
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
              <PhoneStorageFeedback mode={mode} storage={storage} />
              <div className="grid gap-2">
                <PhoneActionRow disabled={!ready} icon={<ActionExportIcon data-icon="inline-start" />} onClick={onExport}>
                  {translateUiLiteral(language, 'Export backup')}
                </PhoneActionRow>
                <PhoneActionRow disabled={!ready} icon={<ActionDatabaseUploadIcon data-icon="inline-start" />} onClick={() => importInputRef.current?.click()}>
                  {translateUiLiteral(language, 'Import backup')}
                </PhoneActionRow>
                <PhoneActionRow icon={<NavigationSettingsIcon data-icon="inline-start" />} to="/settings">
                  {translateUiLiteral(language, 'Open settings')}
                </PhoneActionRow>
                <PhoneActionRow icon={<NavigationListIcon data-icon="inline-start" />} to="/settings/help">
                  {translateUiLiteral(language, 'Open help')}
                </PhoneActionRow>
                <PhoneActionRow className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" icon={<ActionResetIcon data-icon="inline-start" />} onClick={() => setConfirmingReset(true)}>
                  {translateUiLiteral(language, resetLabel)}
                </PhoneActionRow>
                <Button data-design-icon-exempt type="button" variant="outline" onClick={() => setUtilityOpen(false)}>
                  {translateUiLiteral(language, 'Close')}
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
            </div>
          </PhoneSurface>
        </div>
      ) : null}
      {confirmingReset ? (
        <div className="fixed inset-0 z-[60] grid place-items-end bg-foreground/30 px-4 pb-[max(env(safe-area-inset-bottom),1rem)]" data-slot="phone-reset-confirmation">
          <PhoneSurface className="w-full max-w-md justify-self-center border-destructive/30 bg-background">
            <div className="grid gap-3">
              <div className="grid gap-1">
                <p className="text-sm font-semibold text-destructive">
                  {translateUiLiteral(language, resetLabel)}
                </p>
                <h2 className="text-lg font-semibold leading-tight text-foreground">
                  {translateUiLiteral(language, mode === 'demo' ? 'Reset this demo workspace?' : 'Reset this browser workspace?')}
                </h2>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(
                  language,
                  mode === 'demo'
                    ? 'This removes the current demo changes and restores sample data. Export first if you want to keep this demo state. This action cannot be undone.'
                    : 'This removes local browser workspace data from this device. Export a backup first if you need this data. This action cannot be undone.',
                )}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button data-design-icon-exempt type="button" variant="outline" onClick={() => setConfirmingReset(false)}>
                  {translateUiLiteral(language, 'Cancel')}
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-design-icon-exempt
                  type="button"
                  onClick={() => {
                    setConfirmingReset(false);
                    setUtilityOpen(false);
                    onReset({ skipBrowserConfirm: true });
                  }}
                >
                  {translateUiLiteral(language, resetLabel)}
                </Button>
              </div>
            </div>
          </PhoneSurface>
        </div>
      ) : null}
      <a
        className="sr-only fixed top-4 left-4 z-50 rounded-full bg-card px-4 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-float)] focus:not-sr-only"
        href="#main-content"
      >
        {translateUiLiteral(language, 'Skip to content')}
      </a>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/92 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur" data-slot="embedded-phone-header">
        <div className={cn(isDeepCaptureRoute ? 'flex flex-wrap items-start gap-x-3 gap-y-2' : 'flex items-start justify-between gap-3')}>
          <div className={cn('min-w-0', isDeepCaptureRoute && 'flex-[999_0_max-content] max-w-full')}>
            {!isDeepCaptureRoute ? (
              <p className="khmer-safe-eyebrow text-xs font-semibold uppercase tracking-[0.14em] text-primary" data-slot="embedded-phone-header-eyebrow">
                {shellHeader.eyebrow}
              </p>
            ) : null}
            {isDeepCaptureRoute ? (
              <h1 className="khmer-safe-display flex min-w-0 items-center gap-2 text-[1.7rem] font-semibold leading-[1.12] tracking-normal text-foreground" data-slot="embedded-phone-header-title">
                <Button asChild aria-label={translateUiLiteral(language, 'Back')} className="size-9 shrink-0 rounded-full p-0" size="icon" variant="ghost">
                  <Link to={captureBackHref}>
                    <NavigationBackIcon aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
                <span className="min-w-fit max-w-full whitespace-nowrap">
                  {shellHeader.title}
                  <span
                    className="ml-2 align-baseline text-sm font-medium leading-5 text-muted-foreground"
                    data-slot="embedded-phone-capture-header-title-meta"
                  />
                </span>
              </h1>
            ) : (
              <p className="khmer-safe-display flex min-w-0 items-center gap-2 text-[1.7rem] font-semibold leading-[1.12] tracking-normal text-foreground" data-slot="embedded-phone-header-title">
                <span className="min-w-0 truncate">{shellHeader.title}</span>
              </p>
            )}
          </div>
          {isDeepCaptureRoute ? (
            <>
              <div className="flex min-w-[min(100%,26rem)] flex-[1_1_26rem] shrink-0 flex-wrap items-start justify-end gap-2 [&_[data-slot=workspace-action-row]]:gap-2 [&_[data-slot=workspace-action-row]]:[&>span]:inline-flex [&_button]:min-h-10 [&_button]:rounded-full [&_button]:px-3 [&_button]:text-sm" data-slot="embedded-phone-capture-header-actions" />
              <div className="min-w-0 text-sm leading-5 text-muted-foreground [&_p]:max-w-none" data-slot="embedded-phone-capture-header-meta" />
            </>
          ) : isSettingsRoute ? null : (
            <Button
              aria-label={translateUiLiteral(language, 'Workspace safety')}
              className="size-11 rounded-[0.8rem] border-border/70 bg-card"
              size="icon"
              type="button"
              variant="outline"
              onClick={() => setUtilityOpen(true)}
            >
              <NavigationSettingsIcon aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </header>
      <main
        id="main-content"
        className={cn('min-w-0 max-w-full overflow-x-clip px-4', isOnboardingRoute ? 'grid items-center pt-0' : 'pt-4', isDeepCaptureRoute ? 'row-start-2' : 'row-start-3')}
        data-slot="embedded-phone-main"
        style={{ paddingBottom: isOnboardingRoute ? 0 : 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <PhoneWorkspaceErrorBanner />
        {children}
      </main>
      {!isDeepCaptureRoute ? (
        <nav
          aria-label={translateUiLiteral(language, 'Phone navigation')}
          className="sticky bottom-0 z-40 row-start-4 h-fit self-end border-t border-border/70 bg-background/95 px-2 pt-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-12px_30px_rgba(27,15,7,0.10)] backdrop-blur"
          data-slot="embedded-phone-bottom-nav"
        >
          <div className={cn('grid gap-1', tabs.length === 4 ? 'grid-cols-4' : 'grid-cols-5')}>
            {tabs.map((tab) => {
              const active = tab.matches(location.pathname);
              return <PhoneBottomNavItem key={tab.id} active={active} tab={tab} />;
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function PhoneRoutes(props: EmbeddedPhoneAppProps) {
  return (
    <PhoneChrome {...props}>
      <Routes>
        <Route element={<PhoneTodayRoute storage={props.storage} />} path="/" />
        <Route element={<OnboardingRoute allowCompleted />} path="/onboarding" />
        <Route element={<Navigate replace to="/work/queue" />} path="/work" />
        <Route element={<PhoneQueueRoute />} path="/work/queue" />
        <Route element={<PhoneCaptureRoute />} path="/work/capture" />
        {PHONE_CAPTURE_ROUTE_PATHS.map((path) => (
          <Route key={path} element={<PhoneCaptureRoute />} path={path} />
        ))}
        <Route element={<Navigate replace to="/work/capture/stock-count" />} path="/work/capture/custom/*" />
        <Route element={<PhoneWideOnlyRoute />} path="/work/*" />
        <Route element={<PhoneSkuDetailRoute />} path="/catalog/skus/:skuId" />
        <Route element={<PhoneServiceDetailRoute />} path="/catalog/services/:serviceId" />
        <Route element={<PhoneProductsRoute />} path="/catalog" />
        <Route element={<PhoneWideOnlyRoute />} path="/catalog/*" />
        <Route element={<PhoneSafetyRoute {...props} />} path="/settings" />
        <Route element={<PhoneHistoryRoute />} path="/settings/history" />
        <Route element={<PhoneHelpRoute />} path="/settings/help" />
        <Route element={<PhoneWideOnlyRoute />} path="/settings/*" />
        <Route element={<PhoneInsightsRoute />} path="/insights" />
        <Route element={<PhoneInsightsRoute />} path="/insights/inventory" />
        <Route element={<PhoneInsightsRoute />} path="/insights/money" />
        <Route element={<PhoneInsightsRoute />} path="/insights/explain" />
        <Route element={<PhoneWideOnlyRoute />} path="/insights/*" />
        <Route element={<PhoneWideOnlyRoute />} path="*" />
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
      <PhoneRoutes {...props} />
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
