import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { AutomationConversationSummary, AutomationExposureRow, AutomationMessageRecord, AutomationOrderIntake } from '@shared/automation';
import type { IconComponent } from '@icons';
import {
  ActionClipboardAddIcon,
  ActionCloseIcon,
  ActionConfirmIcon,
  ActionDeleteIcon,
  ActionOpenExternalIcon,
  ActionPauseIcon,
  ActionRefreshIcon,
  ActionResumeIcon,
  ActionSearchOffIcon,
} from '@icons/actions';
import {
  EntityEvidenceIcon,
  EntityLayersIcon,
  EntityPreviewIcon,
  EntityServiceIcon,
  EntitySkuIcon,
  EntityTagsIcon,
} from '@icons/entities';
import {
  NavigationAutomationIcon,
  NavigationCatalogIcon,
  NavigationDashboardIcon,
  NavigationListIcon,
  NavigationLogsIcon,
  NavigationSettingsIcon,
  NavigationTaskListIcon,
} from '@icons/navigation';
import {
  StatusGaugeIcon,
  StatusHelpIcon,
  StatusReadyIcon,
  StatusSendIcon,
  StatusUnavailableIcon,
  StatusWarningIcon,
} from '@icons/status';
import { compactActionButtonClassName } from '@/components/system/compact-controls';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { RouteBackButton } from '@/components/system/page-navigation';
import { ResponsiveToggleFilter } from '@/components/system/responsive-toggle-filter';
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspaceBanner, WorkspacePage, WorkspaceTitleCard, useWorkspaceWindowMinHeight } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { Textarea } from '@/components/ui/textarea';
import { hasRenderableRows } from '@/components/system/headered-table';
import {
  type AutomationExposureValue,
  automationIntakeFilterValues,
  automationSectionValues,
  buildAutomationSearchParams,
  readAutomationRouteState,
  type AutomationIntakeFilterValue,
} from '@/lib/navigation/navigation-state';
import { useBenchmarkRouteReady } from '@/lib/ui/benchmark-route-ready';
import { deriveNavigationAvailability } from '@/lib/navigation/navigation-availability';
import { rowHoverClassName } from '@/lib/ui/interactive-surface';
import { statusPillClassName, tintedSurfaceClassName } from '@/lib/ui/state-tones';
import { getTranslation, translateUiLiteral } from '@/lib/localization/translations';
import { recordTicketOptions, sortRecordTicketOptionsByRecent } from '@/lib/records/record-activity';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { useAutomation } from '@/state/automation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { useRuntimeMode } from '@/hooks/use-runtime-mode';
import { AutomationConnectionCard } from './automations/connection-card';
import { AutomationEmptyState } from './automations/empty-state';
import { AutomationExceptionTable } from './automations/exception-table';
import { AutomationExposureTable } from './automations/exposure-table';
import { AutomationIntakeDrawer } from './automations/intake-drawer';
import { AutomationIntakeTable } from './automations/intake-table';
import { RecentAutomationActivityRail } from './automations/recent-activity-rail';
import {
  deriveAutomationViewModel,
  type AutomationExceptionRow,
  type AutomationIntakeTableRow,
  type AutomationRailRow,
} from './automations/view-model';
import { PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './insights/performance/chrome';
import { SectionLabel } from './inventory/sku-detail/section-heading';

type ExposureTypeFilter = 'all' | 'sku' | 'service';
type ExceptionIssueFilter = 'all' | 'parser_failed' | 'quantity_ambiguous' | 'item_not_found' | 'availability_unknown';
type ExceptionConfidenceFilter = 'all' | 'high' | 'medium' | 'low';

function matchesQuery(row: AutomationExposureRow, query: string | null) {
  const normalized = query?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return true;
  }
  return [
    row.label,
    row.alias,
    row.supplierName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function matchesIntakeQuery(intake: AutomationOrderIntake, query: string | null) {
  const normalized = query?.trim().toLowerCase() ?? '';
  if (!normalized) {
    return true;
  }
  return [
    intake.customerDisplayName,
    intake.customerHandle,
    intake.phone,
    intake.notes,
    ...intake.lines.flatMap((line) => [line.requestedLabel, line.resolvedLabel, line.ambiguityReason]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

function relativeTime(value: string | null, language: Parameters<typeof translateUiLiteral>[0]) {
  if (!value) {
    return translateUiLiteral(language, 'No webhook yet');
  }
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60_000));
  if (minutes < 60) {
    return translateUiLiteral(language, '{count}m ago', { count: minutes });
  }
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) {
    return translateUiLiteral(language, '{count}h ago', { count: hours });
  }
  return translateUiLiteral(language, '{count}d ago', { count: Math.max(1, Math.round(hours / 24)) });
}

export function buildTelegramOpenUrl(
  botUsername: string | null | undefined,
  externalLink: string | null | undefined,
) {
  const normalizedUsername = botUsername?.trim().replace(/^@/, '');
  if (normalizedUsername && /^[A-Za-z0-9_]{5,32}$/.test(normalizedUsername)) {
    return `tg://resolve?domain=${encodeURIComponent(normalizedUsername)}`;
  }

  const normalizedLink = externalLink?.trim();
  if (!normalizedLink) {
    return null;
  }

  try {
    const parsed = new URL(normalizedLink);
    const usernameFromPath = parsed.pathname.slice(1).replace(/^@/, '');
    if (
      (parsed.hostname === 't.me' || parsed.hostname === 'telegram.me') &&
      /^[A-Za-z0-9_]{5,32}$/.test(usernameFromPath)
    ) {
      return `tg://resolve?domain=${encodeURIComponent(usernameFromPath)}`;
    }
  } catch {
    return null;
  }

  return null;
}

function connectionLabel(status: string, language: Parameters<typeof translateUiLiteral>[0]) {
  if (status === 'connected') {
    return translateUiLiteral(language, 'Connected');
  }
  if (status === 'paused') {
    return translateUiLiteral(language, 'Paused');
  }
  if (status === 'error') {
    return translateUiLiteral(language, 'Error');
  }
  return translateUiLiteral(language, 'Disconnected');
}

function RailRows({ rows }: { rows: AutomationRailRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Link key={row.id} className={`flex items-start justify-between gap-3 rounded-[1rem] border border-border/50 bg-background/70 px-3 py-3 transition-colors ${rowHoverClassName}`} to={row.href}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{row.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.detail}</p>
          </div>
          {row.valueLabel ? (
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.valueTone ?? 'neutral')}`}>
              {row.valueLabel}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

function OverviewColumn({
  children,
  title,
  tooltip,
}: {
  children: React.ReactNode;
  title: string;
  tooltip: string;
}) {
  if (children == null) {
    return null;
  }

  return (
    <section className="min-w-0 px-4 py-4 xl:px-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <SectionLabel helpHref="/settings/help#automation-overview" tooltip={tooltip}>{title}</SectionLabel>
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function AutomationTabs({ language }: { language: Parameters<typeof translateUiLiteral>[0] }) {
  const tabOptions = [
    { value: 'overview', label: translateUiLiteral(language, 'Overview'), icon: <NavigationDashboardIcon className="size-4" /> },
    { value: 'catalog', label: translateUiLiteral(language, 'Products'), icon: <NavigationCatalogIcon className="size-4" /> },
    { value: 'intake', label: translateUiLiteral(language, 'Live intake'), icon: <StatusSendIcon className="size-4" /> },
    { value: 'exceptions', label: translateUiLiteral(language, 'Needs review'), icon: <StatusWarningIcon className="size-4" /> },
    { value: 'settings', label: translateUiLiteral(language, 'Settings'), icon: <NavigationSettingsIcon className="size-4" /> },
  ] satisfies Array<{ value: typeof automationSectionValues[number]; label: string; icon: React.ReactNode }>;

  return (
    <div className="relative flex overflow-x-auto overflow-y-hidden px-5 sm:px-6">
      <ChromeTabsList aria-label={translateUiLiteral(language, 'Select automation section')} className="min-w-max">
        {tabOptions.map((option) => (
          <ChromeTabsTrigger key={option.value} leading={option.icon} value={option.value}>
            {option.label}
          </ChromeTabsTrigger>
        ))}
      </ChromeTabsList>
    </div>
  );
}

function IntakeViewTabs({ language }: { language: Parameters<typeof translateUiLiteral>[0] }) {
  return (
    <div className="relative flex overflow-x-auto overflow-y-hidden px-5 sm:px-6">
      <ChromeTabsList aria-label={translateUiLiteral(language, 'Select intake view')} className="min-w-max">
        <ChromeTabsTrigger leading={<StatusSendIcon className="size-4" />} value="intake">
          {translateUiLiteral(language, 'Live intake')}
        </ChromeTabsTrigger>
        <ChromeTabsTrigger leading={<NavigationLogsIcon className="size-4" />} value="chat">
          {translateUiLiteral(language, 'Chat')}
        </ChromeTabsTrigger>
        <ChromeTabsTrigger leading={<EntityPreviewIcon className="size-4" />} value="exposed">
          {translateUiLiteral(language, 'Exposed sellables')}
        </ChromeTabsTrigger>
      </ChromeTabsList>
    </div>
  );
}

function CardControlRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-start lg:gap-4">
      {children}
    </div>
  );
}

function AutomationExperimentalWarning({ language }: { language: Parameters<typeof translateUiLiteral>[0] }) {
  return (
    <div className="rounded-[1rem] border border-amber-300/70 bg-amber-50/85 px-4 py-4 text-sm leading-6 text-amber-950">
      <div className="flex items-center gap-3">
        <StatusWarningIcon className="size-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold">{translateUiLiteral(language, 'Advanced experimental automation settings')}</p>
          <p>
            {translateUiLiteral(language, 'This tab is a work in progress. Telegram automation is experimental, subject to change, and might be unstable.')}
          </p>
        </div>
      </div>
    </div>
  );
}

function AutomationRouteLinkAction({
  children,
  icon,
  to,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  to: string;
}) {
  return (
    <Button asChild className={compactActionButtonClassName} size="sm" variant="outline">
      <Link to={to}>
        {icon}
        {children}
      </Link>
    </Button>
  );
}

function messageTimeLabel(value: string, language: Parameters<typeof translateUiLiteral>[0]) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(language === 'km' ? 'km-KH' : 'en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(date);
}

function intakeRequestLabel(intake: AutomationOrderIntake) {
  return intake.lines
    .map((line) => {
      const label = line.resolvedLabel ?? line.requestedLabel;
      return line.quantity != null ? `${line.quantity} x ${label}` : label;
    })
    .join(', ');
}

function AutomationIntakeChatView({
  intakes,
  language,
  onOpenIntake,
  onSelectIntake,
  onSendMessage,
  routeIntakeId,
  thread,
  threadError,
  threadLoading,
}: {
  intakes: AutomationOrderIntake[];
  language: Parameters<typeof translateUiLiteral>[0];
  onOpenIntake: (intake: AutomationOrderIntake) => void;
  onSelectIntake: (intakeId: string) => void;
  onSendMessage: (intakeId: string, text: string) => Promise<void>;
  routeIntakeId: string | null;
  thread: {
    conversation: AutomationConversationSummary;
    intake: AutomationOrderIntake;
    messages: AutomationMessageRecord[];
  } | null;
  threadError: string | null;
  threadLoading: boolean;
}) {
  const literal = (value: string) => translateUiLiteral(language, value);
  const selectedIntakeId = thread?.intake.intakeId ?? routeIntakeId;
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'end' });
  }, [thread?.intake.intakeId, thread?.messages.length]);

  async function handleSendMessage() {
    if (!thread) {
      return;
    }
    const text = messageDraft.trim();
    if (!text) {
      setMessageError(literal('Enter a message before sending.'));
      return;
    }
    setSendingMessage(true);
    setMessageError(null);
    try {
      await onSendMessage(thread.intake.intakeId, text);
      setMessageDraft('');
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : String(error));
    } finally {
      setSendingMessage(false);
    }
  }

  if (!selectedIntakeId) {
    return (
      <div className="grid gap-3">
        {intakes.length > 0 ? intakes.map((intake) => (
          <button
            key={intake.intakeId}
            className="flex min-w-0 items-center justify-between gap-4 rounded-[1rem] border border-border/60 bg-white px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
            type="button"
            onClick={() => onSelectIntake(intake.intakeId)}
          >
            <ActionOpenExternalIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{intake.customerDisplayName ?? intake.customerHandle ?? literal('Telegram customer')}</span>
              <span className="mt-1 block truncate text-sm text-muted-foreground">{intakeRequestLabel(intake)}</span>
            </span>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(intake.status === 'canceled' ? 'danger' : intake.status === 'ticketed' ? 'success' : intake.status === 'needs_review' ? 'warning' : 'neutral')}`}>
              {translateUiLiteral(language, intake.status.replaceAll('_', ' '))}
            </span>
          </button>
        )) : (
          <AutomationEmptyState body={literal('No Telegram intake matches this view.')} title={literal('No Telegram intake')} />
        )}
      </div>
    );
  }

  if (threadLoading) {
    return <p className="text-sm text-muted-foreground">{literal('Loading latest Telegram message...')}</p>;
  }

  if (threadError) {
    return <p className="rounded-[1rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{threadError}</p>;
  }

  if (!thread) {
    return <AutomationEmptyState body={literal('No intake selected.')} title={literal('No Telegram intake')} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-[1rem] border border-border/60 bg-white px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{thread.intake.customerDisplayName ?? thread.intake.customerHandle ?? literal('Telegram customer')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {[thread.intake.customerHandle, thread.intake.phone].filter(Boolean).join(' · ') || literal('No Telegram handle captured')}
            </p>
            <p className="mt-3 text-sm leading-6 text-foreground">{intakeRequestLabel(thread.intake)}</p>
          </div>
          <Button size="sm" type="button" variant="outline" onClick={() => onOpenIntake(thread.intake)}>
            <ActionOpenExternalIcon className="size-4" />
            {literal('Open intake')}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[1rem] border border-border/60 bg-white px-4 py-4">
        {thread.messages.length > 0 ? thread.messages.map((message) => (
          <div key={message.messageId} className={`flex ${message.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[min(34rem,84%)] rounded-[1rem] border px-4 py-3 ${message.direction === 'outbound' ? 'border-primary/30 bg-primary/10' : 'border-border/60 bg-secondary/35'}`}>
              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{message.rawText}</p>
              <p className="mt-2 text-[0.72rem] text-muted-foreground">
                {message.direction === 'outbound' ? literal('Kaur Khor') : (thread.intake.customerHandle ?? literal('Customer'))}
                {' · '}
                {messageTimeLabel(message.sentAt, language)}
              </p>
            </div>
          </div>
        )) : (
          <AutomationEmptyState body={literal('No Telegram message captured yet.')} title={literal('No linked chat messages')} />
        )}
        <div ref={threadEndRef} aria-hidden="true" />
      </div>

      <div className="rounded-[1rem] border border-border/60 bg-white px-4 py-4">
        <label className="text-sm font-medium text-foreground" htmlFor="automation-chat-message">
          {literal('Message customer')}
        </label>
        <Textarea
          className="mt-2 min-h-24 rounded-[1rem] border-border/70 bg-background/60 text-base shadow-inner"
          id="automation-chat-message"
          placeholder={literal('Write a Telegram message...')}
          value={messageDraft}
          onChange={(event) => setMessageDraft(event.target.value)}
        />
        {messageError ? (
          <p className="mt-2 rounded-[0.875rem] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {messageError}
          </p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Button disabled={sendingMessage || messageDraft.trim().length === 0} type="button" onClick={() => { void handleSendMessage(); }}>
            <StatusSendIcon className="size-4" />
            {sendingMessage ? literal('Sending...') : literal('Send message')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AutomationConfigurationTutorial({ language }: { language: Parameters<typeof translateUiLiteral>[0] }) {
  const literal = (englishTemplate: string) => translateUiLiteral(language, englishTemplate);

  return (
    <div className="max-w-4xl space-y-3 text-sm leading-6 text-muted-foreground">
      <p>
        {literal('Follow Telegram current official')} <strong className="font-medium text-foreground">@BotFather</strong> {literal('setup flow first, then paste the generated values into this form.')}
      </p>
      <ol className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-foreground">
        <li>{literal('Open Telegram, search for')} <strong className="font-medium text-foreground">@BotFather</strong>{literal(', and press')} <strong className="font-medium text-foreground">{literal('Start')}</strong>.</li>
        <li>{literal('Send')} <strong className="font-medium text-foreground">/newbot</strong> {literal('to create a new bot.')}</li>
        <li>{literal('Enter the bot display name customers should see. Paste that same value into')} <strong className="font-medium text-foreground">{literal('Bot display name')}</strong>.</li>
        <li>
          {literal('Choose the public username. Telegram requires')} <strong className="font-medium text-foreground">{literal('5-32 Latin letters, numbers, or underscores')}</strong>,
          {literal('and the username must end in')} <strong className="font-medium text-foreground">{literal('bot')}</strong>. {literal('Paste it into')} <strong className="font-medium text-foreground">@bot_username</strong>.
        </li>
        <li>
          {literal('Build the public link from the username and paste it into')} <strong className="font-medium text-foreground">https://t.me/your_bot</strong> {literal('in the format')}
          <strong className="font-medium text-foreground"> https://t.me/your_username</strong>.
        </li>
        <li>
          {literal('Copy the bot token that BotFather returns and paste it into')} <strong className="font-medium text-foreground">{literal('Telegram bot token')}</strong>.
          {literal('Treat that token like a password because anyone with it can control the bot.')}
        </li>
        <li>{literal('Click')} <strong className="font-medium text-foreground">{literal('Save Telegram settings')}</strong>. {literal('Kaur Khor keeps Automations locked to Configuration until the saved token exists.')}</li>
        <li>{literal('After saving, use')} <strong className="font-medium text-foreground">{literal('Test message')}</strong> {literal('to validate the bot, then expose sellables and open intake tabs.')}</li>
      </ol>
      <p>
        {literal('Telegram official bot documentation says the username is the bot public identity and link target, so choose it carefully before saving.')}
      </p>
    </div>
  );
}

export function AutomationsRoute({
  allowConfigurationWithoutEligibility = false,
  forcedSection,
}: {
  allowConfigurationWithoutEligibility?: boolean;
  forcedSection?: typeof automationSectionValues[number];
} = {}) {
  const inventory = useInventory();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readAutomationRouteState(searchParams);
  const {
    connection,
    error,
    exposures,
    intakes,
    isLoading,
    isSaving,
    patchExposureRow,
    promoteIntake,
    readIntakeThread,
    reload,
    resolveIntake,
    saveConnection,
    sendIntakeThreadMessage,
    testTelegramConnection,
    metrics,
  } = useAutomation();
  const { currency, language, savePreferences, showAutomationsPage, usdToKhrExchangeRate } = usePreferences();
  const { isBrowserRuntime } = useRuntimeMode();
  const [exposureTypeFilter, setExposureTypeFilter] = useState<ExposureTypeFilter>('all');
  const [issueFilter, setIssueFilter] = useState<ExceptionIssueFilter>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<ExceptionConfidenceFilter>('all');
  const [botDisplayName, setBotDisplayName] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [botToken, setBotToken] = useState('');
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [saveResultDialog, setSaveResultDialog] = useState<{
    title: string;
    description: string;
    tone: 'error' | 'success';
  } | null>(null);
  const [selectedIntakeRequest, setSelectedIntakeRequest] = useState<{
    conversationId: string | null;
    intakeId: string;
  } | null>(null);
  const [hasUnlockedAutomationTabs, setHasUnlockedAutomationTabs] = useState(false);
  const [intakeTab, setIntakeTab] = useState<'intake' | 'chat' | 'exposed'>('intake');
  const [intakeThread, setIntakeThread] = useState<{
    conversation: AutomationConversationSummary;
    intake: AutomationOrderIntake;
    messages: AutomationMessageRecord[];
  } | null>(null);
  const [intakeThreadError, setIntakeThreadError] = useState<string | null>(null);
  const [intakeThreadLoading, setIntakeThreadLoading] = useState(false);
  const selectedChatIntakeUpdatedAt = useMemo(() => (
    routeState.intakeId
      ? intakes.find((intake) => intake.intakeId === routeState.intakeId)?.updatedAt ?? null
      : null
  ), [intakes, routeState.intakeId]);
  const navigationAvailability = useMemo(
    () => deriveNavigationAvailability(inventory),
    [inventory],
  );
  const customerTicketOptions = useMemo(
    () => sortRecordTicketOptionsByRecent(recordTicketOptions(inventory.recordUpdateContext, 'customer', inventory.catalog)),
    [inventory.catalog, inventory.recordUpdateContext],
  );
  const shouldRedirectHome =
    !forcedSection &&
    !allowConfigurationWithoutEligibility &&
    (!showAutomationsPage || !navigationAvailability.hasWorkIntake);
  const automationTitleCardClassName = 'gap-4 py-5';

  useEffect(() => {
    setBotDisplayName(connection?.botDisplayName ?? '');
    setBotUsername(connection?.botUsername ?? '');
    setExternalLink(connection?.externalLink ?? '');
  }, [connection]);

  useEffect(() => {
    setHasUnlockedAutomationTabs(Boolean(connection?.hasBotToken));
  }, [connection?.hasBotToken]);

  useEffect(() => {
    if (forcedSection !== 'intake') {
      return;
    }
    if (routeState.section === 'chat') {
      setIntakeTab('chat');
      return;
    }
    if (routeState.section === 'catalog') {
      setIntakeTab('exposed');
      return;
    }
    setIntakeTab('intake');
  }, [forcedSection, routeState.section]);

  useEffect(() => {
    if (forcedSection === 'intake') {
      return;
    }
    if (!routeState.intakeId) {
      return;
    }

    const matchingIntake = intakes.find((intake) => intake.intakeId === routeState.intakeId);
    if (!matchingIntake) {
      return;
    }

    const conversationId = routeState.conversationId ?? matchingIntake.conversationId;
    setSelectedIntakeRequest((current) => {
      if (current?.intakeId === matchingIntake.intakeId && current.conversationId === conversationId) {
        return current;
      }

      return {
        conversationId,
        intakeId: matchingIntake.intakeId,
      };
    });
  }, [forcedSection, intakes, routeState.conversationId, routeState.intakeId]);

  useEffect(() => {
    if (forcedSection !== 'intake' || intakeTab !== 'chat' || !routeState.intakeId) {
      setIntakeThread(null);
      setIntakeThreadError(null);
      setIntakeThreadLoading(false);
      return;
    }
    let canceled = false;
    setIntakeThreadLoading(true);
    setIntakeThreadError(null);
    readIntakeThread({ intakeId: routeState.intakeId })
      .then((thread) => {
        if (!canceled) {
          setIntakeThread(thread);
        }
      })
      .catch((threadError) => {
        if (!canceled) {
          setIntakeThread(null);
          setIntakeThreadError(threadError instanceof Error ? threadError.message : String(threadError));
        }
      })
      .finally(() => {
        if (!canceled) {
          setIntakeThreadLoading(false);
        }
      });
    return () => {
      canceled = true;
    };
  }, [forcedSection, intakeTab, readIntakeThread, routeState.intakeId, selectedChatIntakeUpdatedAt]);

  const workspace = useMemo(() => (
    connection && metrics
      ? {
          connection,
          metrics,
          exposures,
          conversations: [],
          intakes,
        }
      : null
  ), [connection, exposures, intakes, metrics]);

  const model = useMemo(
    () => (
      workspace
        ? deriveAutomationViewModel({
            currentSearchParams: searchParams,
            currency,
            language,
            usdToKhrExchangeRate,
            workspace,
          })
        : null
    ),
    [currency, language, searchParams, usdToKhrExchangeRate, workspace],
  );

  const visibleExposureRows = useMemo(() => exposures.filter((row) => {
    if (!matchesQuery(row, routeState.q)) {
      return false;
    }
    if (routeState.exposure === 'exposed' && !row.exposed) {
      return false;
    }
    if (routeState.exposure === 'hidden' && row.exposed) {
      return false;
    }
    if (exposureTypeFilter !== 'all' && row.entityType !== exposureTypeFilter) {
      return false;
    }
    return true;
  }), [exposureTypeFilter, exposures, routeState.exposure, routeState.q]);

  const visibleIntakeRows = useMemo(() => (model?.intakeRows ?? []).filter((row) => {
    const intake = intakes.find((entry) => entry.intakeId === row.intakeId);
    if (!intake || !matchesIntakeQuery(intake, routeState.q)) {
      return false;
    }
    if (routeState.intakeFilter === 'all' && intake.status === 'canceled') {
      return false;
    }
    if (routeState.intakeFilter !== 'all' && intake.status !== routeState.intakeFilter) {
      return false;
    }
    if (routeState.ticketId && intake.promotedTicketId !== routeState.ticketId) {
      return false;
    }
    return true;
  }), [intakes, model?.intakeRows, routeState.intakeFilter, routeState.q, routeState.ticketId]);

  const visibleExceptionRows = useMemo(() => (model?.exceptionRows ?? []).filter((row) => {
    const intake = intakes.find((entry) => entry.intakeId === row.intakeId);
    if (!intake) {
      return false;
    }
    const issue = intake?.lines.find((line) => line.ambiguityReason)?.ambiguityReason ?? 'parser_failed';
    if (issueFilter !== 'all' && issue !== issueFilter) {
      return false;
    }
    if (confidenceFilter !== 'all' && intake?.parseConfidence !== confidenceFilter) {
      return false;
    }
    return !routeState.q || matchesIntakeQuery(intake, routeState.q);
  }), [confidenceFilter, issueFilter, intakes, model?.exceptionRows, routeState.q]);

  const selectedIntake = useMemo(
    () => selectedIntakeRequest
      ? intakes.find((intake) => intake.intakeId === selectedIntakeRequest.intakeId) ?? null
      : null,
    [intakes, selectedIntakeRequest],
  );

  useBenchmarkRouteReady(forcedSection === 'intake' ? 'work.intake' : 'automations', !isLoading, {
    hasWorkspace: workspace != null,
    section: routeState.section,
  });
  const unavailableExposedCount = useMemo(
    () => exposures.filter((row) => row.exposed && row.availabilityStatus === 'unavailable').length,
    [exposures],
  );

  function updateRouteState(nextState: Parameters<typeof buildAutomationSearchParams>[1]) {
    setSearchParams(buildAutomationSearchParams(searchParams, nextState));
  }

  function openIntakeDrawer(row: AutomationExceptionRow | AutomationIntakeTableRow | AutomationRailRow) {
    if (!row.intakeId) {
      return;
    }
    setSelectedIntakeRequest({
      conversationId: row.conversationId ?? null,
      intakeId: row.intakeId,
    });
  }

  function closeIntakeDrawer() {
    const selectedIntakeId = selectedIntakeRequest?.intakeId ?? null;
    setSelectedIntakeRequest(null);
    if (selectedIntakeId && selectedIntakeId === routeState.intakeId) {
      updateRouteState({
        conversationId: null,
        intakeId: null,
      });
    }
  }

  function searchControl(placeholder: string) {
    return (
      <div className="w-full max-w-xl">
        <SearchInput
          ariaLabel={translateUiLiteral(language, 'Search automations')}
          placeholder={placeholder}
          value={routeState.q ?? ''}
          onChange={(event) => updateRouteState({ q: event.target.value || null })}
        />
      </div>
    );
  }

  function botTokenPatchValue() {
    const trimmedToken = botToken.trim();
    if (trimmedToken) {
      return trimmedToken;
    }
    return connection?.hasBotToken ? undefined : null;
  }

  async function handleSaveConnection(status?: 'connected' | 'paused' | 'disconnected') {
    await saveConnection({
      channel: 'telegram',
      status,
      botDisplayName: botDisplayName.trim() || null,
      botToken: botTokenPatchValue(),
      botUsername: botUsername.trim() || null,
      externalLink: externalLink.trim() || null,
    });
  }

  async function handleConfirmDisconnect() {
    await handleSaveConnection('disconnected');
    setDisconnectDialogOpen(false);
  }

  async function handleSubmitTelegramSettings() {
    if (!botToken.trim()) {
      setSaveResultDialog({
        title: translateUiLiteral(language, 'Telegram settings not saved'),
        description: translateUiLiteral(language, 'Save a Telegram bot token first. Kaur Khor keeps Automations locked to Configuration until that token is stored.'),
        tone: 'error',
      });
      return;
    }

    try {
      const nextConnection = await saveConnection({
        channel: 'telegram',
        botDisplayName: botDisplayName.trim() || null,
        botToken: botTokenPatchValue(),
        botUsername: botUsername.trim() || null,
        externalLink: externalLink.trim() || null,
      });

      if (!nextConnection.hasBotToken) {
        setSaveResultDialog({
          title: translateUiLiteral(language, 'Telegram settings not saved'),
          description: translateUiLiteral(language, 'Kaur Khor could not confirm a saved Telegram bot token. Save the token, then try again.'),
          tone: 'error',
        });
        return;
      }

      setHasUnlockedAutomationTabs(true);
      if (!showAutomationsPage) {
        await savePreferences({ showAutomationsPage: true });
      }
      updateRouteState({
        conversationId: null,
        intakeFilter: 'all',
        intakeId: null,
        q: null,
        section: 'overview',
        ticketId: null,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setSaveResultDialog({
        title: translateUiLiteral(language, 'Telegram settings saved'),
        description: translateUiLiteral(language, 'Kaur Khor stored the Telegram bot configuration and reopened Automations on the Overview tab.'),
        tone: 'success',
      });
    } catch (error) {
      setSaveResultDialog({
        title: translateUiLiteral(language, 'Telegram settings not saved'),
        description: error instanceof Error ? error.message : translateUiLiteral(language, 'Kaur Khor could not save the Telegram configuration.'),
        tone: 'error',
      });
    }
  }

  async function handleTestTelegramConnection() {
    try {
      await testTelegramConnection();
    } catch (error) {
      setSaveResultDialog({
        title: isBrowserRuntime
          ? translateUiLiteral(language, 'Telegram browser fetch blocked')
          : translateUiLiteral(language, 'Telegram test failed'),
        description: error instanceof Error
          ? error.message
          : translateUiLiteral(language, 'Kaur Khor could not test the Telegram connection.'),
        tone: 'error',
      });
    }
  }

  async function handlePatchExposureRow(
    row: AutomationExposureRow,
    patch: { alias?: string | null; exposed?: boolean },
  ) {
    try {
      await patchExposureRow({
        ...patch,
        entityId: row.entityId,
        entityType: row.entityType,
      });
    } catch (patchError) {
      setSaveResultDialog({
        title: translateUiLiteral(language, 'Telegram sellable not updated'),
        description: patchError instanceof Error
          ? patchError.message
          : translateUiLiteral(language, 'Kaur Khor could not update the Telegram sellable.'),
        tone: 'error',
      });
    }
  }

  const hasSavedTelegramConfiguration = Boolean(connection?.hasBotToken) || hasUnlockedAutomationTabs;
  const section = forcedSection ?? (hasSavedTelegramConfiguration ? routeState.section : 'settings');
  const workIntakeWindow = useWorkspaceWindowMinHeight<HTMLDivElement>(`intake:${intakeTab}:${section}:${hasSavedTelegramConfiguration}`);
  const showOverviewSection = section === 'overview';
  const showSettingsSection = section === 'settings';
  const showCatalogSection = section === 'catalog' || (forcedSection === 'intake' && intakeTab === 'exposed');
  const showIntakeSection = section === 'intake' && (forcedSection !== 'intake' || intakeTab === 'intake');
  const showChatSection = forcedSection === 'intake' && intakeTab === 'chat';
  const showExceptionsSection = section === 'exceptions';
  const connectionStatus = connection?.status ?? 'disconnected';
  const isDisconnected = connectionStatus === 'disconnected';
  const openBotUrl = buildTelegramOpenUrl(botUsername, externalLink);
  const exposureFilterOptions = [
    { icon: EntityLayersIcon, label: translateUiLiteral(language, 'All'), value: 'all' },
    { icon: EntityPreviewIcon, label: translateUiLiteral(language, 'Exposed'), value: 'exposed' },
    { icon: StatusUnavailableIcon, label: translateUiLiteral(language, 'Hidden'), value: 'hidden' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: AutomationExposureValue }>;
  const exposureTypeFilterOptions = [
    { icon: EntityTagsIcon, label: translateUiLiteral(language, 'All types'), value: 'all' },
    { icon: EntityServiceIcon, label: translateUiLiteral(language, 'Services'), value: 'service' },
    { icon: EntitySkuIcon, label: translateUiLiteral(language, 'SKUs'), value: 'sku' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: ExposureTypeFilter }>;
  const intakeFilterOptions = automationIntakeFilterValues.map((value) => ({
    icon: value === 'all'
      ? NavigationListIcon
      : value === 'needs_review'
        ? StatusWarningIcon
        : value === 'ticketed'
          ? StatusReadyIcon
          : value === 'quoted'
            ? NavigationTaskListIcon
            : value === 'completed'
              ? ActionConfirmIcon
              : value === 'canceled'
                ? ActionCloseIcon
                : ActionClipboardAddIcon,
    label: value === 'all'
      ? translateUiLiteral(language, 'All')
      : value === 'needs_review'
        ? translateUiLiteral(language, 'Need review')
        : value === 'ticketed'
          ? translateUiLiteral(language, 'Ticketed')
          : value === 'quoted'
            ? translateUiLiteral(language, 'Quoted')
            : value === 'completed'
              ? translateUiLiteral(language, 'Completed')
              : value === 'canceled'
                ? translateUiLiteral(language, 'Canceled')
                : translateUiLiteral(language, 'New'),
    value,
  })) satisfies Array<{ icon: IconComponent; label: string; value: AutomationIntakeFilterValue }>;
  const issueFilterOptions = [
    { icon: StatusWarningIcon, label: translateUiLiteral(language, 'All issues'), value: 'all' },
    { icon: ActionSearchOffIcon, label: translateUiLiteral(language, 'Item not found'), value: 'item_not_found' },
    { icon: StatusHelpIcon, label: translateUiLiteral(language, 'Availability unknown'), value: 'availability_unknown' },
    { icon: StatusHelpIcon, label: translateUiLiteral(language, 'Quantity ambiguous'), value: 'quantity_ambiguous' },
    { icon: EntityEvidenceIcon, label: translateUiLiteral(language, 'Parser failed'), value: 'parser_failed' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: ExceptionIssueFilter }>;
  const confidenceFilterOptions = [
    { icon: StatusGaugeIcon, label: translateUiLiteral(language, 'All confidence'), value: 'all' },
    { icon: ActionConfirmIcon, label: translateUiLiteral(language, 'High'), value: 'high' },
    { icon: StatusHelpIcon, label: translateUiLiteral(language, 'Medium'), value: 'medium' },
    { icon: StatusWarningIcon, label: translateUiLiteral(language, 'Low'), value: 'low' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: ExceptionConfidenceFilter }>;

  const titleActions = (
    <WorkspaceActionRow>
      <Button
        className={compactActionButtonClassName}
        disabled={isSaving}
        size="sm"
        type="button"
        variant={isDisconnected ? 'default' : 'destructive-outline'}
        onClick={() => {
          if (isDisconnected) {
            void handleSaveConnection('connected');
            return;
          }
          setDisconnectDialogOpen(true);
        }}
      >
        {isDisconnected ? <NavigationAutomationIcon className="size-4" /> : <ActionDeleteIcon className="size-4" />}
        {isDisconnected ? translateUiLiteral(language, 'Connect bot') : translateUiLiteral(language, 'Disconnect bot')}
      </Button>
      <Button
        className={compactActionButtonClassName}
        disabled={isSaving || !connection || isDisconnected}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => { void handleSaveConnection(connection?.status === 'paused' ? 'connected' : 'paused'); }}
      >
        {connection?.status === 'paused' ? <ActionResumeIcon className="size-4" /> : <ActionPauseIcon className="size-4" />}
        {connection?.status === 'paused' ? translateUiLiteral(language, 'Resume intake') : translateUiLiteral(language, 'Pause intake')}
      </Button>
      <Button
        className={compactActionButtonClassName}
        disabled={isSaving}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => { void handleTestTelegramConnection(); }}
      >
        <StatusSendIcon className="size-4" />
        {translateUiLiteral(language, isBrowserRuntime ? 'Poll Telegram now' : 'Test message')}
      </Button>
      {forcedSection === 'settings' ? null : (
        <AutomationRouteLinkAction icon={<NavigationSettingsIcon className="size-4" />} to="/settings/automation">
          {translateUiLiteral(language, 'Open Settings')}
        </AutomationRouteLinkAction>
      )}
      {forcedSection === 'intake' ? null : (
        <AutomationRouteLinkAction icon={<NavigationAutomationIcon className="size-4" />} to="/work/intake">
          {translateUiLiteral(language, 'Open Intake')}
        </AutomationRouteLinkAction>
      )}
      {openBotUrl ? (
        <Button
          className={compactActionButtonClassName}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => { void window.kaurKhorDesktop.system.openExternalUrl(openBotUrl); }}
        >
          <ActionOpenExternalIcon className="size-4" />
          {translateUiLiteral(language, 'Open bot')}
        </Button>
      ) : (
        <Button className={compactActionButtonClassName} disabled size="sm" type="button" variant="outline">
          <ActionOpenExternalIcon className="size-4" />
          {translateUiLiteral(language, 'Open bot')}
        </Button>
      )}
    </WorkspaceActionRow>
  );

  if (shouldRedirectHome) {
    return <Navigate replace to="/" />;
  }

  const routeLinkTitleAction = forcedSection === 'settings' ? (
    <WorkspaceActionRow className="justify-end">
      <AutomationRouteLinkAction icon={<NavigationAutomationIcon className="size-4" />} to="/work/intake">
        {translateUiLiteral(language, 'Open Intake')}
      </AutomationRouteLinkAction>
    </WorkspaceActionRow>
  ) : forcedSection === 'intake' ? (
    <WorkspaceActionRow className="justify-end">
      <AutomationRouteLinkAction icon={<NavigationSettingsIcon className="size-4" />} to="/settings/automation">
        {translateUiLiteral(language, 'Open Settings')}
      </AutomationRouteLinkAction>
    </WorkspaceActionRow>
  ) : undefined;
  const titleCardActions = hasSavedTelegramConfiguration ? titleActions : routeLinkTitleAction;
  const titleCardTitle = forcedSection === 'settings' ? (
    <span className="truncate">{translateUiLiteral(language, 'Automated Telegram Bot')}</span>
  ) : (
    <span className="flex min-w-0 items-center gap-3">
      <RouteBackButton className="shrink-0" />
      <span className="truncate">{translateUiLiteral(language, 'Automated Telegram Bot')}</span>
    </span>
  );

  if (isLoading && !workspace) {
    return (
      <WorkspacePage>
        <WorkspaceTitleCard
          actions={titleCardActions}
          helperExemptReason="Automation title card descriptor supplies route-level guidance."
          title={titleCardTitle}
          descriptor={translateUiLiteral(language, 'Expose approved sellables to Telegram, turn messages into customer tickets, and keep Kaur Khor as the source of pricing and fulfillment truth.')}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage fitViewport={forcedSection === 'intake'} className="gap-5">
      <WorkspaceTitleCard
        actions={titleCardActions}
        className={automationTitleCardClassName}
        eyebrow={forcedSection === 'settings' ? getTranslation(language, 'settingsTitle') : undefined}
        helperExemptReason="Automation title card descriptor supplies route-level guidance."
        title={titleCardTitle}
        descriptor={translateUiLiteral(language, 'Expose approved sellables to Telegram, turn messages into customer tickets, and keep Kaur Khor as the source of pricing and fulfillment truth.')}
      >
        <div className="grid gap-3">
          {forcedSection === 'intake' ? <AutomationExperimentalWarning language={language} /> : null}
          {isBrowserRuntime ? (
            <div className="rounded-[1rem] border border-amber-300/60 bg-amber-50/85 px-4 py-3 text-sm leading-6 text-amber-950">
              <p className="font-semibold">
                {translateUiLiteral(language, 'Browser automation runs only while this tab is open.')}
              </p>
              <p>
                {translateUiLiteral(language, 'SENA is single-threaded in browser mode, and live Telegram polling pauses when the tab is closed, hidden, asleep, or blocked by the browser. Use desktop for persistent automation.')}
              </p>
            </div>
          ) : null}
          {hasSavedTelegramConfiguration && model ? (
            <MetricRibbon
              columns={5}
              items={model.ribbon.map((metric) => ({
                key: metric.key,
                label: metric.label,
                value: metric.value,
                detail: metric.detail,
                className: tintedSurfaceClassName(metric.tone),
              }))}
            />
          ) : null}
        </div>
      </WorkspaceTitleCard>

      <ConfirmActionDialog
        confirmLabel={translateUiLiteral(language, 'Disconnect bot')}
        description={translateUiLiteral(language, 'Telegram intake will stop until you connect the bot again. Existing conversations, intake records, and promoted Kaur Khor tickets will stay in Kaur Khor.')}
        isSubmitting={isSaving}
        open={disconnectDialogOpen}
        title={translateUiLiteral(language, 'Disconnect Telegram bot?')}
        onCancel={() => setDisconnectDialogOpen(false)}
        onConfirm={() => { void handleConfirmDisconnect(); }}
      />

      <ConfirmActionDialog
        confirmLabel={translateUiLiteral(language, 'OK')}
        confirmVariant="default"
        description={saveResultDialog?.description}
        hideCancel
        iconTone={saveResultDialog?.tone === 'success' ? 'success' : 'destructive'}
        open={saveResultDialog != null}
        title={saveResultDialog?.title ?? ''}
        onCancel={() => setSaveResultDialog(null)}
        onConfirm={() => setSaveResultDialog(null)}
      />

      {error ? (
        <WorkspaceBanner
          description={error}
          title={translateUiLiteral(language, 'Automations needs attention')}
          tone="destructive"
          action={(
            <Button size="sm" type="button" variant="outline" onClick={() => { void reload(); }}>
              <ActionRefreshIcon className="size-4" />
              {translateUiLiteral(language, 'Retry')}
            </Button>
          )}
        />
      ) : null}

      <div className={forcedSection === 'intake' ? 'flex min-h-0 flex-1 flex-col' : undefined} data-work-window-root={forcedSection === 'intake' ? 'intake' : undefined}>
        <div
          ref={forcedSection === 'intake' ? workIntakeWindow.ref : undefined}
          className={forcedSection === 'intake' ? 'flex min-h-0 shrink-0 flex-col' : undefined}
          data-work-window={forcedSection === 'intake' ? 'intake' : undefined}
          style={forcedSection === 'intake' ? workIntakeWindow.style : undefined}
        >
          <ChromeTabs
            className={forcedSection === 'intake' ? 'relative min-h-0 flex-1 gap-0' : 'relative gap-0'}
            value={forcedSection === 'intake' && hasSavedTelegramConfiguration ? intakeTab : section}
            onValueChange={(value) => {
              if (forcedSection === 'intake' && hasSavedTelegramConfiguration) {
                const nextTab = value as 'intake' | 'chat' | 'exposed';
                setIntakeTab(nextTab);
                updateRouteState({
                  conversationId: nextTab === 'chat' ? routeState.conversationId : null,
                  intakeId: nextTab === 'chat' ? routeState.intakeId : null,
                  section: nextTab === 'exposed' ? 'catalog' : nextTab,
                });
              } else {
                updateRouteState({ section: value as typeof automationSectionValues[number] });
              }
            }}
          >
        {hasSavedTelegramConfiguration && forcedSection === 'intake' ? <IntakeViewTabs language={language} /> : hasSavedTelegramConfiguration && !forcedSection ? <AutomationTabs language={language} /> : null}

        <div
          className="grid min-w-0 gap-6"
          style={{
            marginTop: hasSavedTelegramConfiguration
              ? 'calc(var(--chrome-tabs-surface-overlap) * -2.75)'
              : 0,
          }}
        >
          {showOverviewSection ? (
            <div className="grid gap-4">
              {unavailableExposedCount > 0 ? (
                <WorkspaceBanner
                  title={translateUiLiteral(language, 'Unavailable sellables are still exposed')}
                  description={
                    unavailableExposedCount === 1
                      ? translateUiLiteral(language, '1 customer-facing Telegram item is unavailable but still toggled on. Review Products coverage and hide it until it is ready.')
                      : translateUiLiteral(language, '{count} customer-facing Telegram items are unavailable but still toggled on. Review Products coverage and hide them until they are ready.', { count: unavailableExposedCount })
                  }
                  action={(
                    <Button size="sm" type="button" variant="outline" onClick={() => updateRouteState({ section: 'catalog', exposure: 'exposed' })}>
                      <EntityPreviewIcon className="size-4" />
                      {translateUiLiteral(language, 'Review exposed sellables')}
                    </Button>
                  )}
                />
              ) : null}
              {hasRenderableRows(model?.today) || hasRenderableRows(model?.recentActivity) || hasRenderableRows(model?.coverage) ? (
              <section className={PERFORMANCE_HEADER_SURFACE_CLASS_NAME}>
                <div className="grid divide-y divide-border/60 xl:grid-cols-3 xl:divide-x xl:divide-y-0">
                  <OverviewColumn title={translateUiLiteral(language, 'Today')} tooltip={translateUiLiteral(language, 'Telegram intake counts for today.')}>
                    {hasRenderableRows(model?.today) ? <RailRows rows={model?.today ?? []} /> : null}
                  </OverviewColumn>

                  <OverviewColumn title={translateUiLiteral(language, 'Recent automation activity')} tooltip={translateUiLiteral(language, 'The latest Telegram intake and promotion movement.')}>
                    {hasRenderableRows(model?.recentActivity) ? <RecentAutomationActivityRail language={language} rows={model?.recentActivity ?? []} onOpenIntake={openIntakeDrawer} /> : null}
                  </OverviewColumn>

                  <OverviewColumn title={translateUiLiteral(language, 'Coverage')} tooltip={translateUiLiteral(language, 'How much of the sellable products list Telegram can safely offer right now.')}>
                    {hasRenderableRows(model?.coverage) ? <RailRows rows={model?.coverage ?? []} /> : null}
                  </OverviewColumn>
                </div>
              </section>
              ) : null}
            </div>
          ) : null}

          {showSettingsSection ? (
            <PerformanceSectionShell
              descriptor={<AutomationConfigurationTutorial language={language} />}
              helpHref="/settings/help#automation-configuration"
              title={translateUiLiteral(language, 'Configuration')}
              tooltip={translateUiLiteral(language, 'Configure the Telegram bot connection and keep Kaur Khor as the source of pricing, tickets, and fulfillment truth.')}
            >
              <AutomationConnectionCard
                botDisplayName={botDisplayName}
                botToken={botToken}
                botUsername={botUsername}
                connection={connection}
                externalLink={externalLink}
                isBrowserRuntime={isBrowserRuntime}
                isSaving={isSaving}
                language={language}
                onBotDisplayNameChange={setBotDisplayName}
                onBotTokenChange={setBotToken}
                onBotUsernameChange={setBotUsername}
                onExternalLinkChange={setExternalLink}
                onSave={() => { void handleSubmitTelegramSettings(); }}
              />
            </PerformanceSectionShell>
          ) : null}

          {showCatalogSection ? (
            <PerformanceSectionShell
              className={forcedSection === 'intake' ? 'min-h-full bg-white [background:white]' : undefined}
              contentClassName={forcedSection === 'intake' ? 'flex min-h-0 flex-1 flex-col bg-white' : undefined}
              descriptor={translateUiLiteral(language, 'Choose exactly which customer-facing SKUs and services the bot may offer.')}
              helpHref="/settings/help#automation-sellables-exposed"
              headerControls={(
                <CardControlRow>
                  {searchControl(translateUiLiteral(language, 'Search sellables, aliases, or suppliers...'))}
                  <ResponsiveToggleFilter
                    ariaLabel={translateUiLiteral(language, 'Filter exposed sellables')}
                    options={exposureFilterOptions}
                    value={routeState.exposure}
                    onValueChange={(value) => updateRouteState({ exposure: value })}
                  />
                  <ResponsiveToggleFilter
                    ariaLabel={translateUiLiteral(language, 'Filter exposed sellable types')}
                    options={exposureTypeFilterOptions}
                    value={exposureTypeFilter}
                    onValueChange={setExposureTypeFilter}
                  />
                </CardControlRow>
              )}
              title={translateUiLiteral(language, 'Sellables exposed to Telegram')}
              tooltip={translateUiLiteral(language, 'Choose exactly which customer-facing SKUs and services the bot may offer.')}
            >
              {visibleExposureRows.length > 0 ? (
                <AutomationExposureTable
                  language={language}
                  rows={visibleExposureRows}
                  onAliasCommit={(row, nextAlias) => {
                    void handlePatchExposureRow(row, { alias: nextAlias.trim() || null });
                  }}
                  onToggle={(row, checked) => {
                    void handlePatchExposureRow(row, { exposed: checked });
                  }}
                />
              ) : (
                <AutomationEmptyState
                  body={translateUiLiteral(language, 'No sellables are exposed yet. Expose at least one service or sellable SKU to let Telegram accept orders.')}
                  title={translateUiLiteral(language, 'No Telegram sellables in this view')}
                />
              )}
            </PerformanceSectionShell>
          ) : null}

          {showIntakeSection ? (
            <PerformanceSectionShell
              className={forcedSection === 'intake' ? 'min-h-full bg-white [background:white]' : undefined}
              contentClassName={forcedSection === 'intake' ? 'flex min-h-0 flex-1 flex-col bg-white' : undefined}
              descriptor={translateUiLiteral(language, 'Incoming Telegram requests waiting for review, confirmation, or promotion into Kaur Khor tickets.')}
              helpHref="/settings/help#automation-live-intake"
              headerControls={(
                <CardControlRow>
                  {searchControl(translateUiLiteral(language, 'Search customers, handles, notes, or intake lines...'))}
                  <ResponsiveToggleFilter
                    ariaLabel={translateUiLiteral(language, 'Filter intake')}
                    options={intakeFilterOptions}
                    value={routeState.intakeFilter}
                    onValueChange={(value) => updateRouteState({ intakeFilter: value })}
                  />
                </CardControlRow>
              )}
              title={translateUiLiteral(language, 'Live intake')}
              tooltip={translateUiLiteral(language, 'Incoming Telegram requests waiting for review, confirmation, or promotion into Kaur Khor tickets.')}
            >
              {visibleIntakeRows.length > 0 ? (
                <AutomationIntakeTable
                  language={language}
                  rows={visibleIntakeRows}
                  onOpenIntake={openIntakeDrawer}
                  onViewChat={forcedSection === 'intake' ? (row) => updateRouteState({ intakeId: row.intakeId, section: 'chat' }) : undefined}
                />
              ) : (
                <AutomationEmptyState
                  body={translateUiLiteral(language, 'No Telegram intake matches this view.')}
                  title={translateUiLiteral(language, 'No Telegram intake')}
                />
              )}
            </PerformanceSectionShell>
          ) : null}

          {showChatSection ? (
            <PerformanceSectionShell
              className="min-h-full bg-white [background:white]"
              contentClassName="flex min-h-0 flex-1 flex-col bg-white"
              descriptor={translateUiLiteral(language, 'Review the Telegram messages attached to one specific intake order.')}
              helpHref="/settings/help#automation-live-intake"
              title={translateUiLiteral(language, 'Chat')}
              tooltip={translateUiLiteral(language, 'Review the Telegram messages attached to one specific intake order.')}
            >
              <AutomationIntakeChatView
                intakes={intakes}
                language={language}
                routeIntakeId={routeState.intakeId}
                thread={intakeThread}
                threadError={intakeThreadError}
                threadLoading={intakeThreadLoading}
                onOpenIntake={(intake) => setSelectedIntakeRequest({ conversationId: intake.conversationId, intakeId: intake.intakeId })}
                onSelectIntake={(intakeId) => updateRouteState({ intakeId, section: 'chat' })}
                onSendMessage={async (intakeId, text) => {
                  const threadResult = await sendIntakeThreadMessage({ intakeId, text });
                  setIntakeThread(threadResult);
                }}
              />
            </PerformanceSectionShell>
          ) : null}

          {showExceptionsSection ? (
            <PerformanceSectionShell
              descriptor={translateUiLiteral(language, 'Messages that Kaur Khor could not safely convert into clean customer order intake.')}
              helpHref="/settings/help#automation-needs-review"
              headerControls={(
                <CardControlRow>
                  {searchControl(translateUiLiteral(language, 'Search customers, issues, notes, or intake lines...'))}
                  <ResponsiveToggleFilter
                    ariaLabel={translateUiLiteral(language, 'Filter exception issues')}
                    options={issueFilterOptions}
                    value={issueFilter}
                    onValueChange={setIssueFilter}
                  />
                  <ResponsiveToggleFilter
                    ariaLabel={translateUiLiteral(language, 'Filter exception confidence')}
                    options={confidenceFilterOptions}
                    value={confidenceFilter}
                    onValueChange={setConfidenceFilter}
                  />
                </CardControlRow>
              )}
              title={translateUiLiteral(language, 'Needs review')}
              tooltip={translateUiLiteral(language, 'Messages that Kaur Khor could not safely convert into clean customer order intake.')}
            >
              {visibleExceptionRows.length > 0 ? (
                <AutomationExceptionTable language={language} rows={visibleExceptionRows} onOpenIntake={openIntakeDrawer} />
              ) : (
                <AutomationEmptyState
                  body={translateUiLiteral(language, 'No review items are waiting right now.')}
                  title={translateUiLiteral(language, 'No review backlog')}
                />
              )}
            </PerformanceSectionShell>
          ) : null}
        </div>
          </ChromeTabs>
        </div>
        {forcedSection === 'intake' ? (
          <div aria-hidden="true" className="h-32 shrink-0 md:h-36" data-work-bottom-breathing-room="intake" />
        ) : null}
      </div>

      <AutomationIntakeDrawer
        intake={selectedIntake}
        isSaving={isSaving}
        language={language}
        open={selectedIntake != null}
        onClose={closeIntakeDrawer}
        onPromote={promoteIntake}
        onResolve={resolveIntake}
        onViewChat={(intakeId) => {
          updateRouteState({ intakeId, section: 'chat' });
          setSelectedIntakeRequest(null);
        }}
        ticketOptions={customerTicketOptions}
      />
    </WorkspacePage>
  );
}
