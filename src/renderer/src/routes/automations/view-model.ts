import type { AppCurrency, AppLanguage } from '@shared/inventory';
import type {
  AutomationConversationSummary,
  AutomationExposureRow,
  AutomationIntakeLine,
  AutomationOrderIntake,
  AutomationWorkspace,
} from '@shared/automation';
import { formatPhoneForDisplay } from '@shared/phone';
import { formatCurrency } from '@/lib/formatting/format';
import { buildAutomationHref, buildOverviewHref } from '@/lib/navigation/navigation-state';
import type { StatusPillTone } from '@/lib/ui/state-tones';
import { translateUiLiteral } from '@/lib/localization/translations';

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
  overviewHref: string;
};

export type AutomationExceptionRow = {
  intakeId: string;
  conversationId: string;
  customerLabel: string;
  issueLabel: string;
  messageSnippet: string;
  confidenceLabel: string;
  confidenceTone: StatusPillTone;
  actionLabel: string;
  href: string;
  ticketHref: string | null;
  overviewHref: string;
};

export type AutomationRailRow = {
  id: string;
  conversationId?: string | null;
  label: string;
  detail: string;
  intakeId?: string | null;
  valueLabel?: string | null;
  valueTone?: StatusPillTone | null;
  href: string;
  overviewHref?: string | null;
};

function literal(language: AppLanguage, englishTemplate: string, variables?: Record<string, string | number | null | undefined>) {
  return translateUiLiteral(language, englishTemplate, variables);
}

function localeForLanguage(language: AppLanguage) {
  return language === 'km' ? 'km-KH' : 'en-US';
}

function literalTime(value: string, language: AppLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(localeForLanguage(language), {
    hour: 'numeric',
    hour12: false,
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function relativeTime(value: string, language: AppLanguage) {
  const target = new Date(value).getTime();
  if (!Number.isFinite(target)) {
    return value;
  }
  const deltaMs = Date.now() - target;
  const deltaMinutes = Math.round(deltaMs / 60_000);
  if (Math.abs(deltaMinutes) < 60) {
    return literal(language, '{count}m ago', { count: Math.max(1, Math.abs(deltaMinutes)) });
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return literal(language, '{count}h ago', { count: Math.max(1, Math.abs(deltaHours)) });
  }
  const deltaDays = Math.round(deltaHours / 24);
  return literal(language, '{count}d ago', { count: Math.max(1, Math.abs(deltaDays)) });
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

function connectionLabel(status: AutomationWorkspace['connection']['status'], language: AppLanguage) {
  if (status === 'connected') {
    return literal(language, 'Connected');
  }
  if (status === 'paused') {
    return literal(language, 'Paused');
  }
  if (status === 'error') {
    return literal(language, 'Error');
  }
  return literal(language, 'Disconnected');
}

function intakeStatusLabel(status: AutomationOrderIntake['status'], language: AppLanguage) {
  switch (status) {
    case 'needs_review':
      return literal(language, 'Needs review');
    case 'quoted':
      return literal(language, 'Quoted');
    case 'ticketed':
      return literal(language, 'Ticketed');
    case 'completed':
      return literal(language, 'Completed');
    case 'canceled':
      return literal(language, 'Canceled');
    case 'failed':
      return literal(language, 'Failed');
    default:
      return literal(language, 'New');
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

function requestSummary(lines: AutomationIntakeLine[], language: AppLanguage) {
  const visible = lines.slice(0, 2).map((line) => {
    const label = line.resolvedLabel ?? line.requestedLabel;
    return line.quantity != null
      ? literal(language, '{quantity} x {label}', { label, quantity: line.quantity })
      : label;
  });
  const overflow = lines.length - visible.length;
  return overflow > 0
    ? literal(language, '{items} +{overflow} more', { items: visible.join(', '), overflow })
    : visible.join(', ');
}

function issueLabel(intake: AutomationOrderIntake, language: AppLanguage) {
  const issue = intake.lines.find((line) => line.ambiguityReason)?.ambiguityReason;
  if (issue === 'item_not_found') {
    return literal(language, 'Item not found');
  }
  if (issue === 'availability_unknown') {
    return literal(language, 'Availability unknown');
  }
  if (issue === 'quantity_ambiguous') {
    return literal(language, 'Quantity ambiguous');
  }
  if (issue === 'parser_failed') {
    return literal(language, 'Parser failed');
  }
  return literal(language, 'Parser review');
}

function customerLabel(intake: AutomationOrderIntake | AutomationConversationSummary, language: AppLanguage) {
  return (intake.customerDisplayName ?? intake.customerHandle ?? formatPhoneForDisplay(intake.phone)) || literal(language, 'Telegram customer');
}

function customerMeta(intake: AutomationOrderIntake) {
  return [intake.customerHandle, formatPhoneForDisplay(intake.phone)].filter(Boolean).join(' · ') || null;
}

function actionLabel(intake: AutomationOrderIntake, language: AppLanguage) {
  return intake.promotedTicketId ? literal(language, 'Open ticket') : literal(language, 'Open intake');
}

function overviewCustomerFilterForIntake(status: AutomationOrderIntake['status']) {
  switch (status) {
    case 'new':
    case 'needs_review':
    case 'failed':
      return 'review' as const;
    case 'quoted':
      return 'quoted' as const;
    case 'ticketed':
      return 'open' as const;
    case 'completed':
    case 'canceled':
      return 'closed' as const;
    default:
      return 'review' as const;
  }
}

function buildOverviewTaskHref(intake: AutomationOrderIntake) {
  return buildOverviewHref({
    workflow: 'customer',
    customerFilter: overviewCustomerFilterForIntake(intake.status),
    customerTaskId: `automation:intake:${intake.intakeId}`,
  });
}

function formatMoney(value: number | null, currency: AppCurrency, language: AppLanguage, usdToKhrExchangeRate: number) {
  if (value == null || !Number.isFinite(value)) {
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
      label: literal(language, 'Connection'),
      value: connectionLabel(workspace.connection.status, language),
      detail: workspace.connection.lastWebhookAt
        ? literal(language, 'Last webhook {time}', { time: relativeTime(workspace.connection.lastWebhookAt, language) })
        : literal(language, 'No webhook yet'),
      tone: connectionTone(workspace.connection.status),
      href: buildAutomationHref({ section: 'overview' }, currentSearchParams),
    },
    {
      key: 'ordersToday',
      label: literal(language, 'Orders today'),
      value: String(workspace.metrics.ordersToday),
      detail: literal(language, 'Telegram intake started today'),
      tone: workspace.metrics.ordersToday > 0 ? 'info' : 'neutral',
      href: buildAutomationHref({ section: 'intake' }, currentSearchParams),
    },
    {
      key: 'needsReview',
      label: literal(language, 'Need review'),
      value: String(workspace.metrics.needsReview),
      detail: literal(language, 'Unsafe or ambiguous intake'),
      tone: workspace.metrics.needsReview > 0 ? 'warning' : 'neutral',
      href: buildAutomationHref({ section: 'exceptions', intakeFilter: 'needs_review' }, currentSearchParams),
    },
    {
      key: 'ticketedToday',
      label: literal(language, 'Ticketed today'),
      value: String(workspace.metrics.ticketedToday),
      detail: literal(language, 'Promoted into Kaur Khor tickets'),
      tone: workspace.metrics.ticketedToday > 0 ? 'success' : 'neutral',
      href: buildAutomationHref({ section: 'intake', intakeFilter: 'ticketed' }, currentSearchParams),
    },
    {
      key: 'exposedSellables',
      label: literal(language, 'Exposed sellables'),
      value: String(workspace.metrics.exposedSellables),
      detail: literal(language, 'Telegram-visible customer offers'),
      tone: workspace.metrics.exposedSellables > 0 ? 'info' : 'neutral',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
  ];

  const intakeRows: AutomationIntakeTableRow[] = workspace.intakes.map((intake) => ({
    intakeId: intake.intakeId,
    conversationId: intake.conversationId,
    customerLabel: customerLabel(intake, language),
    customerMeta: customerMeta(intake),
    requestLabel: requestSummary(intake.lines, language),
    quoteLabel: formatMoney(intake.quotedTotal, currency, language, usdToKhrExchangeRate),
    statusLabel: intakeStatusLabel(intake.status, language),
    statusTone: intakeStatusTone(intake.status),
    createdLabel: literal(language, 'Created {created} · updated {updated}', {
      created: literalTime(intake.createdAt, language),
      updated: relativeTime(intake.updatedAt, language),
    }),
    actionLabel: actionLabel(intake, language),
    href: buildAutomationHref({
      section: intake.status === 'needs_review' || intake.status === 'failed' ? 'exceptions' : 'intake',
      conversationId: intake.conversationId,
      intakeId: intake.intakeId,
      ticketId: intake.promotedTicketId,
    }, currentSearchParams),
    overviewHref: buildOverviewTaskHref(intake),
    ticketHref: intake.promotedTicketId
      ? `/work/capture/customer-order?ticketMode=edit&ticketId=${encodeURIComponent(intake.promotedTicketId)}`
      : null,
  }));

  const exceptionRows: AutomationExceptionRow[] = workspace.intakes
    .filter((intake) => intake.status === 'needs_review' || intake.status === 'failed' || intake.parseConfidence === 'low' || intake.lines.some((line) => line.ambiguityReason))
    .map((intake) => ({
      intakeId: intake.intakeId,
      conversationId: intake.conversationId,
      customerLabel: customerLabel(intake, language),
      issueLabel: issueLabel(intake, language),
      messageSnippet: intake.notes ?? requestSummary(intake.lines, language),
      confidenceLabel: literal(language, intake.parseConfidence.toUpperCase()),
      confidenceTone: confidenceTone(intake.parseConfidence),
      actionLabel: actionLabel(intake, language),
      href: buildAutomationHref({
        section: 'exceptions',
        conversationId: intake.conversationId,
        intakeId: intake.intakeId,
      }, currentSearchParams),
      ticketHref: intake.promotedTicketId
        ? `/work/capture/customer-order?ticketMode=edit&ticketId=${encodeURIComponent(intake.promotedTicketId)}`
        : null,
      overviewHref: buildOverviewTaskHref(intake),
    }));

  const recentActivity: AutomationRailRow[] = workspace.intakes.slice(0, 5).map((intake) => ({
    id: intake.intakeId,
    conversationId: intake.conversationId,
    intakeId: intake.intakeId,
    label:
      intake.status === 'ticketed'
        ? literal(language, 'Promoted Telegram intake to customer ticket')
        : intake.status === 'canceled'
          ? literal(language, 'Canceled ambiguous request')
          : intake.status === 'quoted'
            ? literal(language, 'Created quote for {customer}', { customer: customerLabel(intake, language) })
            : literal(language, 'Received Telegram intake from {customer}', { customer: customerLabel(intake, language) }),
    detail: relativeTime(intake.updatedAt, language),
    valueLabel: formatMoney(intake.quotedTotal, currency, language, usdToKhrExchangeRate),
    valueTone: intakeStatusTone(intake.status),
    href: buildAutomationHref({
      section: intake.status === 'needs_review' ? 'exceptions' : 'intake',
      conversationId: intake.conversationId,
      intakeId: intake.intakeId,
    }, currentSearchParams),
    overviewHref: buildOverviewTaskHref(intake),
  }));

  const coverage: AutomationRailRow[] = [
    {
      id: 'coverage-services',
      label: literal(language, 'Exposed services'),
      detail: literal(language, 'Customer-visible service offers'),
      valueLabel: String(workspace.exposures.filter((row) => row.entityType === 'service' && row.exposed).length),
      valueTone: 'info',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
    {
      id: 'coverage-skus',
      label: literal(language, 'Exposed SKUs'),
      detail: literal(language, 'Customer-visible product SKUs'),
      valueLabel: String(workspace.exposures.filter((row) => row.entityType === 'sku' && row.exposed).length),
      valueTone: 'info',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
    {
      id: 'coverage-hidden',
      label: literal(language, 'Hidden sellables'),
      detail: literal(language, 'Not currently exposed to Telegram'),
      valueLabel: String(workspace.exposures.filter((row) => !row.exposed).length),
      valueTone: 'neutral',
      href: buildAutomationHref({ section: 'catalog', exposure: 'hidden' }, currentSearchParams),
    },
    {
      id: 'coverage-unavailable',
      label: literal(language, 'Unavailable but exposed'),
      detail: literal(language, 'Needs operator attention'),
      valueLabel: String(workspace.exposures.filter((row) => row.exposed && row.availabilityStatus === 'unavailable').length),
      valueTone: 'warning',
      href: buildAutomationHref({ section: 'catalog', exposure: 'exposed' }, currentSearchParams),
    },
  ];

  const today: AutomationRailRow[] = [
    {
      id: 'today-orders',
      label: literal(language, 'Orders today'),
      detail: literal(language, 'New Telegram intake'),
      valueLabel: String(workspace.metrics.ordersToday),
      valueTone: workspace.metrics.ordersToday > 0 ? 'info' : 'neutral',
      href: buildOverviewHref({ workflow: 'customer', customerFilter: 'review' }),
    },
    {
      id: 'today-review',
      label: literal(language, 'Needs review'),
      detail: literal(language, 'Unsafe or ambiguous intake'),
      valueLabel: String(workspace.metrics.needsReview),
      valueTone: workspace.metrics.needsReview > 0 ? 'warning' : 'neutral',
      href: buildOverviewHref({ workflow: 'customer', customerFilter: 'review' }),
    },
    {
      id: 'today-quoted',
      label: literal(language, 'Quoted'),
      detail: literal(language, 'Ready for operator confirmation'),
      valueLabel: String(workspace.metrics.quotedToday),
      valueTone: workspace.metrics.quotedToday > 0 ? 'info' : 'neutral',
      href: buildOverviewHref({ workflow: 'customer', customerFilter: 'quoted' }),
    },
    {
      id: 'today-completed',
      label: literal(language, 'Completed'),
      detail: literal(language, 'Closed Telegram-origin customer work'),
      valueLabel: String(workspace.metrics.completedToday),
      valueTone: workspace.metrics.completedToday > 0 ? 'success' : 'neutral',
      href: buildOverviewHref({ workflow: 'customer', customerFilter: 'closed' }),
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
