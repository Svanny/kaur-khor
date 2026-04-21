import type { AppCurrency, AppLanguage } from '@shared/inventory';
import type {
  AutomationConversationSummary,
  AutomationExposureRow,
  AutomationIntakeLine,
  AutomationOrderIntake,
  AutomationWorkspace,
} from '@shared/automation';
import { formatCurrency } from '@/lib/format';
import { buildAutomationHref } from '@/lib/navigation-state';
import type { StatusPillTone } from '@/lib/state-tones';

export type AutomationRibbonMetric = {
  key:
    | 'connection'
    | 'ordersToday'
    | 'needsReview'
    | 'ticketedToday'
    | 'exposedSellables';
  label: string;
  value: string;
  detail: string;
  tone: StatusPillTone;
  href: string;
};

export type AutomationIntakeTableRow = {
  intakeId: string;
  conversationId: string;
  customerLabel: string;
  customerMeta: string | null;
  requestLabel: string;
  quoteLabel: string | null;
  statusLabel: string;
  statusTone: StatusPillTone;
  createdLabel: string;
  actionLabel: string;
  href: string;
  ticketHref: string | null;
};

export type AutomationExceptionRow = {
  intakeId: string;
  conversationId: string;
  customerLabel: string;
  issueLabel: string;
  messageSnippet: string;
  confidenceLabel: string;
  confidenceTone: StatusPillTone;
  href: string;
};

export type AutomationRailRow = {
  id: string;
  label: string;
  detail: string;
  valueLabel?: string | null;
  valueTone?: StatusPillTone | null;
  href: string;
};

function literalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function relativeTime(value: string) {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) {
    return value;
  }
  const deltaMs = Date.now() - target;
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (Math.abs(deltaMinutes) < 60) {
    return `${Math.max(1, Math.abs(deltaMinutes))}m ago`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return `${Math.max(1, Math.abs(deltaHours))}h ago`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return `${Math.max(1, Math.abs(deltaDays))}d ago`;
}

function connectionTone(status: AutomationWorkspace['connection']['status']): StatusPillTone {
  switch (status) {
    case 'connected':
      return 'success';
    case 'paused':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

function intakeStatusLabel(status: AutomationOrderIntake['status']) {
  switch (status) {
    case 'needs_review':
      return 'Needs review';
    case 'quoted':
      return 'Quoted';
    case 'ticketed':
      return 'Ticketed';
    case 'completed':
      return 'Completed';
    case 'canceled':
      return 'Canceled';
    case 'failed':
      return 'Failed';
    default:
      return 'New';
  }
}

function intakeStatusTone(status: AutomationOrderIntake['status']): StatusPillTone {
  switch (status) {
    case 'quoted':
      return 'info';
    case 'ticketed':
    case 'completed':
      return 'success';
    case 'needs_review':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'canceled':
      return 'neutral';
    default:
      return 'orange';
  }
}

function confidenceTone(confidence: AutomationOrderIntake['parseConfidence'] | null): StatusPillTone {
  switch (confidence) {
    case 'high':
      return 'success';
    case 'medium':
      return 'warning';
    case 'low':
      return 'danger';
    default:
      return 'neutral';
  }
}

function requestSummary(lines: AutomationIntakeLine[]) {
  const visible = lines.slice(0, 2).map((line) => {
    const quantity = line.quantity != null ? `${line.quantity} x ` : '';
    return `${quantity}${line.resolvedLabel ?? line.requestedLabel}`;
  });
  const overflow = lines.length - visible.length;
  return overflow > 0 ? `${visible.join(', ')} +${overflow} more` : visible.join(', ');
}

function issueLabel(intake: AutomationOrderIntake) {
  return intake.lines.find((line) => line.ambiguityReason)?.ambiguityReason?.replaceAll('_', ' ') ?? 'Parser review';
}

function customerLabel(intake: AutomationOrderIntake | AutomationConversationSummary) {
  return intake.customerDisplayName ?? intake.customerHandle ?? intake.phone ?? 'Telegram customer';
}

function customerMeta(intake: AutomationOrderIntake) {
  return [intake.customerHandle, intake.phone].filter(Boolean).join(' · ') || null;
}

function actionLabel(intake: AutomationOrderIntake) {
  switch (intake.status) {
    case 'quoted':
      return 'Create ticket';
    case 'ticketed':
    case 'completed':
      return 'Open ticket';
    case 'canceled':
      return 'View';
    default:
      return 'Review';
  }
}

function formatMoney(value: number | null, currency: AppCurrency, language: AppLanguage, usdToKhrExchangeRate: number) {
  if (value == null) {
    return null;
  }
  return formatCurrency(value, currency, language, usdToKhrExchangeRate);
}

export function deriveAutomationViewModel({
  currentSearchParams,
  currency,
  language,
  usdToKhrExchangeRate,
  workspace,
}: {
  currentSearchParams: URLSearchParams;
  currency: AppCurrency;
  language: AppLanguage;
  usdToKhrExchangeRate: number;
  workspace: AutomationWorkspace;
}) {
  const ribbon: AutomationRibbonMetric[] = [
    {
      key: 'connection',
      label: 'Connection',
      value: workspace.connection.status === 'connected'
        ? 'Connected'
        : workspace.connection.status === 'paused'
          ? 'Paused'
          : workspace.connection.status === 'error'
            ? 'Error'
            : 'Disconnected',
      detail: workspace.connection.lastWebhookAt ? `Last webhook ${relativeTime(workspace.connection.lastWebhookAt)}` : 'No webhook yet',
      tone: connectionTone(workspace.connection.status),
      href: buildAutomationHref({ section: 'overview' }, currentSearchParams),
    },
    {
      key: 'ordersToday',
      label: 'Orders today',
      value: String(workspace.metrics.ordersToday),
      detail: 'Telegram intake started today',
      tone: workspace.metrics.ordersToday > 0 ? 'info' : 'neutral',
      href: buildAutomationHref({ section: 'intake' }, currentSearchParams),
    },
    {
      key: 'needsReview',
      label: 'Need review',
      value: String(workspace.metrics.needsReview),
      detail: 'Unsafe or ambiguous intake',
      tone: workspace.metrics.needsReview > 0 ? 'warning' : 'neutral',
      href: buildAutomationHref({ section: 'exceptions', intakeFilter: 'needs_review' }, currentSearchParams),
    },
    {
      key: 'ticketedToday',
      label: 'Ticketed today',
      value: String(workspace.metrics.ticketedToday),
      detail: 'Promoted into banj tickets',
      tone: workspace.metrics.ticketedToday > 0 ? 'success' : 'neutral',
      href: buildAutomationHref({ section: 'intake', intakeFilter: 'ticketed' }, currentSearchParams),
    },
    {
      key: 'exposedSellables',
      label: 'Exposed sellables',
      value: String(workspace.metrics.exposedSellables),
      detail: 'Telegram-visible customer offers',
      tone: workspace.metrics.exposedSellables > 0 ? 'info' : 'neutral',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
  ];

  const intakeRows: AutomationIntakeTableRow[] = workspace.intakes.map((intake) => ({
    intakeId: intake.intakeId,
    conversationId: intake.conversationId,
    customerLabel: customerLabel(intake),
    customerMeta: customerMeta(intake),
    requestLabel: requestSummary(intake.lines),
    quoteLabel: formatMoney(intake.quotedTotal, currency, language, usdToKhrExchangeRate),
    statusLabel: intakeStatusLabel(intake.status),
    statusTone: intakeStatusTone(intake.status),
    createdLabel: `Created ${literalTime(intake.createdAt)} · updated ${relativeTime(intake.updatedAt)}`,
    actionLabel: actionLabel(intake),
    href: buildAutomationHref({
      section: intake.status === 'needs_review' || intake.status === 'failed' ? 'exceptions' : 'intake',
      conversationId: intake.conversationId,
      intakeId: intake.intakeId,
      ticketId: intake.promotedTicketId,
    }, currentSearchParams),
    ticketHref: intake.promotedTicketId
      ? `/record-update/customer-orders-pending?ticketMode=edit&ticketId=${encodeURIComponent(intake.promotedTicketId)}`
      : null,
  }));

  const exceptionRows: AutomationExceptionRow[] = workspace.intakes
    .filter((intake) => intake.status === 'needs_review' || intake.status === 'failed' || intake.parseConfidence === 'low' || intake.lines.some((line) => line.ambiguityReason))
    .map((intake) => ({
      intakeId: intake.intakeId,
      conversationId: intake.conversationId,
      customerLabel: customerLabel(intake),
      issueLabel: issueLabel(intake),
      messageSnippet: intake.notes ?? requestSummary(intake.lines),
      confidenceLabel: intake.parseConfidence.toUpperCase(),
      confidenceTone: confidenceTone(intake.parseConfidence),
      href: buildAutomationHref({
        section: 'exceptions',
        conversationId: intake.conversationId,
        intakeId: intake.intakeId,
      }, currentSearchParams),
    }));

  const recentActivity: AutomationRailRow[] = workspace.intakes.slice(0, 5).map((intake) => ({
    id: intake.intakeId,
    label:
      intake.status === 'ticketed'
        ? 'Promoted Telegram intake to customer ticket'
        : intake.status === 'canceled'
          ? 'Canceled ambiguous request'
          : intake.status === 'quoted'
            ? `Created quote for ${customerLabel(intake)}`
            : `Received Telegram intake from ${customerLabel(intake)}`,
    detail: relativeTime(intake.updatedAt),
    valueLabel: formatMoney(intake.quotedTotal, currency, language, usdToKhrExchangeRate),
    valueTone: intakeStatusTone(intake.status),
    href: buildAutomationHref({
      section: intake.status === 'needs_review' ? 'exceptions' : 'intake',
      conversationId: intake.conversationId,
      intakeId: intake.intakeId,
    }, currentSearchParams),
  }));

  const coverage: AutomationRailRow[] = [
    {
      id: 'coverage-services',
      label: 'Exposed services',
      detail: 'Customer-visible service offers',
      valueLabel: String(workspace.exposures.filter((row) => row.entityType === 'service' && row.exposed).length),
      valueTone: 'info',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
    {
      id: 'coverage-skus',
      label: 'Exposed SKUs',
      detail: 'Customer-visible product SKUs',
      valueLabel: String(workspace.exposures.filter((row) => row.entityType === 'sku' && row.exposed).length),
      valueTone: 'info',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
    {
      id: 'coverage-hidden',
      label: 'Hidden sellables',
      detail: 'Not currently exposed to Telegram',
      valueLabel: String(workspace.exposures.filter((row) => !row.exposed).length),
      valueTone: 'neutral',
      href: buildAutomationHref({ section: 'catalog', exposure: 'hidden' }, currentSearchParams),
    },
    {
      id: 'coverage-unavailable',
      label: 'Unavailable but exposed',
      detail: 'Needs operator attention',
      valueLabel: String(workspace.exposures.filter((row) => row.exposed && row.availabilityStatus === 'unavailable').length),
      valueTone: 'warning',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
  ];

  const today: AutomationRailRow[] = [
    {
      id: 'today-orders',
      label: 'Orders today',
      detail: 'New Telegram intake',
      valueLabel: String(workspace.metrics.ordersToday),
      valueTone: workspace.metrics.ordersToday > 0 ? 'info' : 'neutral',
      href: buildAutomationHref({ section: 'intake' }, currentSearchParams),
    },
    {
      id: 'today-review',
      label: 'Needs review',
      detail: 'Unsafe or ambiguous intake',
      valueLabel: String(workspace.metrics.needsReview),
      valueTone: workspace.metrics.needsReview > 0 ? 'warning' : 'neutral',
      href: buildAutomationHref({ section: 'exceptions' }, currentSearchParams),
    },
    {
      id: 'today-quoted',
      label: 'Quoted',
      detail: 'Ready for operator confirmation',
      valueLabel: String(workspace.metrics.quotedToday),
      valueTone: workspace.metrics.quotedToday > 0 ? 'info' : 'neutral',
      href: buildAutomationHref({ section: 'intake', intakeFilter: 'quoted' }, currentSearchParams),
    },
    {
      id: 'today-completed',
      label: 'Completed',
      detail: 'Closed Telegram-origin customer work',
      valueLabel: String(workspace.metrics.completedToday),
      valueTone: workspace.metrics.completedToday > 0 ? 'success' : 'neutral',
      href: buildAutomationHref({ section: 'intake', intakeFilter: 'completed' }, currentSearchParams),
    },
  ];

  return {
    coverage,
    exceptionRows,
    intakeRows,
    recentActivity,
    ribbon,
    today,
  };
}
