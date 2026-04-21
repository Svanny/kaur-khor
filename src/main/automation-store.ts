import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppCurrency } from '@shared/inventory';
import type {
  AutomationAvailabilityStatus,
  AutomationChannelConnection,
  AutomationConversationSummary,
  AutomationExposureEntityType,
  AutomationExposureRow,
  AutomationIntakeLine,
  AutomationIntakeStatus,
  AutomationMessageRecord,
  AutomationOrderIntake,
  AutomationOverviewMetrics,
  AutomationWorkspace,
  PromoteAutomationIntakePayload,
} from '@shared/automation';
import type {
  AutomationConnectionPatch,
  AutomationExposurePatch,
  AutomationListIntakesPayload,
  AutomationResolveIntakePayload,
} from '@shared/ipc';
import type {
  SenaCatalog,
  SenaCommercialEvent,
  SenaCommercialFlow,
  SenaCommercialStage,
  SenaObservationInput,
  SenaObservationRecord,
  SenaService,
  SenaTicketEvent,
  SenaTicketEventType,
  SenaTicketLifecycle,
  SenaTicketStage,
} from '@shared/sena';

type AutomationConnectionRecord = AutomationChannelConnection & {
  botToken: string | null;
};

type AutomationExposureRuleRecord = {
  channel: 'telegram';
  entityType: AutomationExposureEntityType;
  entityId: string;
  exposed: boolean;
  alias: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type AutomationStoreState = {
  version: 1;
  connection: AutomationConnectionRecord;
  exposureRules: AutomationExposureRuleRecord[];
  conversations: AutomationConversationSummary[];
  messages: AutomationMessageRecord[];
  intakes: AutomationOrderIntake[];
};

type ExposureBuildContext = {
  catalog: SenaCatalog | null;
  observations: SenaObservationRecord[];
};

type PromotionPreparation = {
  commercialEvents: SenaCommercialEvent[];
  observationInput: SenaObservationInput;
  ticketEvent: SenaTicketEvent;
  updatedIntake: AutomationOrderIntake;
};

const DEFAULT_CONNECTION: AutomationConnectionRecord = {
  channel: 'telegram',
  status: 'disconnected',
  hasBotToken: false,
  botToken: null,
  botDisplayName: null,
  botUsername: null,
  externalLink: null,
  connectedAt: null,
  pausedAt: null,
  lastWebhookAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
};

const DEFAULT_STATE: AutomationStoreState = {
  version: 1,
  connection: DEFAULT_CONNECTION,
  exposureRules: [],
  conversations: [],
  messages: [],
  intakes: [],
};

let automationWriteQueue: Promise<void> = Promise.resolve();

function automationStorePath(userDataPath: string) {
  return join(userDataPath, 'desktop-automation-store.json');
}

function nowIso() {
  return new Date().toISOString();
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function safeLower(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function automationTextIncludes(haystack: Array<string | null | undefined>, query: string) {
  const normalizedQuery = safeLower(query);
  if (!normalizedQuery) {
    return true;
  }
  return haystack.some((entry) => safeLower(entry).includes(normalizedQuery));
}

function normalizeState(value: Partial<AutomationStoreState> | null | undefined): AutomationStoreState {
  return {
    version: 1,
    connection: {
      ...DEFAULT_CONNECTION,
      ...value?.connection,
      channel: 'telegram',
    },
    exposureRules: Array.isArray(value?.exposureRules) ? value.exposureRules : [],
    conversations: Array.isArray(value?.conversations) ? value.conversations : [],
    messages: Array.isArray(value?.messages) ? value.messages : [],
    intakes: Array.isArray(value?.intakes) ? value.intakes : [],
  };
}

async function loadAutomationState(userDataPath: string): Promise<AutomationStoreState> {
  try {
    const raw = await readFile(automationStorePath(userDataPath), 'utf8');
    return normalizeState(JSON.parse(raw) as Partial<AutomationStoreState>);
  } catch {
    return DEFAULT_STATE;
  }
}

async function writeAutomationState(userDataPath: string, state: AutomationStoreState) {
  const path = automationStorePath(userDataPath);
  await mkdir(userDataPath, { recursive: true });
  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf8');
  await rename(tempPath, path);
}

async function updateAutomationState<T>(
  userDataPath: string,
  updater: (state: AutomationStoreState) => T | Promise<T>,
): Promise<T> {
  const writeOperation = automationWriteQueue.then(async () => {
    const current = await loadAutomationState(userDataPath);
    const draft = normalizeState(current);
    const result = await updater(draft);
    await writeAutomationState(userDataPath, draft);
    return result;
  });
  automationWriteQueue = writeOperation.then(
    () => undefined,
    () => undefined,
  );
  return writeOperation;
}

function latestStockBySku(observations: SenaObservationRecord[]) {
  const latest = new Map<string, number>();
  const ordered = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of ordered) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!latest.has(snapshot.skuId)) {
        latest.set(snapshot.skuId, snapshot.unitsInStock);
      }
    }
  }
  return latest;
}

function linkedSkuIdsForService(catalog: SenaCatalog, serviceId: string) {
  return catalog.sharingMask
    .filter((entry) => entry.serviceId === serviceId && entry.enabled)
    .map((entry) => entry.skuId);
}

function availabilityLabel(status: AutomationAvailabilityStatus) {
  switch (status) {
    case 'available':
      return 'Available';
    case 'limited':
      return 'Limited';
    case 'unavailable':
      return 'Unavailable';
    case 'hidden':
      return 'Hidden';
    default:
      return 'Unknown';
  }
}

function deriveSkuAvailability(
  sku: SenaCatalog['skus'][number],
  stockBySku: Map<string, number>,
): AutomationAvailabilityStatus {
  if (sku.archived || !sku.soldAsProduct || sku.productPrice == null) {
    return 'hidden';
  }
  const units = stockBySku.get(sku.skuId);
  if (units == null) {
    return 'unknown';
  }
  if (units <= 0) {
    return 'unavailable';
  }
  if (units <= 3) {
    return 'limited';
  }
  return 'available';
}

function deriveServiceAvailability(
  service: SenaService,
  catalog: SenaCatalog,
  stockBySku: Map<string, number>,
): AutomationAvailabilityStatus {
  if (service.archived) {
    return 'hidden';
  }
  const linkedSkuIds = linkedSkuIdsForService(catalog, service.serviceId);
  if (linkedSkuIds.length === 0) {
    return 'available';
  }
  const linkedUnits = linkedSkuIds
    .map((skuId) => stockBySku.get(skuId))
    .filter((value): value is number => value != null);
  if (linkedUnits.length === 0) {
    return 'unknown';
  }
  const lowestUnits = Math.min(...linkedUnits);
  if (lowestUnits <= 0) {
    return 'unavailable';
  }
  if (lowestUnits <= 2) {
    return 'limited';
  }
  return 'available';
}

function buildExposureRows(
  state: AutomationStoreState,
  { catalog, observations }: ExposureBuildContext,
): AutomationExposureRow[] {
  if (!catalog) {
    return [];
  }

  const stockBySku = latestStockBySku(observations);
  const rulesByKey = new Map(
    state.exposureRules.map((rule) => [`${rule.entityType}:${rule.entityId}`, rule] as const),
  );

  const skuRows = catalog.skus.map((sku) => {
    const availabilityStatus = deriveSkuAvailability(sku, stockBySku);
    const rule = rulesByKey.get(`sku:${sku.skuId}`);
    return {
      entityType: 'sku' as const,
      entityId: sku.skuId,
      label: sku.name,
      imagePath: sku.imagePath ?? null,
      supplierName: sku.supplierName ?? null,
      archived: sku.archived,
      exposed: availabilityStatus === 'hidden' ? false : rule?.exposed ?? false,
      price: sku.productPrice,
      availabilityStatus,
      availabilityLabel: availabilityLabel(availabilityStatus),
      alias: rule?.alias ?? null,
      sortOrder: rule?.sortOrder ?? 0,
    } satisfies AutomationExposureRow;
  });

  const serviceRows = catalog.services.map((service) => {
    const availabilityStatus = deriveServiceAvailability(service, catalog, stockBySku);
    const rule = rulesByKey.get(`service:${service.serviceId}`);
    return {
      entityType: 'service' as const,
      entityId: service.serviceId,
      label: service.name,
      imagePath: service.imagePath ?? null,
      supplierName: null,
      archived: service.archived,
      exposed: availabilityStatus === 'hidden' ? false : rule?.exposed ?? false,
      price: service.price,
      availabilityStatus,
      availabilityLabel: availabilityLabel(availabilityStatus),
      alias: rule?.alias ?? null,
      sortOrder: rule?.sortOrder ?? 0,
    } satisfies AutomationExposureRow;
  });

  return [...skuRows, ...serviceRows].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.label.localeCompare(right.label);
  });
}

function recalculateConversation(state: AutomationStoreState, conversationId: string) {
  const conversation = state.conversations.find((entry) => entry.conversationId === conversationId);
  if (!conversation) {
    return;
  }
  const conversationMessages = state.messages
    .filter((message) => message.conversationId === conversationId)
    .sort((left, right) => new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime());
  const conversationIntakes = state.intakes
    .filter((intake) => intake.conversationId === conversationId)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  conversation.messageCount = conversationMessages.length;
  conversation.lastMessageAt = conversationMessages[0]?.sentAt ?? conversation.lastMessageAt;
  conversation.latestIntakeStatus = conversationIntakes[0]?.status ?? null;
  conversation.latestTicketId = conversationIntakes.find((intake) => intake.promotedTicketId)?.promotedTicketId ?? null;
}

function summarizeRequest(lines: AutomationIntakeLine[]) {
  if (lines.length === 0) {
    return 'No items';
  }
  const visible = lines.slice(0, 2).map((line) => {
    const quantity = line.quantity != null ? `${line.quantity} x ` : '';
    return `${quantity}${line.resolvedLabel ?? line.requestedLabel}`;
  });
  const overflow = lines.length - visible.length;
  return overflow > 0 ? `${visible.join(', ')} +${overflow} more` : visible.join(', ');
}

function buildAutomationMetrics(intakes: AutomationOrderIntake[], exposures: AutomationExposureRow[]): AutomationOverviewMetrics {
  const todayFloor = startOfTodayIso();
  const todayIntakes = intakes.filter((intake) => intake.createdAt >= todayFloor);
  return {
    ordersToday: todayIntakes.length,
    needsReview: intakes.filter((intake) => intake.status === 'needs_review' || intake.status === 'failed').length,
    quotedToday: todayIntakes.filter((intake) => intake.status === 'quoted').length,
    ticketedToday: todayIntakes.filter((intake) => intake.status === 'ticketed').length,
    completedToday: todayIntakes.filter((intake) => intake.status === 'completed').length,
    exposedSellables: exposures.filter((row) => row.exposed).length,
  };
}

function ticketEventTypeForMode(mode: PromoteAutomationIntakePayload['mode']): SenaTicketEventType {
  return mode === 'append_ticket' ? 'revised' : 'created';
}

function ticketStageForMode(): SenaTicketStage {
  return 'pending';
}

function ticketLifecycleForMode(): SenaTicketLifecycle {
  return 'open';
}

function existingTicketRevision(observations: SenaObservationRecord[], ticketId: string) {
  return observations
    .flatMap((observation) => observation.input.ticketEvents ?? [])
    .filter((event) => event.ticketId === ticketId)
    .sort((left, right) => right.revision - left.revision)[0]?.revision ?? 0;
}

function buildPromotionNote(intake: AutomationOrderIntake, operatorNote: string | null | undefined) {
  const parts = [
    operatorNote?.trim() || null,
    `Telegram intake ${intake.intakeId}`,
    summarizeRequest(intake.lines),
    intake.quotedTotal != null ? `Quoted total ${intake.currencyCode} ${intake.quotedTotal.toFixed(2)}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  return parts.join(' · ');
}

function filterIntakes(intakes: AutomationOrderIntake[], payload?: AutomationListIntakesPayload) {
  const filteredByStatus = payload?.status
    ? intakes.filter((intake) => intake.status === payload.status)
    : intakes;
  const filteredByConversation = payload?.conversationId
    ? filteredByStatus.filter((intake) => intake.conversationId === payload.conversationId)
    : filteredByStatus;
  const filteredByTicket = payload?.ticketId
    ? filteredByConversation.filter((intake) => intake.promotedTicketId === payload.ticketId)
    : filteredByConversation;
  if (!payload?.q?.trim()) {
    return filteredByTicket;
  }
  return filteredByTicket.filter((intake) =>
    automationTextIncludes(
      [
        intake.customerDisplayName,
        intake.customerHandle,
        intake.phone,
        intake.notes,
        ...intake.lines.map((line) => line.requestedLabel),
        ...intake.lines.map((line) => line.resolvedLabel),
      ],
      payload.q,
    ),
  );
}

function currencyCodeForAppCurrency(currency: AppCurrency): 'USD' | 'KHR' {
  return currency === 'KHR' ? 'KHR' : 'USD';
}

function sampleQuantity(index: number) {
  return index === 0 ? 2 : 1;
}

function buildSampleLine(row: AutomationExposureRow, index: number): AutomationIntakeLine {
  const quantity = sampleQuantity(index);
  const unitPrice = row.price;
  return {
    lineId: `line_${randomUUID()}`,
    entityType: row.entityType,
    entityId: row.entityId,
    requestedLabel: row.alias ?? row.label,
    resolvedLabel: row.label,
    quantity,
    unitPrice,
    lineTotal: unitPrice != null ? quantity * unitPrice : null,
    availabilityStatus: row.availabilityStatus,
    ambiguityReason: null,
  };
}

export async function readAutomationWorkspace(
  userDataPath: string,
  context: ExposureBuildContext,
): Promise<AutomationWorkspace> {
  const state = await loadAutomationState(userDataPath);
  const exposures = buildExposureRows(state, context);
  return {
    connection: state.connection,
    metrics: buildAutomationMetrics(state.intakes, exposures),
    exposures,
    conversations: [...state.conversations].sort((left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime()),
    intakes: [...state.intakes].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
  };
}

export async function readAutomationConnection(userDataPath: string): Promise<AutomationChannelConnection> {
  return (await loadAutomationState(userDataPath)).connection;
}

export async function saveAutomationConnection(
  userDataPath: string,
  payload: AutomationConnectionPatch,
): Promise<AutomationChannelConnection> {
  return updateAutomationState(userDataPath, (state) => {
    const now = nowIso();
    const current = state.connection;
    state.connection = {
      ...current,
      status: payload.status ?? current.status,
      botToken: payload.botToken === undefined ? current.botToken : payload.botToken,
      hasBotToken: payload.botToken === undefined ? current.hasBotToken : Boolean(payload.botToken?.trim()),
      botDisplayName: payload.botDisplayName === undefined ? current.botDisplayName : payload.botDisplayName,
      botUsername: payload.botUsername === undefined ? current.botUsername : payload.botUsername,
      externalLink: payload.externalLink === undefined ? current.externalLink : payload.externalLink,
      connectedAt:
        payload.status === 'connected'
          ? current.connectedAt ?? now
          : payload.status === 'disconnected'
            ? null
            : current.connectedAt,
      pausedAt:
        payload.status === 'paused'
          ? now
          : payload.status === 'connected' || payload.status === 'disconnected'
            ? null
            : current.pausedAt,
      lastErrorAt: payload.status === 'error' ? now : payload.status === 'connected' || payload.status === 'disconnected' ? null : current.lastErrorAt,
      lastErrorMessage:
        payload.status === 'error'
          ? 'Telegram transport is not wired in this local phase; use Test message to validate the intake pipeline.'
          : payload.status === 'connected' || payload.status === 'disconnected'
            ? null
            : current.lastErrorMessage,
    };
    return state.connection;
  });
}

export async function listAutomationExposureRows(
  userDataPath: string,
  context: ExposureBuildContext,
): Promise<AutomationExposureRow[]> {
  return buildExposureRows(await loadAutomationState(userDataPath), context);
}

export async function patchAutomationExposureRow(
  userDataPath: string,
  context: ExposureBuildContext,
  payload: AutomationExposurePatch,
): Promise<AutomationExposureRow> {
  await updateAutomationState(userDataPath, (state) => {
    const existing = state.exposureRules.find(
      (rule) => rule.channel === 'telegram' && rule.entityType === payload.entityType && rule.entityId === payload.entityId,
    );
    const now = nowIso();
    if (existing) {
      existing.exposed = payload.exposed ?? existing.exposed;
      existing.alias = payload.alias === undefined ? existing.alias : payload.alias;
      existing.sortOrder = payload.sortOrder ?? existing.sortOrder;
      existing.updatedAt = now;
      return;
    }
    state.exposureRules.push({
      channel: 'telegram',
      entityType: payload.entityType,
      entityId: payload.entityId,
      exposed: payload.exposed ?? false,
      alias: payload.alias ?? null,
      sortOrder: payload.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  });
  const rows = await listAutomationExposureRows(userDataPath, context);
  const row = rows.find((entry) => entry.entityType === payload.entityType && entry.entityId === payload.entityId);
  if (!row) {
    throw new Error('Automation exposure row not found.');
  }
  return row;
}

export async function listAutomationConversations(userDataPath: string): Promise<AutomationConversationSummary[]> {
  const state = await loadAutomationState(userDataPath);
  return [...state.conversations].sort((left, right) => new Date(right.lastMessageAt).getTime() - new Date(left.lastMessageAt).getTime());
}

export async function readAutomationConversation(
  userDataPath: string,
  conversationId: string,
): Promise<{
  conversation: AutomationConversationSummary;
  messages: AutomationMessageRecord[];
  intakes: AutomationOrderIntake[];
}> {
  const state = await loadAutomationState(userDataPath);
  const conversation = state.conversations.find((entry) => entry.conversationId === conversationId);
  if (!conversation) {
    throw new Error('Automation conversation not found.');
  }
  return {
    conversation,
    messages: state.messages
      .filter((entry) => entry.conversationId === conversationId)
      .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime()),
    intakes: state.intakes
      .filter((entry) => entry.conversationId === conversationId)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
  };
}

export async function listAutomationIntakes(
  userDataPath: string,
  payload?: AutomationListIntakesPayload,
): Promise<AutomationOrderIntake[]> {
  const state = await loadAutomationState(userDataPath);
  return filterIntakes(
    [...state.intakes].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    payload,
  );
}

export async function readAutomationIntake(
  userDataPath: string,
  intakeId: string,
): Promise<AutomationOrderIntake | null> {
  const state = await loadAutomationState(userDataPath);
  return state.intakes.find((entry) => entry.intakeId === intakeId) ?? null;
}

export async function resolveAutomationIntake(
  userDataPath: string,
  payload: AutomationResolveIntakePayload,
): Promise<AutomationOrderIntake> {
  return updateAutomationState(userDataPath, (state) => {
    const intake = state.intakes.find((entry) => entry.intakeId === payload.intakeId);
    if (!intake) {
      throw new Error('Automation intake not found.');
    }
    intake.status = payload.status;
    intake.updatedAt = nowIso();
    intake.notes = payload.note?.trim()
      ? [intake.notes, payload.note.trim()].filter(Boolean).join('\n')
      : intake.notes;
    recalculateConversation(state, intake.conversationId);
    return intake;
  });
}

export async function testAutomationTelegramConnection(
  userDataPath: string,
  context: ExposureBuildContext & { currency: AppCurrency },
): Promise<AutomationChannelConnection> {
  const state = await loadAutomationState(userDataPath);
  if (!state.connection.botToken?.trim()) {
    throw new Error('Save a Telegram bot token before running a test message.');
  }
  const exposedRows = buildExposureRows(state, context).filter((row) => row.exposed && row.price != null);
  if (exposedRows.length === 0) {
    throw new Error('Expose at least one sellable row before running a test message.');
  }

  const now = nowIso();
  const selectedRows = exposedRows.slice(0, Math.min(2, exposedRows.length));
  const lines = selectedRows.map(buildSampleLine);
  const quotedSubtotal = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const conversationId = `conv_${randomUUID()}`;
  const intakeId = `intake_${randomUUID()}`;

  await updateAutomationState(userDataPath, (draft) => {
    draft.connection = {
      ...draft.connection,
      status: 'connected',
      connectedAt: draft.connection.connectedAt ?? now,
      lastWebhookAt: now,
      lastErrorAt: null,
      lastErrorMessage: null,
    };
    draft.conversations.unshift({
      conversationId,
      channel: 'telegram',
      externalConversationKey: `telegram-chat-${Date.now()}`,
      customerDisplayName: 'Telegram Test Customer',
      customerHandle: '@telegram_test_customer',
      phone: '+85512000000',
      lastMessageAt: now,
      messageCount: 1,
      latestIntakeStatus: 'new',
      latestTicketId: null,
    });
    draft.messages.unshift({
      messageId: `msg_${randomUUID()}`,
      conversationId,
      externalMessageKey: `telegram-message-${Date.now()}`,
      direction: 'inbound',
      sentAt: now,
      rawText: `Hi, I want ${selectedRows.map((row, index) => `${sampleQuantity(index)} ${row.alias ?? row.label}`).join(' and ')}`,
      normalizedText: selectedRows.map((row) => row.alias ?? row.label).join(', '),
      parseConfidence: 'high',
    });
    draft.intakes.unshift({
      intakeId,
      conversationId,
      channel: 'telegram',
      status: 'new',
      parseConfidence: 'high',
      customerDisplayName: 'Telegram Test Customer',
      customerHandle: '@telegram_test_customer',
      phone: '+85512000000',
      notes: 'Generated from Test message.',
      quotedSubtotal,
      currencyCode: currencyCodeForAppCurrency(context.currency),
      deliveryFee: null,
      quotedTotal: quotedSubtotal,
      createdAt: now,
      updatedAt: now,
      promotedTicketId: null,
      lines,
    });
  });

  return readAutomationConnection(userDataPath);
}

export async function prepareAutomationPromotion(
  userDataPath: string,
  payload: PromoteAutomationIntakePayload,
  {
    observations,
  }: {
    observations: SenaObservationRecord[];
  },
): Promise<PromotionPreparation> {
  const state = await loadAutomationState(userDataPath);
  const intake = state.intakes.find((entry) => entry.intakeId === payload.intakeId);
  if (!intake) {
    throw new Error('Automation intake not found.');
  }
  if (observations.length === 0) {
    throw new Error('Automations needs at least one stock update before it can promote Telegram intake into Banji tickets.');
  }
  const unresolvedLine = intake.lines.find((line) =>
    line.entityId == null || line.quantity == null || line.quantity <= 0 || line.unitPrice == null || line.lineTotal == null,
  );
  if (unresolvedLine) {
    throw new Error('All Telegram intake lines must resolve to priced entities before promotion.');
  }
  if (payload.mode === 'append_ticket' && !payload.ticketId) {
    throw new Error('Appending Telegram intake requires a target customer ticket.');
  }
  const observedAt = nowIso();
  const ticketId = payload.mode === 'append_ticket'
    ? payload.ticketId!
    : `ticket:customer:${Date.now()}:created:automation-${intake.intakeId}`;
  const revision = payload.mode === 'append_ticket' ? existingTicketRevision(observations, ticketId) + 1 : 1;
  const note = buildPromotionNote(intake, payload.note);
  const lines = intake.lines.map((line) => ({
    entityType: line.entityType,
    entityId: line.entityId!,
    quantityDelta: line.quantity,
    note: line.requestedLabel !== line.resolvedLabel ? `Requested as ${line.requestedLabel}` : line.requestedLabel,
  }));
  const ticketEvent: SenaTicketEvent = {
    ticketId,
    ticketFamily: 'customer',
    lifecycle: ticketLifecycleForMode(),
    stage: ticketStageForMode(),
    revision,
    eventType: ticketEventTypeForMode(payload.mode),
    occurredAt: observedAt,
    nextTouchAt: null,
    party: {
      role: 'customer',
      channelKey: 'telegram',
      channelLabel: 'Telegram',
      customerName: payload.customerIdentityOverride?.customerName?.trim() || intake.customerDisplayName || intake.customerHandle || 'Telegram customer',
      customerNameKey: safeLower(payload.customerIdentityOverride?.customerName || intake.customerDisplayName || intake.customerHandle || 'Telegram customer'),
      phone: payload.customerIdentityOverride?.phone?.trim() || intake.phone || null,
      phoneKey: safeLower((payload.customerIdentityOverride?.phone || intake.phone || '').replace(/[^\d+]/g, '')),
      supplierName: null,
    },
    lines,
    note,
  };

  const commercialEvents: SenaCommercialEvent[] = intake.lines.map((line) => ({
    party: 'customer',
    entityType: line.entityType,
    entityId: line.entityId!,
    stage: 'pending' as SenaCommercialStage,
    quantityDelta: line.quantity!,
    flow: 'scheduled' as SenaCommercialFlow,
    reason: 'telegram_intake_promoted',
    note: `Telegram intake ${intake.intakeId}`,
  }));

  const updatedIntake: AutomationOrderIntake = {
    ...intake,
    status: 'ticketed',
    promotedTicketId: ticketId,
    updatedAt: observedAt,
    notes: note,
  };

  return {
    ticketEvent,
    commercialEvents,
    updatedIntake,
    observationInput: {
      observedAt,
      stockSnapshot: [],
      retailSalesSnapshot: [],
      serviceSalesSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [],
      commercialEvents,
      ticketEvents: [ticketEvent],
      recipeUsageHints: [],
      notes: note,
    },
  };
}

export async function finalizeAutomationPromotion(
  userDataPath: string,
  updatedIntake: AutomationOrderIntake,
): Promise<AutomationOrderIntake> {
  return updateAutomationState(userDataPath, (state) => {
    const intakeIndex = state.intakes.findIndex((entry) => entry.intakeId === updatedIntake.intakeId);
    if (intakeIndex < 0) {
      throw new Error('Automation intake disappeared before promotion completed.');
    }
    state.intakes[intakeIndex] = updatedIntake;
    recalculateConversation(state, updatedIntake.conversationId);
    return updatedIntake;
  });
}
