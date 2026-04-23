import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { AutomationExposureRow, AutomationOrderIntake } from '@shared/automation';
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
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspaceBanner, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  automationIntakeFilterValues,
  automationSectionValues,
  buildAutomationSearchParams,
  readAutomationRouteState,
  type AutomationIntakeFilterValue,
} from '@/lib/navigation-state';
import { deriveNavigationAvailability } from '@/lib/navigation-availability';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { statusPillClassName, tintedSurfaceClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { useAutomation } from '@/state/automation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
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
  type AutomationRibbonMetric,
} from './automations/view-model';
import { PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './performance/chrome';
import { SectionLabel } from './sku-detail/section-heading';

type ExposureTypeFilter = 'all' | 'sku' | 'service';
type ExceptionIssueFilter = 'all' | 'parser_failed' | 'quantity_ambiguous' | 'item_not_found';
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

function relativeTime(value: string | null) {
  if (!value) {
    return 'No webhook yet';
  }
  const deltaMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(deltaMs / 60_000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.max(1, Math.round(hours / 24))}d ago`;
}

function buildTelegramOpenUrl(
  botUsername: string | null | undefined,
  externalLink: string | null | undefined,
) {
  const normalizedUsername = botUsername?.trim().replace(/^@/, '');
  if (normalizedUsername) {
    return `tg://resolve?domain=${encodeURIComponent(normalizedUsername)}`;
  }

  const normalizedLink = externalLink?.trim();
  if (!normalizedLink) {
    return null;
  }

  try {
    const parsed = new URL(normalizedLink);
    if ((parsed.hostname === 't.me' || parsed.hostname === 'telegram.me') && parsed.pathname.length > 1) {
      return `tg://resolve?domain=${encodeURIComponent(parsed.pathname.slice(1).replace(/^@/, ''))}`;
    }
  } catch {
    return null;
  }

  return null;
}

function connectionLabel(status: string) {
  if (status === 'connected') {
    return 'Connected';
  }
  if (status === 'paused') {
    return 'Paused';
  }
  if (status === 'error') {
    return 'Error';
  }
  return 'Disconnected';
}

function RibbonStrip({ metrics }: { metrics: AutomationRibbonMetric[] }) {
  return (
    <section className={PERFORMANCE_HEADER_SURFACE_CLASS_NAME}>
      <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric, index) => (
          <Link
            key={metric.key}
            className={`flex min-w-0 flex-col gap-2 px-5 py-4 transition-colors hover:bg-background/50 xl:border-l xl:first:border-l-0 ${index > 0 ? 'border-t border-border/60 md:border-t-0 md:border-l' : ''} ${tintedSurfaceClassName(metric.tone)}`}
            to={metric.href}
          >
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{metric.label}</span>
            <span className="text-3xl font-semibold tracking-[-0.04em] text-foreground">{metric.value}</span>
            <span className="text-sm leading-6 text-muted-foreground">{metric.detail}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RailRows({
  emptyLabel,
  rows,
}: {
  emptyLabel: string;
  rows: AutomationRailRow[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">{emptyLabel}</p>;
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
  return (
    <section className="min-w-0 px-4 py-4 xl:px-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function AutomationTabs() {
  const tabOptions = [
    { value: 'overview', label: 'Overview', icon: <NavigationDashboardIcon className="size-4" /> },
    { value: 'catalog', label: 'Catalog', icon: <NavigationCatalogIcon className="size-4" /> },
    { value: 'intake', label: 'Live intake', icon: <StatusSendIcon className="size-4" /> },
    { value: 'exceptions', label: 'Needs review', icon: <StatusWarningIcon className="size-4" /> },
    { value: 'settings', label: 'Settings', icon: <NavigationSettingsIcon className="size-4" /> },
  ] satisfies Array<{ value: typeof automationSectionValues[number]; label: string; icon: React.ReactNode }>;

  return (
    <div className="relative flex overflow-x-auto overflow-y-hidden px-5 sm:px-6">
      <ChromeTabsList aria-label="Select automation section" className="min-w-max">
        {tabOptions.map((option) => (
          <ChromeTabsTrigger key={option.value} leading={option.icon} value={option.value}>
            {option.label}
          </ChromeTabsTrigger>
        ))}
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

function AutomationConfigurationTutorial() {
  return (
    <div className="max-w-4xl space-y-3 text-sm leading-6 text-muted-foreground">
      <p>
        Follow Telegram&apos;s current official <strong className="font-medium text-foreground">@BotFather</strong> setup flow first,
        then paste the generated values into this form.
      </p>
      <ol className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-foreground">
        <li>Open Telegram, search for <strong className="font-medium text-foreground">@BotFather</strong>, and press <strong className="font-medium text-foreground">Start</strong>.</li>
        <li>Send <strong className="font-medium text-foreground">/newbot</strong> to create a new bot.</li>
        <li>Enter the bot display name customers should see. Paste that same value into <strong className="font-medium text-foreground">Bot display name</strong>.</li>
        <li>
          Choose the public username. Telegram requires <strong className="font-medium text-foreground">5-32 Latin letters, numbers, or underscores</strong>,
          and the username must end in <strong className="font-medium text-foreground">bot</strong>. Paste it into <strong className="font-medium text-foreground">@bot_username</strong>.
        </li>
        <li>
          Build the public link from the username and paste it into <strong className="font-medium text-foreground">https://t.me/your_bot</strong> in the format
          <strong className="font-medium text-foreground"> https://t.me/your_username</strong>.
        </li>
        <li>
          Copy the bot token that BotFather returns and paste it into <strong className="font-medium text-foreground">Telegram bot token</strong>.
          Treat that token like a password because anyone with it can control the bot.
        </li>
        <li>Click <strong className="font-medium text-foreground">Save Telegram settings</strong>. banji keeps Automations locked to Configuration until the saved token exists.</li>
        <li>After saving, use <strong className="font-medium text-foreground">Test message</strong> to validate the bot, then expose sellables and open intake tabs.</li>
      </ol>
      <p>
        Telegram&apos;s official bot documentation says the username is the bot&apos;s public identity and link target, so choose it carefully before saving.
      </p>
    </div>
  );
}

export function AutomationsRoute() {
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
    readConversation,
    reload,
    resolveIntake,
    saveConnection,
    testTelegramConnection,
    metrics,
  } = useAutomation();
  const { currency, language, showAutomationsPage, t, usdToKhrExchangeRate } = usePreferences();
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
  const navigationAvailability = useMemo(
    () => deriveNavigationAvailability(inventory),
    [inventory],
  );

  if (!showAutomationsPage || !navigationAvailability.hasAutomationsTab) {
    return <Navigate replace to="/" />;
  }

  useEffect(() => {
    setBotDisplayName(connection?.botDisplayName ?? '');
    setBotUsername(connection?.botUsername ?? '');
    setExternalLink(connection?.externalLink ?? '');
  }, [connection]);

  useEffect(() => {
    setHasUnlockedAutomationTabs(Boolean(connection?.hasBotToken));
  }, [connection?.hasBotToken]);

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

  function searchControl(placeholder: string) {
    return (
      <div className="w-full max-w-xl">
        <SearchInput
          ariaLabel="Search automations"
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
    if (!botToken.trim() && !connection?.hasBotToken) {
      setSaveResultDialog({
        title: 'Telegram settings not saved',
        description: 'Save a Telegram bot token first. banji keeps Automations locked to Configuration until that token is stored.',
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
          title: 'Telegram settings not saved',
          description: 'banji could not confirm a saved Telegram bot token. Save the token, then try again.',
          tone: 'error',
        });
        return;
      }

      setHasUnlockedAutomationTabs(true);
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
        title: 'Telegram settings saved',
        description: 'banji stored the Telegram bot configuration and reopened Automations on the Overview tab.',
        tone: 'success',
      });
    } catch (error) {
      setSaveResultDialog({
        title: 'Telegram settings not saved',
        description: error instanceof Error ? error.message : 'banji could not save the Telegram configuration.',
        tone: 'error',
      });
    }
  }

  const hasSavedTelegramConfiguration = Boolean(connection?.hasBotToken) || hasUnlockedAutomationTabs;
  const section = hasSavedTelegramConfiguration ? routeState.section : 'settings';
  const showOverviewSection = section === 'overview';
  const showSettingsSection = section === 'settings';
  const showCatalogSection = section === 'catalog';
  const showIntakeSection = section === 'intake';
  const showExceptionsSection = section === 'exceptions';
  const connectionStatus = connection?.status ?? 'disconnected';
  const isDisconnected = connectionStatus === 'disconnected';
  const openBotUrl = buildTelegramOpenUrl(connection?.botUsername ?? botUsername, connection?.externalLink ?? externalLink);

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
        {isDisconnected ? 'Connect bot' : 'Disconnect bot'}
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
        {connection?.status === 'paused' ? 'Resume intake' : 'Pause intake'}
      </Button>
      <Button
        className={compactActionButtonClassName}
        disabled={isSaving}
        size="sm"
        type="button"
        variant="outline"
        onClick={() => { void testTelegramConnection(); }}
      >
        <StatusSendIcon className="size-4" />
        Test message
      </Button>
      {openBotUrl ? (
        <Button
          className={compactActionButtonClassName}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => { void window.banjiDesktop.system.openExternalUrl(openBotUrl); }}
        >
          <ActionOpenExternalIcon className="size-4" />
          Open bot
        </Button>
      ) : (
        <Button className={compactActionButtonClassName} disabled size="sm" type="button" variant="outline">
          <ActionOpenExternalIcon className="size-4" />
          Open bot
        </Button>
      )}
    </WorkspaceActionRow>
  );

  if (isLoading && !workspace) {
    return (
      <WorkspacePage>
        <WorkspaceTitleCard
          eyebrow={t('navAutomations')}
          title={translateUiLiteral(language, 'Telegram Bot')}
          descriptor="Expose approved sellables to Telegram, turn messages into customer tickets, and keep banji as the source of pricing and fulfillment truth."
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage className="gap-5">
      <WorkspaceTitleCard
        actions={hasSavedTelegramConfiguration ? titleActions : undefined}
        eyebrow={t('navAutomations')}
        title={translateUiLiteral(language, 'Telegram Bot')}
        descriptor="Expose approved sellables to Telegram, turn messages into customer tickets, and keep banji as the source of pricing and fulfillment truth."
      >
        <p className="text-sm leading-6 text-muted-foreground">
          {connectionLabel(connection?.status ?? 'disconnected')}
          {' · '}
          Last webhook {relativeTime(connection?.lastWebhookAt ?? null)}
          {' · '}
          {metrics?.ordersToday ?? 0} orders today
          {' · '}
          {metrics?.needsReview ?? 0} need review
        </p>
      </WorkspaceTitleCard>

      <ConfirmActionDialog
        confirmLabel="Disconnect bot"
        description="Telegram intake will stop until you connect the bot again. Existing conversations, intake records, and promoted banji tickets will stay in banji."
        isSubmitting={isSaving}
        open={disconnectDialogOpen}
        title="Disconnect Telegram bot?"
        onCancel={() => setDisconnectDialogOpen(false)}
        onConfirm={() => { void handleConfirmDisconnect(); }}
      />

      <ConfirmActionDialog
        confirmLabel="OK"
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
          title="Automations needs attention"
          tone="destructive"
          action={(
            <Button size="sm" type="button" variant="outline" onClick={() => { void reload(); }}>
              <ActionRefreshIcon className="size-4" />
              Retry
            </Button>
          )}
        />
      ) : null}

      {hasSavedTelegramConfiguration && model ? <RibbonStrip metrics={model.ribbon} /> : null}

      <ChromeTabs
        className="relative gap-0"
        value={section}
        onValueChange={(value) => updateRouteState({ section: value as typeof automationSectionValues[number] })}
      >
        {hasSavedTelegramConfiguration ? <AutomationTabs /> : null}

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
                  tone="warning"
                  title="Unavailable sellables are still exposed"
                  description={
                    unavailableExposedCount === 1
                      ? '1 customer-facing Telegram item is unavailable but still toggled on. Review Catalog coverage and hide it until it is ready.'
                      : `${unavailableExposedCount} customer-facing Telegram items are unavailable but still toggled on. Review Catalog coverage and hide them until they are ready.`
                  }
                  action={(
                    <Button size="sm" type="button" variant="outline" onClick={() => updateRouteState({ section: 'catalog', exposure: 'exposed' })}>
                      <EntityPreviewIcon className="size-4" />
                      Review exposed sellables
                    </Button>
                  )}
                />
              ) : null}
              <section className={PERFORMANCE_HEADER_SURFACE_CLASS_NAME}>
                <div className="grid divide-y divide-border/60 xl:grid-cols-3 xl:divide-x xl:divide-y-0">
                  <OverviewColumn title="Today" tooltip={translateUiLiteral(language, 'Telegram intake counts for today.')}>
                    <RailRows emptyLabel="Telegram activity has not started today." rows={model?.today ?? []} />
                  </OverviewColumn>

                  <OverviewColumn title="Recent automation activity" tooltip={translateUiLiteral(language, 'The latest Telegram intake and promotion movement.')}>
                    <RecentAutomationActivityRail rows={model?.recentActivity ?? []} onOpenIntake={openIntakeDrawer} />
                  </OverviewColumn>

                  <OverviewColumn title="Coverage" tooltip={translateUiLiteral(language, 'How much of the sellable catalog Telegram can safely offer right now.')}>
                    <RailRows emptyLabel="Expose at least one sellable to start Telegram coverage." rows={model?.coverage ?? []} />
                  </OverviewColumn>
                </div>
              </section>
            </div>
          ) : null}

          {showSettingsSection ? (
            <PerformanceSectionShell
              descriptor={<AutomationConfigurationTutorial />}
              title="Configuration"
              tooltip={translateUiLiteral(language, 'Configure the Telegram bot connection and keep banji as the source of pricing, tickets, and fulfillment truth.')}
            >
              <AutomationConnectionCard
                botDisplayName={botDisplayName}
                botToken={botToken}
                botUsername={botUsername}
                connection={connection}
                externalLink={externalLink}
                isSaving={isSaving}
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
              descriptor="Choose exactly which customer-facing SKUs and services the bot may offer."
              headerControls={(
                <CardControlRow>
                  {searchControl('Search sellables, aliases, or suppliers…')}
                  <ToggleGroup
                    className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
                    spacing={1}
                    type="single"
                    value={routeState.exposure}
                    onValueChange={(value) => {
                      if (value) {
                        updateRouteState({ exposure: value as typeof routeState.exposure });
                      }
                    }}
                  >
                    <ToggleGroupItem value="all">
                      <EntityLayersIcon className="size-4" />
                      All
                    </ToggleGroupItem>
                    <ToggleGroupItem value="exposed">
                      <EntityPreviewIcon className="size-4" />
                      Exposed
                    </ToggleGroupItem>
                    <ToggleGroupItem value="hidden">
                      <StatusUnavailableIcon className="size-4" />
                      Hidden
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <ToggleGroup
                    className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
                    spacing={1}
                    type="single"
                    value={exposureTypeFilter}
                    onValueChange={(value) => {
                      if (value) {
                        setExposureTypeFilter(value as ExposureTypeFilter);
                      }
                    }}
                  >
                    <ToggleGroupItem value="all">
                      <EntityTagsIcon className="size-4" />
                      All types
                    </ToggleGroupItem>
                    <ToggleGroupItem value="service">
                      <EntityServiceIcon className="size-4" />
                      Services
                    </ToggleGroupItem>
                    <ToggleGroupItem value="sku">
                      <EntitySkuIcon className="size-4" />
                      SKUs
                    </ToggleGroupItem>
                  </ToggleGroup>
                </CardControlRow>
              )}
              title="Sellables exposed to Telegram"
              tooltip={translateUiLiteral(language, 'Choose exactly which customer-facing SKUs and services the bot may offer.')}
            >
              {visibleExposureRows.length > 0 ? (
                <AutomationExposureTable
                  rows={visibleExposureRows}
                  onAliasCommit={(row, nextAlias) => {
                    void patchExposureRow({
                      alias: nextAlias.trim() || null,
                      entityId: row.entityId,
                      entityType: row.entityType,
                    });
                  }}
                  onToggle={(row, checked) => {
                    void patchExposureRow({
                      entityId: row.entityId,
                      entityType: row.entityType,
                      exposed: checked,
                    });
                  }}
                />
              ) : (
                <AutomationEmptyState
                  body="No sellables are exposed yet. Expose at least one service or sellable SKU to let Telegram accept orders."
                  title="No Telegram sellables in this view"
                />
              )}
            </PerformanceSectionShell>
          ) : null}

          {showIntakeSection ? (
            <PerformanceSectionShell
              descriptor="Incoming Telegram requests waiting for review, confirmation, or promotion into banji tickets."
              headerControls={(
                <CardControlRow>
                  {searchControl('Search customers, handles, notes, or intake lines…')}
                  <ToggleGroup
                    className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
                    spacing={1}
                    type="single"
                    value={routeState.intakeFilter}
                    onValueChange={(value) => {
                      if (value) {
                        updateRouteState({ intakeFilter: value as AutomationIntakeFilterValue });
                      }
                    }}
                  >
                    {automationIntakeFilterValues.map((value) => (
                      <ToggleGroupItem key={value} value={value}>
                        {value === 'all'
                          ? <NavigationListIcon className="size-4" />
                          : value === 'needs_review'
                            ? <StatusWarningIcon className="size-4" />
                            : value === 'ticketed'
                              ? <StatusReadyIcon className="size-4" />
                              : value === 'quoted'
                                ? <NavigationTaskListIcon className="size-4" />
                                : value === 'completed'
                                  ? <ActionConfirmIcon className="size-4" />
                                  : value === 'canceled'
                                    ? <ActionCloseIcon className="size-4" />
                                    : <ActionClipboardAddIcon className="size-4" />}
                        {value === 'all'
                          ? 'All'
                          : value === 'needs_review'
                            ? 'Need review'
                            : value === 'ticketed'
                              ? 'Ticketed'
                              : value === 'quoted'
                                ? 'Quoted'
                                : value === 'completed'
                                  ? 'Completed'
                                  : value === 'canceled'
                                    ? 'Canceled'
                                    : 'New'}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </CardControlRow>
              )}
              title="Live intake"
              tooltip={translateUiLiteral(language, 'Incoming Telegram requests waiting for review, confirmation, or promotion into banji tickets.')}
            >
              {visibleIntakeRows.length > 0 ? (
                <AutomationIntakeTable rows={visibleIntakeRows} onOpenIntake={openIntakeDrawer} />
              ) : (
                <AutomationEmptyState
                  body="No Telegram intake matches this view."
                  title="No Telegram intake"
                />
              )}
            </PerformanceSectionShell>
          ) : null}

          {showExceptionsSection ? (
            <PerformanceSectionShell
              descriptor="Messages that banji could not safely convert into clean customer order intake."
              headerControls={(
                <CardControlRow>
                  {searchControl('Search customers, issues, notes, or intake lines…')}
                  <ToggleGroup
                    className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
                    spacing={1}
                    type="single"
                    value={issueFilter}
                    onValueChange={(value) => {
                      if (value) {
                        setIssueFilter(value as ExceptionIssueFilter);
                      }
                    }}
                  >
                    <ToggleGroupItem value="all">
                      <StatusWarningIcon className="size-4" />
                      All issues
                    </ToggleGroupItem>
                    <ToggleGroupItem value="item_not_found">
                      <ActionSearchOffIcon className="size-4" />
                      Item not found
                    </ToggleGroupItem>
                    <ToggleGroupItem value="quantity_ambiguous">
                      <StatusHelpIcon className="size-4" />
                      Quantity ambiguous
                    </ToggleGroupItem>
                    <ToggleGroupItem value="parser_failed">
                      <EntityEvidenceIcon className="size-4" />
                      Parser failed
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <ToggleGroup
                    className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
                    spacing={1}
                    type="single"
                    value={confidenceFilter}
                    onValueChange={(value) => {
                      if (value) {
                        setConfidenceFilter(value as ExceptionConfidenceFilter);
                      }
                    }}
                  >
                    <ToggleGroupItem value="all">
                      <StatusGaugeIcon className="size-4" />
                      All confidence
                    </ToggleGroupItem>
                    <ToggleGroupItem value="high">
                      <ActionConfirmIcon className="size-4" />
                      High
                    </ToggleGroupItem>
                    <ToggleGroupItem value="medium">
                      <StatusHelpIcon className="size-4" />
                      Medium
                    </ToggleGroupItem>
                    <ToggleGroupItem value="low">
                      <StatusWarningIcon className="size-4" />
                      Low
                    </ToggleGroupItem>
                  </ToggleGroup>
                </CardControlRow>
              )}
              title="Needs review"
              tooltip={translateUiLiteral(language, 'Messages that banji could not safely convert into clean customer order intake.')}
            >
              {visibleExceptionRows.length > 0 ? (
                <AutomationExceptionTable rows={visibleExceptionRows} onOpenIntake={openIntakeDrawer} />
              ) : (
                <AutomationEmptyState
                  body="No review items are waiting right now."
                  title="No review backlog"
                />
              )}
            </PerformanceSectionShell>
          ) : null}
        </div>
      </ChromeTabs>

      <AutomationIntakeDrawer
        conversationId={selectedIntakeRequest?.conversationId ?? null}
        intake={selectedIntake}
        isSaving={isSaving}
        open={selectedIntake != null}
        onClose={() => setSelectedIntakeRequest(null)}
        onPromote={promoteIntake}
        onReadConversation={readConversation}
        onResolve={resolveIntake}
      />
    </WorkspacePage>
  );
}
