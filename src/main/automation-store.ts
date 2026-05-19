import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import type {
  AutomationAvailabilityStatus,
  AutomationChannelConnection,
  AutomationConnectionStatus,
  AutomationCustomerMessagePayload,
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
import {
  isAutomationEligibleService,
  isAutomationEligibleSku,
} from '@shared/automation-sellables';
import type {
  SenaCatalog,
  SenaCommercialEvent,
  SenaCommercialFlow,
  SenaCommercialStage,
  SenaObservationInput,
  SenaObservationRecord,
  SenaRecordUpdateContext,
  SenaService,
  SenaStockSnapshot,
  SenaTicketEvent,
  SenaTicketEventType,
  SenaTicketLifecycle,
  SenaTicketStage,
} from '@shared/sena';
import {
  formatPhoneForDisplay,
  normalizePhoneLookupKey,
  normalizePhoneNumber,
} from '@shared/phone';
import type {
  TelegramBotUser,
  TelegramChat,
  TelegramInlineKeyboardMarkup,
  TelegramMessage,
  TelegramReplyKeyboardMarkup,
  TelegramReplyKeyboardRemove,
  TelegramUpdate,
} from './telegram-bot-api';

type AutomationConnectionRecord = AutomationChannelConnection & {
  botToken: string | null;
  commandsConfiguredAt: string | null;
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
  telegramUpdateCursor: number | null;
  connection: AutomationConnectionRecord;
  exposureRules: AutomationExposureRuleRecord[];
  conversations: AutomationConversationSummary[];
  messages: AutomationMessageRecord[];
  intakes: AutomationOrderIntake[];
  customerPreferences: AutomationCustomerPreferencesRecord[];
  wizardSessions: AutomationWizardSession[];
  pendingOutboundJobs: AutomationPendingTelegramOutboundJob[];
};

type AutomationWizardStep =
  | 'menu'
  | 'catalog'
  | 'item'
  | 'cart'
  | 'preferences_language'
  | 'preferences_currency'
  | 'checkout_identity'
  | 'checkout_location'
  | 'checkout_note'
  | 'checkout_confirm';

type AutomationWizardPendingPromptIntent = 'share_phone' | 'share_location' | 'share_note' | null;

type AutomationWizardCartLine = {
  entityType: AutomationExposureEntityType;
  entityId: string;
  label: string;
  quantity: number;
  unitPrice: number | null;
  availabilityStatus: AutomationAvailabilityStatus;
};

type AutomationWizardSession = {
  conversationId: string;
  currentStep: AutomationWizardStep;
  catalogCursor: number;
  pendingPromptIntent: AutomationWizardPendingPromptIntent;
  lastWizardMessageId: number | null;
  generatedWizardMessageIds: number[];
  lastItemImageMessageId: number | null;
  selectedEntityType: AutomationExposureEntityType | null;
  selectedEntityId: string | null;
  selectedItemImageEntityType: AutomationExposureEntityType | null;
  selectedItemImageEntityId: string | null;
  draftLines: AutomationWizardCartLine[];
  phone: string | null;
  deliveryLocation: string | null;
  customerNote: string | null;
  updatedAt: string;
};

type AutomationCustomerPreferencesRecord = {
  conversationId: string;
  language: AppLanguage;
  currency: AppCurrency;
  configuredAt: string;
  updatedAt: string;
};

type TelegramCustomerPreferences = {
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
};

type TelegramMessageMarkup = TelegramInlineKeyboardMarkup | TelegramReplyKeyboardMarkup | TelegramReplyKeyboardRemove | undefined;

export type TelegramOutboundJob =
  | {
    kind: 'send';
    chatId: string;
    conversationId: string;
    intakeId?: string | null;
    text: string;
    parseMode?: 'HTML';
    replyMarkup?: TelegramMessageMarkup;
    storesWizardMessage?: boolean;
    messageRole?: 'wizard_generated' | 'receipt';
  }
  | {
    kind: 'edit';
    chatId: string;
    conversationId: string;
    messageId: number;
    text: string;
    parseMode?: 'HTML';
    replyMarkup?: TelegramInlineKeyboardMarkup;
  }
  | {
    kind: 'edit_reply_markup';
    chatId: string;
    conversationId: string;
    messageId: number;
    replyMarkup?: TelegramInlineKeyboardMarkup;
  }
  | {
    kind: 'answer_callback';
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  }
  | {
    kind: 'send_photo';
    chatId: string;
    conversationId: string;
    intakeId?: string | null;
    photoPath: string;
    caption?: string;
    parseMode?: 'HTML';
    storesItemImage?: {
      entityType: AutomationExposureEntityType;
      entityId: string;
    };
  }
  | {
    kind: 'delete_message';
    chatId: string;
    conversationId: string;
    messageId: number;
    nonFatal?: boolean;
  };

export type AutomationPendingTelegramOutboundJob = {
  jobId: string;
  createdAt: string;
  job: TelegramOutboundJob;
  sentMessage?: {
    messageId: number;
    sentAt: string;
    text: string;
  };
};

type ExposureBuildContext = {
  catalog: SenaCatalog | null;
  recordUpdateContext: SenaRecordUpdateContext;
};

type PromotionPreparation = {
  commercialEvents: SenaCommercialEvent[];
  observationInput: SenaObservationInput;
  shouldIngestObservation: boolean;
  ticketEvent: SenaTicketEvent;
  updatedIntake: AutomationOrderIntake;
};

const DEFAULT_CONNECTION: AutomationConnectionRecord = {
  channel: 'telegram',
  status: 'disconnected',
  hasBotToken: false,
  botToken: null,
  commandsConfiguredAt: null,
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
  telegramUpdateCursor: null,
  connection: DEFAULT_CONNECTION,
  exposureRules: [],
  conversations: [],
  messages: [],
  intakes: [],
  customerPreferences: [],
  wizardSessions: [],
  pendingOutboundJobs: [],
};

let automationWriteQueue: Promise<void> = Promise.resolve();
const AUTOMATION_CONNECTION_STATUSES = new Set<AutomationConnectionStatus>([
  'connected',
  'disconnected',
  'error',
  'paused',
]);
const AUTOMATION_LIST_INTAKE_STATUSES = new Set<AutomationIntakeStatus>([
  'new',
  'needs_review',
  'quoted',
  'ticketed',
  'completed',
  'canceled',
  'failed',
]);
const AUTOMATION_RESOLVE_INTAKE_STATUSES = new Set<AutomationResolveIntakePayload['status']>([
  'needs_review',
  'quoted',
  'canceled',
]);

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
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeNullablePhone(value: string | null | undefined) {
  const normalized = normalizePhoneNumber(value);
  return normalized || null;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function normalizeConnectionStatus(value: unknown): AutomationConnectionStatus {
  return typeof value === 'string' && AUTOMATION_CONNECTION_STATUSES.has(value as AutomationConnectionStatus)
    ? value as AutomationConnectionStatus
    : DEFAULT_CONNECTION.status;
}

function normalizeTelegramUpdateCursor(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function automationCreatedAtSortValue(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function automationTimestampMs(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareAutomationNewestFirst(left: string | null | undefined, right: string | null | undefined) {
  return (automationTimestampMs(right) ?? Number.NEGATIVE_INFINITY) - (automationTimestampMs(left) ?? Number.NEGATIVE_INFINITY);
}

function compareAutomationOldestFirst(left: string | null | undefined, right: string | null | undefined) {
  return (automationTimestampMs(left) ?? Number.POSITIVE_INFINITY) - (automationTimestampMs(right) ?? Number.POSITIVE_INFINITY);
}

function normalizeExposureRules(value: unknown): AutomationExposureRuleRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is Partial<AutomationExposureRuleRecord> =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      (entry as Partial<AutomationExposureRuleRecord>).channel === 'telegram' &&
      ((entry as Partial<AutomationExposureRuleRecord>).entityType === 'sku' || (entry as Partial<AutomationExposureRuleRecord>).entityType === 'service') &&
      typeof (entry as Partial<AutomationExposureRuleRecord>).entityId === 'string' &&
      (entry as Partial<AutomationExposureRuleRecord>).entityId!.trim().length > 0,
    )
    .map((entry) => ({
      channel: 'telegram',
      entityType: entry.entityType!,
      entityId: entry.entityId!.trim(),
      exposed: typeof entry.exposed === 'boolean' ? entry.exposed : false,
      alias: normalizeOptionalString(entry.alias),
      sortOrder: typeof entry.sortOrder === 'number' && Number.isFinite(entry.sortOrder) ? entry.sortOrder : 0,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : nowIso(),
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowIso(),
    }));
}

function assertNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertAutomationConnectionPatchIsValid(payload: AutomationConnectionPatch) {
  if (!payload || payload.channel !== 'telegram') {
    throw new Error('Automation connection updates must target the Telegram channel.');
  }
  if (payload.status !== undefined && !AUTOMATION_CONNECTION_STATUSES.has(payload.status)) {
    throw new Error('Automation connection status is invalid.');
  }
  for (const [key, value] of Object.entries({
    botToken: payload.botToken,
    botDisplayName: payload.botDisplayName,
    botUsername: payload.botUsername,
    externalLink: payload.externalLink,
  })) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new Error(`Automation connection ${key} must be a string or null.`);
    }
  }
}

function assertAutomationExposurePatchIsValid(payload: AutomationExposurePatch) {
  if (!payload || (payload.entityType !== 'sku' && payload.entityType !== 'service')) {
    throw new Error('Automation exposure updates must target a SKU or service.');
  }
  if (typeof payload.entityId !== 'string' || payload.entityId.trim().length === 0) {
    throw new Error('Automation exposure updates require an entity id.');
  }
  if (payload.exposed !== undefined && typeof payload.exposed !== 'boolean') {
    throw new Error('Automation exposure flag must be a boolean.');
  }
  if (payload.alias !== undefined && payload.alias !== null && typeof payload.alias !== 'string') {
    throw new Error('Automation exposure alias must be a string or null.');
  }
  if (
    payload.sortOrder !== undefined &&
    payload.sortOrder !== null &&
    (typeof payload.sortOrder !== 'number' || !Number.isFinite(payload.sortOrder))
  ) {
    throw new Error('Automation exposure sort order must be a finite number or null.');
  }
}

function assertAutomationListIntakesPayloadIsValid(payload: AutomationListIntakesPayload | undefined) {
  if (payload === undefined) {
    return;
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Automation intake filters must be an object.');
  }
  if (payload.status !== undefined && !AUTOMATION_LIST_INTAKE_STATUSES.has(payload.status)) {
    throw new Error('Automation intake status filter is invalid.');
  }
  for (const [key, value] of Object.entries({
    conversationId: payload.conversationId,
    q: payload.q,
    ticketId: payload.ticketId,
  })) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new Error(`Automation intake filter ${key} must be a string or null.`);
    }
  }
}

function assertAutomationReadConversationIdIsValid(conversationId: unknown) {
  assertNonEmptyString(conversationId, 'Automation conversation reads require a conversation id.');
}

function assertAutomationReadIntakeIdIsValid(intakeId: unknown) {
  assertNonEmptyString(intakeId, 'Automation intake reads require an intake id.');
}

function assertAutomationResolvePayloadIsValid(payload: AutomationResolveIntakePayload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Automation intake resolution must be an object.');
  }
  assertNonEmptyString(payload.intakeId, 'Automation intake resolution requires an intake id.');
  if (!AUTOMATION_RESOLVE_INTAKE_STATUSES.has(payload.status)) {
    throw new Error('Automation intake resolution status is invalid.');
  }
  if (payload.note !== undefined && payload.note !== null && typeof payload.note !== 'string') {
    throw new Error('Automation intake resolution note must be a string or null.');
  }
  assertAutomationCustomerMessagePayloadIsValid(payload.customerMessage);
}

function assertAutomationCustomerMessagePayloadIsValid(payload: unknown) {
  if (payload === undefined) {
    return;
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('Automation customer message must be an object.');
  }
  const message = payload as AutomationCustomerMessagePayload;
  if (typeof message.send !== 'boolean') {
    throw new Error('Automation customer message send flag must be a boolean.');
  }
  if (message.text !== null && typeof message.text !== 'string') {
    throw new Error('Automation customer message text must be a string or null.');
  }
}

function assertPromoteAutomationIntakePayloadIsValid(payload: PromoteAutomationIntakePayload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Automation promotion must be an object.');
  }
  assertNonEmptyString(payload.intakeId, 'Automation promotion requires an intake id.');
  if (payload.mode !== 'create_ticket' && payload.mode !== 'append_ticket') {
    throw new Error('Automation promotion mode is invalid.');
  }
  if (payload.mode === 'append_ticket') {
    assertNonEmptyString(payload.ticketId, 'Appending Telegram intake requires a target customer ticket.');
  } else if (payload.ticketId !== undefined && payload.ticketId !== null && typeof payload.ticketId !== 'string') {
    throw new Error('Automation promotion ticket id must be a string or null.');
  }
  if (payload.note !== undefined && payload.note !== null && typeof payload.note !== 'string') {
    throw new Error('Automation promotion note must be a string or null.');
  }
  assertAutomationCustomerMessagePayloadIsValid(payload.customerMessage);
  const identity = payload.customerIdentityOverride;
  if (identity !== undefined) {
    if (!identity || typeof identity !== 'object') {
      throw new Error('Automation promotion customer identity override must be an object.');
    }
    if (identity.customerName !== undefined && identity.customerName !== null && typeof identity.customerName !== 'string') {
      throw new Error('Automation promotion customer name must be a string or null.');
    }
    if (identity.phone !== undefined && identity.phone !== null && typeof identity.phone !== 'string') {
      throw new Error('Automation promotion phone must be a string or null.');
    }
  }
}

function automationTextIncludes(haystack: Array<string | null | undefined>, query: string) {
  const normalizedQuery = safeLower(query);
  if (!normalizedQuery) {
    return true;
  }
  return haystack.some((entry) => safeLower(entry).includes(normalizedQuery));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeState(value: Partial<AutomationStoreState> | null | undefined): AutomationStoreState {
  const connection = value?.connection;
  const normalizedBotToken = normalizeOptionalString(connection?.botToken);
  return {
    version: 1,
    connection: {
      ...DEFAULT_CONNECTION,
      botDisplayName: normalizeOptionalString(connection?.botDisplayName),
      botToken: normalizedBotToken,
      botUsername: normalizeOptionalString(connection?.botUsername),
      channel: 'telegram',
      commandsConfiguredAt: normalizeOptionalString(connection?.commandsConfiguredAt),
      connectedAt: normalizeOptionalString(connection?.connectedAt),
      externalLink: normalizeOptionalString(connection?.externalLink),
      hasBotToken: Boolean(normalizedBotToken),
      lastErrorAt: normalizeOptionalString(connection?.lastErrorAt),
      lastErrorMessage: normalizeOptionalString(connection?.lastErrorMessage),
      lastWebhookAt: normalizeOptionalString(connection?.lastWebhookAt),
      pausedAt: normalizeOptionalString(connection?.pausedAt),
      status: normalizeConnectionStatus(connection?.status),
    },
    telegramUpdateCursor: normalizeTelegramUpdateCursor(value?.telegramUpdateCursor),
    exposureRules: normalizeExposureRules(value?.exposureRules),
    conversations: Array.isArray(value?.conversations)
      ? value.conversations.filter(isObjectRecord).map((conversation) => ({
        ...conversation,
        phone: normalizeNullablePhone(conversation.phone),
      } as AutomationConversationSummary))
      : [],
    messages: Array.isArray(value?.messages)
      ? value.messages.filter(isObjectRecord).map((message) => ({
        ...message,
        intakeId: typeof message.intakeId === 'string' ? message.intakeId : null,
      } as AutomationMessageRecord))
      : [],
    intakes: Array.isArray(value?.intakes)
      ? value.intakes.filter(isObjectRecord).map((intake) => ({
        ...intake,
        phone: normalizeNullablePhone(intake.phone),
      } as AutomationOrderIntake))
      : [],
    customerPreferences: Array.isArray((value as Partial<AutomationStoreState> | undefined)?.customerPreferences)
      ? (value as Partial<AutomationStoreState>).customerPreferences!.filter(isObjectRecord)
        .map((preference) => ({ ...preference } as AutomationCustomerPreferencesRecord))
      : [],
    wizardSessions: Array.isArray((value as Partial<AutomationStoreState> | undefined)?.wizardSessions)
      ? (value as Partial<AutomationStoreState>).wizardSessions!.filter(isObjectRecord).map((session) => ({
        ...session,
        currentStep: session.currentStep ?? 'menu',
        catalogCursor: typeof session.catalogCursor === 'number' ? session.catalogCursor : 0,
        pendingPromptIntent: session.pendingPromptIntent ?? null,
        lastWizardMessageId: typeof session.lastWizardMessageId === 'number' ? session.lastWizardMessageId : null,
        generatedWizardMessageIds: Array.isArray((session as Partial<AutomationWizardSession>).generatedWizardMessageIds)
          ? [...new Set((session as Partial<AutomationWizardSession>).generatedWizardMessageIds!.filter((messageId) => typeof messageId === 'number'))]
          : typeof session.lastWizardMessageId === 'number'
            ? [session.lastWizardMessageId]
            : [],
        lastItemImageMessageId: typeof (session as Partial<AutomationWizardSession>).lastItemImageMessageId === 'number'
          ? (session as Partial<AutomationWizardSession>).lastItemImageMessageId!
          : null,
        selectedEntityType: (session as Partial<AutomationWizardSession>).selectedEntityType ?? null,
        selectedEntityId: (session as Partial<AutomationWizardSession>).selectedEntityId ?? null,
        selectedItemImageEntityType: (session as Partial<AutomationWizardSession>).selectedItemImageEntityType ?? null,
        selectedItemImageEntityId: (session as Partial<AutomationWizardSession>).selectedItemImageEntityId ?? null,
        draftLines: Array.isArray(session.draftLines) ? [...session.draftLines] : [],
        phone: normalizeNullablePhone(session.phone),
        deliveryLocation: typeof (session as Partial<AutomationWizardSession>).deliveryLocation === 'string'
          ? (session as Partial<AutomationWizardSession>).deliveryLocation!.trim() || null
          : null,
        customerNote: typeof (session as Partial<AutomationWizardSession>).customerNote === 'string'
          ? (session as Partial<AutomationWizardSession>).customerNote!.trim() || null
          : null,
        updatedAt: session.updatedAt ?? nowIso(),
      }))
      : [],
    pendingOutboundJobs: Array.isArray((value as Partial<AutomationStoreState> | undefined)?.pendingOutboundJobs)
      ? (value as Partial<AutomationStoreState>).pendingOutboundJobs!.filter((entry): entry is AutomationPendingTelegramOutboundJob =>
        typeof entry?.jobId === 'string' && typeof entry?.createdAt === 'string' && typeof entry?.job === 'object' && entry.job !== null,
      ).map((entry) => ({
        ...entry,
        sentMessage: typeof entry.sentMessage?.messageId === 'number'
          && typeof entry.sentMessage.sentAt === 'string'
          && typeof entry.sentMessage.text === 'string'
          ? entry.sentMessage
          : undefined,
      }))
      : [],
  };
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;
}

async function loadAutomationState(userDataPath: string): Promise<AutomationStoreState> {
  let raw: string;
  try {
    raw = await readFile(automationStorePath(userDataPath), 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return DEFAULT_STATE;
    }
    throw error;
  }
  return normalizeState(JSON.parse(raw) as Partial<AutomationStoreState>);
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

function latestStockBySku(
  latestStockBySkuAnchors: SenaRecordUpdateContext['latestStockBySku'],
) {
  const latest = new Map<string, number>();
  for (const [skuId, anchor] of Object.entries(latestStockBySkuAnchors ?? {})) {
    const snapshot = anchor?.value as SenaStockSnapshot | undefined;
    if (snapshot && Number.isFinite(snapshot.unitsInStock)) {
      latest.set(skuId, snapshot.unitsInStock);
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
  if (!isAutomationEligibleSku(sku)) {
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
  if (!isAutomationEligibleService(service)) {
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
  { catalog, recordUpdateContext }: ExposureBuildContext,
): AutomationExposureRow[] {
  if (!catalog) {
    return [];
  }

  const stockBySku = latestStockBySku(recordUpdateContext.latestStockBySku);
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
      exposed: availabilityStatus === 'hidden' ? false : rule?.exposed ?? true,
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
      exposed: availabilityStatus === 'hidden' ? false : rule?.exposed ?? true,
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
    .sort((left, right) => compareAutomationNewestFirst(left.sentAt, right.sentAt));
  const conversationIntakes = state.intakes
    .filter((intake) => intake.conversationId === conversationId)
    .sort((left, right) => compareAutomationNewestFirst(left.updatedAt, right.updatedAt));
  conversation.messageCount = conversationMessages.length;
  conversation.lastMessageAt = conversationMessages[0]?.sentAt ?? conversation.lastMessageAt;
  conversation.latestIntakeStatus = conversationIntakes[0]?.status ?? null;
  conversation.latestTicketId = conversationIntakes.find((intake) => intake.promotedTicketId)?.promotedTicketId ?? null;
}

function wizardSessionForConversation(state: AutomationStoreState, conversationId: string) {
  return state.wizardSessions.find((entry) => entry.conversationId === conversationId) ?? null;
}

function upsertWizardSession(state: AutomationStoreState, conversationId: string) {
  const existing = wizardSessionForConversation(state, conversationId);
  if (existing) {
    existing.updatedAt = nowIso();
    return existing;
  }
  const session: AutomationWizardSession = {
    conversationId,
    currentStep: 'menu',
    catalogCursor: 0,
    pendingPromptIntent: null,
    lastWizardMessageId: null,
    generatedWizardMessageIds: [],
    lastItemImageMessageId: null,
    selectedEntityType: null,
    selectedEntityId: null,
    selectedItemImageEntityType: null,
    selectedItemImageEntityId: null,
    draftLines: [],
    phone: null,
    deliveryLocation: null,
    customerNote: null,
    updatedAt: nowIso(),
  };
  state.wizardSessions.unshift(session);
  return session;
}

function hasWizardDraft(session: AutomationWizardSession | null) {
  return Boolean(session?.draftLines.length);
}

function clearWizardItemSelection(session: AutomationWizardSession) {
  session.selectedEntityType = null;
  session.selectedEntityId = null;
}

function clearWizardDraft(session: AutomationWizardSession) {
  session.currentStep = 'menu';
  session.catalogCursor = 0;
  session.pendingPromptIntent = null;
  clearWizardItemSelection(session);
  session.draftLines = [];
  session.phone = null;
  session.deliveryLocation = null;
  session.customerNote = null;
  session.updatedAt = nowIso();
}

function botDisplayLabel(connection: AutomationConnectionRecord) {
  if (connection.botDisplayName?.trim()) {
    return connection.botDisplayName.trim();
  }
  if (connection.botUsername?.trim()) {
    return `@${connection.botUsername.replace(/^@/, '')}`;
  }
  return 'Kaur Khor';
}

function isKhmerLanguage(language: AppLanguage) {
  return language === 'km';
}

function localizedBotDisplayLabel(connection: AutomationConnectionRecord, language: AppLanguage) {
  const label = botDisplayLabel(connection);
  return isKhmerLanguage(language) && label === 'Kaur Khor' ? 'កខ' : label;
}

function localizedStatusLabel(
  language: AppLanguage,
  value: 'available_now' | 'your_cart' | 'checkout' | 'needs_review' | 'quoted_order' | 'receipt' | 'order_canceled' | 'order_updated',
) {
  if (!isKhmerLanguage(language)) {
    switch (value) {
      case 'available_now':
        return 'Catalog';
      case 'your_cart':
        return 'Your cart';
      case 'checkout':
        return 'Checkout';
      case 'needs_review':
        return 'Needs review';
      case 'quoted_order':
        return 'Quoted order';
      case 'receipt':
        return 'Receipt';
      case 'order_canceled':
        return 'Order canceled';
      case 'order_updated':
        return 'Order updated';
    }
  }
  switch (value) {
    case 'available_now':
      return 'កាតាឡុក';
    case 'your_cart':
      return 'កន្ត្រករបស់អ្នក';
    case 'checkout':
      return 'បញ្ជូនការបញ្ជាទិញ';
    case 'needs_review':
      return 'ត្រូវការការពិនិត្យ';
    case 'quoted_order':
      return 'សម្រង់តម្លៃការបញ្ជាទិញ';
    case 'receipt':
      return 'បង្កាន់ដៃ';
    case 'order_canceled':
      return 'បោះបង់ការបញ្ជាទិញ';
    case 'order_updated':
      return 'បានអាប់ដេតការបញ្ជាទិញ';
  }
}

function buildPreferencesLanguagePrompt(language: AppLanguage) {
  return isKhmerLanguage(language)
    ? '<b>ជ្រើសរើសភាសា</b>\nសូមជ្រើសរើសភាសាសម្រាប់បង្ហាញសាររបស់បូត។ អ្នកអាចប្តូរវាវិញពេលក្រោយដោយវាយ <code>/preferences</code>។'
    : '<b>Choose your language</b>\nPick the language for bot messages. You can change it later with <code>/preferences</code>.';
}

function buildPreferencesCurrencyPrompt(language: AppLanguage) {
  return isKhmerLanguage(language)
    ? '<b>ជ្រើសរើសរូបិយប័ណ្ណ</b>\nសូមជ្រើសរើសរូបិយប័ណ្ណសម្រាប់បង្ហាញតម្លៃ។'
    : '<b>Choose your display currency</b>\nPick the currency you want Kaur Khor to show in quotes and cart totals.';
}

function buildPreferencesSavedPrompt(language: AppLanguage) {
  return isKhmerLanguage(language)
    ? '<b>បានរក្សាទុកចំណូលចិត្ត</b>\nកខនឹងប្រើភាសា និងរូបិយប័ណ្ណដែលអ្នកបានជ្រើសរើស។'
    : '<b>Preferences saved</b>\nKaur Khor will use your selected language and display currency.';
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
    ticketedToday: intakes.filter((intake) => intake.status === 'ticketed' && intake.updatedAt >= todayFloor).length,
    completedToday: intakes.filter((intake) => intake.status === 'completed' && intake.updatedAt >= todayFloor).length,
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

function assertPromotableAutomationIntake(intake: AutomationOrderIntake) {
  if (intake.promotedTicketId || intake.status === 'ticketed' || intake.status === 'completed') {
    throw new Error('Automation intake has already been promoted to a customer ticket.');
  }
  if (intake.status !== 'quoted') {
    throw new Error('Only quoted automation intakes can be promoted to customer tickets.');
  }
}

function latestTicketEventForId(observations: SenaObservationRecord[], ticketId: string) {
  return observations
    .flatMap((observation) => observation.input.ticketEvents ?? [])
    .filter((event) => event.ticketId === ticketId)
    .sort((left, right) => {
      if (right.revision !== left.revision) {
        return right.revision - left.revision;
      }
      return compareAutomationNewestFirst(left.occurredAt, right.occurredAt);
    })[0] ?? null;
}

function validateAppendTicketTarget(observations: SenaObservationRecord[], ticketId: string) {
  const ticket = latestTicketEventForId(observations, ticketId);
  if (!ticket) {
    throw new Error('Appending Telegram intake requires an existing customer ticket.');
  }
  if (ticket.ticketFamily !== 'customer' || ticket.lifecycle !== 'open') {
    throw new Error('Appending Telegram intake requires an open customer ticket.');
  }
  return ticket;
}

function automationCreatedTicketId(intakeId: string) {
  return `ticket:customer:automation:${intakeId}`;
}

function promotionEventForIntake(
  observations: SenaObservationRecord[],
  intake: AutomationOrderIntake,
  ticketId: string,
) {
  const intakeMarker = `Telegram intake ${intake.intakeId}`;
  return observations
    .flatMap((observation) => observation.input.ticketEvents ?? [])
    .filter((event) => event.ticketId === ticketId && event.ticketFamily === 'customer')
    .find((event) => event.note?.includes(intakeMarker)) ?? null;
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
  const query = payload?.q?.trim();
  if (!query) {
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
      query,
    ),
  );
}

function currencyCodeForAppCurrency(currency: AppCurrency): 'USD' | 'KHR' {
  return currency === 'KHR' ? 'KHR' : 'USD';
}

function sampleQuantity(index: number) {
  return index === 0 ? 2 : 1;
}

function normalizeTelegramLabel(value: string | null | undefined) {
  return safeLower(value).replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function escapeTelegramHtml(value: string | null | undefined) {
  return (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function displayMoneyFromUsd(amount: number | null, currency: AppCurrency, usdToKhrExchangeRate: number) {
  if (amount == null) {
    return null;
  }
  return currency === 'KHR' ? amount * usdToKhrExchangeRate : amount;
}

function formatTelegramMoney(preferences: TelegramCustomerPreferences, amountUsd: number | null) {
  const displayAmount = displayMoneyFromUsd(amountUsd, preferences.currency, preferences.usdToKhrExchangeRate);
  if (amountUsd == null) {
    return `${preferences.currency} TBD`;
  }
  return preferences.currency === 'KHR'
    ? `${preferences.currency} ${Math.round(displayAmount!).toFixed(0)}`
    : `${preferences.currency} ${displayAmount!.toFixed(2)}`;
}

function conversationPreferencesFor(
  state: AutomationStoreState,
  conversationId: string,
  defaults: TelegramCustomerPreferences,
): TelegramCustomerPreferences {
  const stored = state.customerPreferences.find((entry) => entry.conversationId === conversationId);
  return {
    language: stored?.language ?? defaults.language,
    currency: stored?.currency ?? defaults.currency,
    usdToKhrExchangeRate: defaults.usdToKhrExchangeRate,
  };
}

function saveConversationPreferences(
  state: AutomationStoreState,
  conversationId: string,
  next: Partial<Pick<TelegramCustomerPreferences, 'language' | 'currency'>>,
  defaults: TelegramCustomerPreferences,
) {
  const current = state.customerPreferences.find((entry) => entry.conversationId === conversationId);
  const now = nowIso();
  if (current) {
    current.language = next.language ?? current.language;
    current.currency = next.currency ?? current.currency;
    current.updatedAt = now;
    return current;
  }
  const created: AutomationCustomerPreferencesRecord = {
    conversationId,
    language: next.language ?? defaults.language,
    currency: next.currency ?? defaults.currency,
    configuredAt: now,
    updatedAt: now,
  };
  state.customerPreferences.push(created);
  return created;
}

function hasConfiguredConversationPreferences(state: AutomationStoreState, conversationId: string) {
  return state.customerPreferences.some((entry) => entry.conversationId === conversationId);
}

function formatExposureLabel(row: AutomationExposureRow) {
  const primary = row.alias?.trim() || row.label;
  return row.alias?.trim() ? `${primary} (${row.label})` : primary;
}

function catalogPageCount(rows: AutomationExposureRow[]) {
  return Math.max(1, Math.ceil(rows.length / 5));
}

function pagedExposedRows(rows: AutomationExposureRow[], pageIndex: number) {
  const visibleRows = rows.filter((row) => row.exposed);
  const pageCount = catalogPageCount(visibleRows);
  const safePage = Math.min(Math.max(pageIndex, 0), pageCount - 1);
  return {
    page: safePage,
    pageCount,
    rows: visibleRows.slice(safePage * 5, safePage * 5 + 5),
    total: visibleRows.length,
  };
}

function wizardLineKey(entityType: AutomationExposureEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

function buildCallbackData(
  action: 'menu' | 'help' | 'available' | 'item' | 'order' | 'cart' | 'cancel' | 'page' | 'add' | 'inc' | 'dec' | 'remove' | 'checkout' | 'confirm' | 'preferences' | 'language' | 'currency',
  ...parts: Array<string | number>
) {
  return ['w', action, ...parts].join(':');
}

function parseWizardCallbackData(value: string | null | undefined) {
  if (!value?.startsWith('w:')) {
    return null;
  }
  const [prefix, action, ...parts] = value.split(':');
  if (prefix !== 'w' || !action) {
    return null;
  }
  return {
    action,
    parts,
  };
}

function inlineKeyboard(rows: Array<Array<{ text: string; callbackData?: string }>>) {
  return {
    inline_keyboard: rows.map((row) => row.map((button) => ({
      text: button.text,
      callback_data: button.callbackData,
    }))),
  } satisfies TelegramInlineKeyboardMarkup;
}

function phoneKeyboard(preferences: TelegramCustomerPreferences) {
  return {
    keyboard: [
      [{ text: isKhmerLanguage(preferences.language) ? 'ចែករំលែកលេខទូរស័ព្ទ' : 'Share phone', request_contact: true }],
      [isKhmerLanguage(preferences.language) ? 'រំលងលេខទូរស័ព្ទ' : 'Skip phone'],
    ],
    one_time_keyboard: true,
    resize_keyboard: true,
  } satisfies TelegramReplyKeyboardMarkup;
}

function locationKeyboard(preferences: TelegramCustomerPreferences) {
  return {
    keyboard: [
      [{ text: isKhmerLanguage(preferences.language) ? 'ផ្ញើទីតាំង' : 'Send location', request_location: true }],
      [isKhmerLanguage(preferences.language) ? 'រំលងទីតាំង' : 'Skip location'],
    ],
    one_time_keyboard: true,
    resize_keyboard: true,
  } satisfies TelegramReplyKeyboardMarkup;
}

function noteKeyboard(preferences: TelegramCustomerPreferences) {
  return {
    keyboard: [
      [isKhmerLanguage(preferences.language) ? 'រំលងកំណត់ចំណាំ' : 'Skip notes'],
    ],
    one_time_keyboard: true,
    resize_keyboard: true,
  } satisfies TelegramReplyKeyboardMarkup;
}

function removeKeyboard() {
  return {
    remove_keyboard: true,
  } satisfies TelegramReplyKeyboardRemove;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTelegramCommand(message: TelegramMessage) {
  const text = message.text?.trim();
  if (!text) {
    return null;
  }

  const commandEntity = message.entities?.find((entity) => entity.type === 'bot_command' && entity.offset === 0);
  const rawCommand = commandEntity
    ? text.slice(0, commandEntity.length)
    : text.startsWith('/')
      ? text.split(/\s+/, 1)[0] ?? null
      : null;
  if (!rawCommand) {
    return null;
  }

  const normalized = rawCommand.toLowerCase();
  const atIndex = normalized.indexOf('@');
  return atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
}

function extractTelegramQuantity(rawText: string, label: string) {
  const normalizedLabel = normalizeTelegramLabel(label);
  if (!normalizedLabel) {
    return null;
  }
  const pattern = normalizedLabel.split(' ').map(escapeRegex).join('\\s+');
  const match = rawText.match(new RegExp(`(?:^|\\b)(\\d+(?:\\.\\d+)?)\\s*(?:x|×)?\\s*${pattern}(?:\\b|$)`, 'i'));
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function telegramLocationText(message: TelegramMessage) {
  if (message.location) {
    return `https://maps.google.com/?q=${message.location.latitude},${message.location.longitude}`;
  }
  return message.text?.trim() || null;
}

function telegramMessageSentAt(message: TelegramMessage, fallback = nowIso()) {
  const timestampMs = message.date * 1000;
  if (!Number.isFinite(timestampMs)) {
    return fallback;
  }
  const sentAt = new Date(timestampMs);
  if (!Number.isFinite(sentAt.getTime())) {
    return fallback;
  }
  return sentAt.toISOString();
}

function buildTelegramConversationId(chatId: string) {
  return `conv_telegram_${chatId.replace(/[^\w-]/g, '_')}`;
}

function telegramCustomerDisplayName(message: TelegramMessage) {
  const firstName = message.from?.first_name?.trim();
  const lastName = message.from?.last_name?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || message.chat.title || null;
}

function telegramCustomerDisplayNameFromActor(
  actor: {
    first_name?: string;
    last_name?: string;
  },
  chatTitle?: string | null,
) {
  const fullName = [actor.first_name?.trim(), actor.last_name?.trim()].filter(Boolean).join(' ').trim();
  return fullName || chatTitle || null;
}

function parseTelegramIntakeLines(rawText: string, exposures: AutomationExposureRow[]) {
  const normalizedText = normalizeTelegramLabel(rawText);
  const matchedEntityIds = new Set<string>();
  const sellableRows = exposures
    .filter((row) => row.exposed)
    .sort((left, right) => {
      const leftLength = Math.max(left.alias?.length ?? 0, left.label.length);
      const rightLength = Math.max(right.alias?.length ?? 0, right.label.length);
      return rightLength - leftLength;
    });

  const lines: AutomationIntakeLine[] = [];
  for (const row of sellableRows) {
    const labels = [row.alias, row.label].filter(Boolean) as string[];
    const matchedLabel = labels.find((label) => normalizedText.includes(normalizeTelegramLabel(label)));
    if (!matchedLabel || matchedEntityIds.has(row.entityId)) {
      continue;
    }
    const quantity = extractTelegramQuantity(rawText, matchedLabel) ?? 1;
    const needsReview = row.price == null || row.availabilityStatus === 'unavailable' || row.availabilityStatus === 'hidden' || row.availabilityStatus === 'unknown';
    lines.push({
      lineId: `line_${randomUUID()}`,
      entityType: row.entityType,
      entityId: row.entityId,
      requestedLabel: matchedLabel,
      resolvedLabel: row.label,
      quantity,
      unitPrice: row.price,
      lineTotal: row.price != null ? quantity * row.price : null,
      availabilityStatus: row.availabilityStatus,
      ambiguityReason:
        row.price == null
          ? 'price_unavailable'
          : row.availabilityStatus === 'unavailable'
            ? 'unavailable_entity_requested'
            : row.availabilityStatus === 'hidden'
              ? 'hidden_entity_requested'
              : row.availabilityStatus === 'unknown'
                ? 'availability_unknown'
                : null,
    });
    matchedEntityIds.add(row.entityId);
  }

  if (lines.length > 0) {
    return lines;
  }

  return [{
    lineId: `line_${randomUUID()}`,
    entityType: 'sku',
    entityId: null,
    requestedLabel: rawText.trim() || 'Telegram request',
    resolvedLabel: null,
    quantity: null,
    unitPrice: null,
    lineTotal: null,
    availabilityStatus: 'unknown',
    ambiguityReason: 'item_not_found',
  } satisfies AutomationIntakeLine];
}

function applyFreeTextCartMatch(
  session: AutomationWizardSession,
  rawText: string,
  exposures: AutomationExposureRow[],
) {
  const lines = parseTelegramIntakeLines(rawText, exposures).filter((line) => line.entityId != null && line.quantity != null);
  if (lines.length === 0) {
    return false;
  }
  for (const line of lines) {
    const entityId = line.entityId!;
    const existing = session.draftLines.find((entry) => wizardLineKey(entry.entityType, entry.entityId) === wizardLineKey(line.entityType, entityId));
    if (existing) {
      existing.quantity += line.quantity!;
      existing.unitPrice = line.unitPrice;
      existing.availabilityStatus = line.availabilityStatus;
    } else {
      session.draftLines.push({
        entityType: line.entityType,
        entityId,
        label: line.resolvedLabel ?? line.requestedLabel,
        quantity: line.quantity!,
        unitPrice: line.unitPrice,
        availabilityStatus: line.availabilityStatus,
      });
    }
  }
  session.currentStep = 'cart';
  session.updatedAt = nowIso();
  return true;
}

function wizardDraftSubtotal(session: AutomationWizardSession) {
  if (session.draftLines.some((line) => line.unitPrice == null || line.quantity <= 0)) {
    return null;
  }
  return session.draftLines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.quantity, 0);
}

function createIntakeFromWizardSession(
  session: AutomationWizardSession,
  conversation: AutomationConversationSummary,
  currency: AppCurrency,
) {
  const lines: AutomationIntakeLine[] = session.draftLines.map((line) => ({
    lineId: `line_${randomUUID()}`,
    entityType: line.entityType,
    entityId: line.entityId,
    requestedLabel: line.label,
    resolvedLabel: line.label,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.unitPrice != null ? line.unitPrice * line.quantity : null,
    availabilityStatus: line.availabilityStatus,
    ambiguityReason:
      line.unitPrice == null
        ? 'price_unavailable'
        : line.availabilityStatus === 'unavailable'
          ? 'unavailable_entity_requested'
          : line.availabilityStatus === 'hidden'
            ? 'hidden_entity_requested'
            : line.availabilityStatus === 'unknown'
              ? 'availability_unknown'
              : null,
  }));

  const quotedSubtotal = lines.every((line) => line.lineTotal != null)
    ? lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0)
    : null;
  const status: AutomationIntakeStatus = quotedSubtotal != null && lines.every((line) => line.ambiguityReason == null)
    ? 'quoted'
    : 'needs_review';
  const parseConfidence = status === 'quoted' ? 'high' : lines.some((line) => line.entityId != null) ? 'medium' : 'low';

  return {
    intakeId: `intake_${randomUUID()}`,
    conversationId: session.conversationId,
    channel: 'telegram',
    status,
    parseConfidence,
    customerDisplayName: conversation.customerDisplayName,
    customerHandle: conversation.customerHandle,
    phone: normalizeNullablePhone(session.phone ?? conversation.phone),
    notes: [
      `Telegram wizard checkout (${session.draftLines.length} line${session.draftLines.length === 1 ? '' : 's'})`,
      session.deliveryLocation ? `Delivery location: ${session.deliveryLocation}` : null,
      session.customerNote ? `Customer note: ${session.customerNote}` : null,
    ].filter(Boolean).join('\n'),
    quotedSubtotal,
    currencyCode: currencyCodeForAppCurrency(currency),
    deliveryFee: null,
    quotedTotal: quotedSubtotal,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    promotedTicketId: null,
    lines,
  } satisfies AutomationOrderIntake;
}

function buildWizardMenuPrompt(
  connection: AutomationConnectionRecord,
  session: AutomationWizardSession | null,
  preferences: TelegramCustomerPreferences,
) {
  const label = escapeTelegramHtml(localizedBotDisplayLabel(connection, preferences.language));
  const buttons = [
    [
      { text: isKhmerLanguage(preferences.language) ? 'មើលទំនិញ' : 'Show available', callbackData: buildCallbackData('available', 0) },
      { text: hasWizardDraft(session) ? (isKhmerLanguage(preferences.language) ? 'បន្តការបញ្ជាទិញ' : 'Resume order') : (isKhmerLanguage(preferences.language) ? 'ចាប់ផ្តើមបញ្ជាទិញ' : 'Start order'), callbackData: buildCallbackData('order') },
    ],
    [
      { text: isKhmerLanguage(preferences.language) ? 'ជំនួយ' : 'Help', callbackData: buildCallbackData('help') },
      { text: isKhmerLanguage(preferences.language) ? 'ចំណូលចិត្ត' : 'Preferences', callbackData: buildCallbackData('preferences') },
    ],
  ];
  return {
    text: isKhmerLanguage(preferences.language)
      ? `<b>ស្វាគមន៍មកកាន់ ${label}</b>\nមើលទំនិញដែលបានអនុម័ត បង្កើតការបញ្ជាទិញ ហើយឲ្យកខបញ្ជាក់តម្លៃ និងការរៀបចំជូន។\n\nប្រើប៊ូតុងខាងក្រោម ឬវាយអ្វីដែលអ្នកចង់បានជាអក្សរធម្មតា។`
      : `<b>Welcome to ${label}</b>\nBrowse approved sellables, build an order, and let Kaur Khor confirm pricing and fulfillment.\n\nUse the buttons below or type what you need in plain text.`,
    replyMarkup: inlineKeyboard(buttons),
  };
}

function buildWizardHelpPrompt(preferences: TelegramCustomerPreferences) {
  return {
    text: isKhmerLanguage(preferences.language)
      ? '<b>របៀបបញ្ជាទិញ</b>\n1. ចុច <b>មើលទំនិញ</b> ដើម្បីមើលកាតាឡុកដែលបានបើក។\n2. ចុចលើទំនិញណាមួយ ដើម្បីមើលព័ត៌មានលម្អិត ហើយកំណត់បរិមាណ។\n3. បើក <b>មើលកន្ត្រក</b> ដើម្បីពិនិត្យបរិមាណ និងបញ្ជូនការបញ្ជាទិញ។\n4. អ្នកក៏អាចវាយសារដូចជា <code>2 Cotton Scarf</code> ហើយកខនឹងព្យាយាមបកស្រាយផងដែរ។\n\nប្រតិបត្តិករកខនឹងពិនិត្យមុនពេលបង្កើតជាសំបុត្រការងារ។'
      : '<b>How to order</b>\n1. Tap <b>Show available</b> to browse the exposed catalog.\n2. Tap any item to open its details and set the quantity.\n3. Open <b>View cart</b> to review quantities and checkout.\n4. You can also type messages like <code>2 cotton scarf</code> and Kaur Khor will still parse them.\n\nkaur khor operators confirm quoted orders before ticket promotion.',
    replyMarkup: inlineKeyboard([
      [
        { text: isKhmerLanguage(preferences.language) ? 'មើលទំនិញ' : 'Show available', callbackData: buildCallbackData('available', 0) },
        { text: isKhmerLanguage(preferences.language) ? 'ចាប់ផ្តើមបញ្ជាទិញ' : 'Start order', callbackData: buildCallbackData('order') },
      ],
      [
        { text: isKhmerLanguage(preferences.language) ? 'មើលកន្ត្រក' : 'View cart', callbackData: buildCallbackData('cart') },
        { text: isKhmerLanguage(preferences.language) ? 'ចំណូលចិត្ត' : 'Preferences', callbackData: buildCallbackData('preferences') },
      ],
    ]),
  };
}

function buildWizardCatalogPrompt(
  exposures: AutomationExposureRow[],
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
) {
  const page = pagedExposedRows(exposures, session.catalogCursor);
  const lines = page.rows.length === 0
    ? [isKhmerLanguage(preferences.language) ? 'មិនមានទំនិញដែលបានបើកឥឡូវនេះទេ។' : 'No exposed sellables are available right now.']
    : page.rows.map((row, index) => {
      const typeLabel = row.entityType === 'service'
        ? (isKhmerLanguage(preferences.language) ? 'សេវា' : 'Service')
        : (isKhmerLanguage(preferences.language) ? 'លេខកូដទំនិញ' : 'SKU');
      return `${index + 1}. <b>${escapeTelegramHtml(formatExposureLabel(row))}</b>\n${typeLabel} · ${escapeTelegramHtml(formatTelegramMoney(preferences, row.price))}`;
    });

  const itemButtons = page.rows.map((row) => ([
    { text: formatExposureLabel(row), callbackData: buildCallbackData('item', row.entityType, row.entityId) },
  ]));

  return {
    text: `<b>${localizedStatusLabel(preferences.language, 'available_now')}</b>\n${isKhmerLanguage(preferences.language) ? 'ទំព័រ' : 'Page'} ${page.page + 1} ${isKhmerLanguage(preferences.language) ? 'នៃ' : 'of'} ${page.pageCount}\n\n${lines.join('\n\n')}`,
    replyMarkup: inlineKeyboard([
      ...itemButtons,
      [
        { text: isKhmerLanguage(preferences.language) ? 'មុន' : 'Prev', callbackData: buildCallbackData('page', Math.max(page.page - 1, 0)) },
        { text: isKhmerLanguage(preferences.language) ? 'បន្ទាប់' : 'Next', callbackData: buildCallbackData('page', Math.min(page.page + 1, page.pageCount - 1)) },
      ],
      [
        { text: isKhmerLanguage(preferences.language) ? 'មើលកន្ត្រក' : 'View cart', callbackData: buildCallbackData('cart') },
        { text: isKhmerLanguage(preferences.language) ? 'ត្រឡប់ទៅម៉ឺនុយ' : 'Back to menu', callbackData: buildCallbackData('menu') },
      ],
    ]),
  };
}

function buildWizardItemPrompt(
  row: AutomationExposureRow,
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
) {
  const quantity = selectedDraftQuantity(session, row);
  const typeLabel = row.entityType === 'service'
    ? (isKhmerLanguage(preferences.language) ? 'សេវា' : 'Service')
    : (isKhmerLanguage(preferences.language) ? 'លេខកូដទំនិញ' : 'SKU');
  const quantityLabel = isKhmerLanguage(preferences.language) ? 'ក្នុងកន្ត្រក' : 'In cart';
  const addLabel = isKhmerLanguage(preferences.language) ? 'បន្ថែម 1' : 'Add 1';
  const backLabel = isKhmerLanguage(preferences.language) ? 'ត្រឡប់ទៅកាតាឡុក' : 'Back to catalog';
  const cartLabel = isKhmerLanguage(preferences.language) ? 'មើលកន្ត្រក' : 'View cart';
  const controls = quantity > 0
    ? [
      [
        { text: '-1', callbackData: buildCallbackData('dec', row.entityType, row.entityId) },
        { text: '+1', callbackData: buildCallbackData('inc', row.entityType, row.entityId) },
      ],
      [
        { text: isKhmerLanguage(preferences.language) ? 'លុបចេញ' : 'Remove', callbackData: buildCallbackData('remove', row.entityType, row.entityId) },
      ],
    ]
    : [[{ text: addLabel, callbackData: buildCallbackData('add', row.entityType, row.entityId) }]];

  return {
    text: `<b>${escapeTelegramHtml(formatExposureLabel(row))}</b>\n${escapeTelegramHtml(typeLabel)}\n${escapeTelegramHtml(formatTelegramMoney(preferences, row.price))}\n${quantityLabel}: ${quantity}`,
    replyMarkup: inlineKeyboard([
      ...controls,
      [
        { text: cartLabel, callbackData: buildCallbackData('cart') },
        { text: backLabel, callbackData: buildCallbackData('available', session.catalogCursor) },
      ],
    ]),
  };
}

function buildWizardCartPrompt(
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
) {
  if (session.draftLines.length === 0) {
    return {
      text: isKhmerLanguage(preferences.language)
        ? '<b>កន្ត្រករបស់អ្នកទទេ</b>\nមើលកាតាឡុក ឬវាយអ្វីដែលអ្នកត្រូវការ ដើម្បីចាប់ផ្តើមការបញ្ជាទិញ។'
        : '<b>Your cart is empty</b>\nBrowse the catalog or type what you need to start an order.',
      replyMarkup: inlineKeyboard([
        [
          { text: isKhmerLanguage(preferences.language) ? 'មើលទំនិញ' : 'Browse items', callbackData: buildCallbackData('available', session.catalogCursor) },
          { text: isKhmerLanguage(preferences.language) ? 'ត្រឡប់ទៅម៉ឺនុយ' : 'Back to menu', callbackData: buildCallbackData('menu') },
        ],
      ]),
    };
  }

  const lineSummaries = session.draftLines.map((line, index) => (
    `${index + 1}. <b>${escapeTelegramHtml(line.label)}</b>\n${isKhmerLanguage(preferences.language) ? 'ចំនួន' : 'Qty'} ${line.quantity} · ${escapeTelegramHtml(formatTelegramMoney(preferences, line.unitPrice != null ? line.unitPrice * line.quantity : null))}`
  ));

  const quantityRows = session.draftLines.flatMap((line) => [[
    { text: `-1 ${line.label}`, callbackData: buildCallbackData('dec', line.entityType, line.entityId) },
    { text: `+1 ${line.label}`, callbackData: buildCallbackData('inc', line.entityType, line.entityId) },
  ], [
    { text: `${isKhmerLanguage(preferences.language) ? 'លុបចេញ' : 'Remove'} ${line.label}`, callbackData: buildCallbackData('remove', line.entityType, line.entityId) },
  ]]);

  return {
    text: `<b>${localizedStatusLabel(preferences.language, 'your_cart')}</b>\n\n${lineSummaries.join('\n\n')}\n\n<b>${isKhmerLanguage(preferences.language) ? 'សរុប៖' : 'Total:'}</b> ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}`,
    replyMarkup: inlineKeyboard([
      ...quantityRows,
      [
        { text: isKhmerLanguage(preferences.language) ? 'បន្ថែមទៀត' : 'Add more', callbackData: buildCallbackData('available', session.catalogCursor) },
        { text: isKhmerLanguage(preferences.language) ? 'បន្តទៅផ្ញើ' : 'Checkout', callbackData: buildCallbackData('checkout') },
      ],
      [{ text: isKhmerLanguage(preferences.language) ? 'បោះបង់ការបញ្ជាទិញ' : 'Cancel order', callbackData: buildCallbackData('cancel') }],
    ]),
  };
}

function buildWizardCheckoutConfirmPrompt(
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
  contextLabel?: string | null,
) {
  const contextLine = contextLabel?.trim() ? `${escapeTelegramHtml(contextLabel)}\n` : '';
  const phoneLine = session.phone
    ? `${isKhmerLanguage(preferences.language) ? 'លេខទូរស័ព្ទ' : 'Phone'}: ${escapeTelegramHtml(formatPhoneForDisplay(session.phone))}\n`
    : '';
  const locationLine = session.deliveryLocation
    ? `${isKhmerLanguage(preferences.language) ? 'ទីតាំង' : 'Location'}: ${escapeTelegramHtml(session.deliveryLocation)}\n`
    : '';
  const noteLine = session.customerNote
    ? `${isKhmerLanguage(preferences.language) ? 'កំណត់ចំណាំ' : 'Note'}: ${escapeTelegramHtml(session.customerNote)}\n`
    : '';
  return {
    text: `<b>${isKhmerLanguage(preferences.language) ? 'ត្រៀមបញ្ជាក់' : 'Ready to confirm'}</b>\n${contextLine}${phoneLine}${locationLine}${noteLine}${isKhmerLanguage(preferences.language) ? 'សរុប៖' : 'Total:'} ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\n${isKhmerLanguage(preferences.language) ? 'ចុចបញ្ជាក់ ដើម្បីផ្ញើការបញ្ជាទិញនេះទៅកខ។' : 'Tap confirm to turn this draft into Kaur Khor intake.'}`,
    replyMarkup: inlineKeyboard([
      [{ text: isKhmerLanguage(preferences.language) ? 'បញ្ជាក់ការបញ្ជាទិញ' : 'Confirm order', callbackData: buildCallbackData('confirm') }],
      [
        { text: isKhmerLanguage(preferences.language) ? 'បន្ថែមទៀត' : 'Add more', callbackData: buildCallbackData('available', session.catalogCursor) },
        { text: isKhmerLanguage(preferences.language) ? 'បោះបង់ការបញ្ជាទិញ' : 'Cancel order', callbackData: buildCallbackData('cancel') },
      ],
    ]),
  };
}

function buildWizardPreferencesLanguagePrompt() {
  return {
    text: `${buildPreferencesLanguagePrompt('en')}\n\n${buildPreferencesLanguagePrompt('km')}`,
    replyMarkup: inlineKeyboard([
      [
        { text: 'English', callbackData: buildCallbackData('language', 'en') },
        { text: 'ខ្មែរ', callbackData: buildCallbackData('language', 'km') },
      ],
    ]),
  };
}

function buildWizardPreferencesCurrencyPrompt(preferences: TelegramCustomerPreferences) {
  return {
    text: buildPreferencesCurrencyPrompt(preferences.language),
    replyMarkup: inlineKeyboard([
      [
        { text: 'USD ($)', callbackData: buildCallbackData('currency', 'USD') },
        { text: 'KHR (៛)', callbackData: buildCallbackData('currency', 'KHR') },
      ],
    ]),
  };
}

function submitWizardCheckout(
  state: AutomationStoreState,
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  conversation: AutomationConversationSummary,
  currency: AppCurrency,
  preferences: TelegramCustomerPreferences,
) {
  if (session.draftLines.length === 0) {
    outboundJobs.push({
      kind: 'send',
      chatId: conversation.externalConversationKey,
      conversationId: conversation.conversationId,
      text: isKhmerLanguage(preferences.language)
        ? '<b>មិនមានការបញ្ជាទិញសម្រាប់ផ្ញើ</b>\nសូមបន្ថែមយ៉ាងហោចណាស់មួយមុខមុនពេលផ្ញើទៅកខ។'
        : '<b>No order to submit</b>\nAdd at least one item before sending your order to Kaur Khor.',
      parseMode: 'HTML',
      replyMarkup: removeKeyboard(),
    });
    return null;
  }

  const intake = createIntakeFromWizardSession(session, conversation, currency);
  state.intakes.unshift(intake);
  linkOrderMessagesToIntake(state, intake);
  conversation.phone = intake.phone;
  conversation.latestIntakeStatus = intake.status;
  session.pendingPromptIntent = null;
  deleteGeneratedWizardMessages(outboundJobs, session, conversation.externalConversationKey);
  queueWizardItemImageCleanup(outboundJobs, session, conversation.externalConversationKey);
  clearWizardDraft(session);
  outboundJobs.push({
    kind: 'send',
    chatId: conversation.externalConversationKey,
    conversationId: conversation.conversationId,
    intakeId: intake.intakeId,
    text: buildTelegramReply(intake, preferences, { receipt: true }),
    parseMode: 'HTML',
    replyMarkup: removeKeyboard(),
    messageRole: 'receipt',
  });
  recalculateConversation(state, conversation.conversationId);
  return intake;
}

function queueWizardLocationPrompt(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  conversation: AutomationConversationSummary,
  preferences: TelegramCustomerPreferences,
) {
  session.currentStep = 'checkout_location';
  session.pendingPromptIntent = 'share_location';
  session.updatedAt = nowIso();
  deleteGeneratedWizardMessages(outboundJobs, session, conversation.externalConversationKey);
  const locationPrompt = buildWizardLocationCapturePrompt(session, preferences);
  queueGeneratedWizardSend(outboundJobs, session, conversation.externalConversationKey, locationPrompt.text, locationPrompt.replyMarkup);
}

function queueWizardNotePrompt(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  conversation: AutomationConversationSummary,
  preferences: TelegramCustomerPreferences,
) {
  session.currentStep = 'checkout_note';
  session.pendingPromptIntent = 'share_note';
  session.updatedAt = nowIso();
  deleteGeneratedWizardMessages(outboundJobs, session, conversation.externalConversationKey);
  const notePrompt = buildWizardNoteCapturePrompt(session, preferences);
  queueGeneratedWizardSend(outboundJobs, session, conversation.externalConversationKey, notePrompt.text, notePrompt.replyMarkup);
}

function buildWizardPhoneCapturePrompt(
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
) {
  return {
    text: isKhmerLanguage(preferences.language)
      ? `<b>${localizedStatusLabel(preferences.language, 'checkout')}</b>\nសរុប៖ ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\nចែករំលែកលេខទូរស័ព្ទរបស់អ្នកឥឡូវនេះ ឬចុចរំលងលេខទូរស័ព្ទ ដើម្បីបន្តដោយមិនបញ្ចូលលេខ។`
      : `<b>${localizedStatusLabel(preferences.language, 'checkout')}</b>\nTotal: ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\nShare your phone number now, or tap Skip phone to continue without it.`,
    replyMarkup: phoneKeyboard(preferences),
  };
}

function buildWizardLocationCapturePrompt(
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
) {
  return {
    text: isKhmerLanguage(preferences.language)
      ? `<b>${localizedStatusLabel(preferences.language, 'checkout')}</b>\nសរុប៖ ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\nផ្ញើទីតាំងដឹកជញ្ជូនរបស់អ្នក ឬចុចរំលងទីតាំង។ អ្នកអាចផ្ញើទីតាំងតេលេក្រាម ឬអាសយដ្ឋានដូចជា <code>ផ្ទះ ១២ ផ្លូវ ៣១០ បឹងកេងកង ១ ភ្នំពេញ</code>។`
      : `<b>${localizedStatusLabel(preferences.language, 'checkout')}</b>\nTotal: ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\nSend your delivery location now, or tap Skip location. You can send a Telegram location, a Google Maps link like <code>https://maps.google.com/?q=11.5564,104.9282</code>, or an address like <code>House 12, Street 310, BKK1, Phnom Penh</code>.`,
    replyMarkup: locationKeyboard(preferences),
  };
}

function buildWizardNoteCapturePrompt(
  session: AutomationWizardSession,
  preferences: TelegramCustomerPreferences,
) {
  return {
    text: isKhmerLanguage(preferences.language)
      ? `<b>${localizedStatusLabel(preferences.language, 'checkout')}</b>\nសរុប៖ ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\nផ្ញើកំណត់ចំណាំណាមួយសម្រាប់ក្រុមកខ ឬចុចរំលងកំណត់ចំណាំ។ ឧទាហរណ៍៖ <code>សូមដឹកក្រោយម៉ោង 6 ល្ងាច</code>។`
      : `<b>${localizedStatusLabel(preferences.language, 'checkout')}</b>\nTotal: ${escapeTelegramHtml(formatTelegramMoney(preferences, wizardDraftSubtotal(session)))}\n\nSend any notes you want to give the Kaur Khor team, or tap Skip notes. Example: <code>Please deliver after 6 PM</code>.`,
    replyMarkup: noteKeyboard(preferences),
  };
}

function buildReceiptDetails(intake: AutomationOrderIntake, preferences: TelegramCustomerPreferences) {
  const lines = intake.lines
    .map((line) => `• ${line.quantity} × ${escapeTelegramHtml(line.resolvedLabel ?? line.requestedLabel)} = ${formatTelegramMoney(preferences, line.lineTotal)}`)
    .join('\n');
  const notes = intake.notes ?? '';
  const contextLines = notes
    .split('\n')
    .filter((line) => line.startsWith('Phone: ') || line.startsWith('Delivery location: ') || line.startsWith('Customer note: '))
    .map((line) => {
      const [label, ...rest] = line.split(': ');
      const value = rest.join(': ');
      if (!value) {
        return null;
      }
      const localizedLabel = isKhmerLanguage(preferences.language)
        ? label === 'Phone'
          ? 'លេខទូរស័ព្ទ'
          : label === 'Delivery location'
            ? 'ទីតាំងដឹកជញ្ជូន'
            : 'កំណត់ចំណាំ'
        : label;
      return `${localizedLabel}: ${escapeTelegramHtml(value)}`;
    })
    .filter((line): line is string => Boolean(line));
  const total = intake.quotedTotal ?? intake.quotedSubtotal;
  const status = intake.status === 'quoted'
    ? (isKhmerLanguage(preferences.language)
      ? 'កខបានទទួលការបញ្ជាទិញនេះ ហើយនឹងរក្សាទុកសម្រាប់ឲ្យប្រតិបត្តិករពិនិត្យ និងបង្កើតជាសំបុត្រការងារ។'
      : 'Kaur Khor received this order and will keep it ready for operator review and promotion.')
    : (isKhmerLanguage(preferences.language)
      ? 'កខបានទទួលការបញ្ជាទិញនេះ ប៉ុន្តែត្រូវការឲ្យប្រតិបត្តិករពិនិត្យមុនពេលបញ្ជាក់តម្លៃ។'
      : 'Kaur Khor received this order, but an operator needs to review it before quoting it.');
  const contextBlock = contextLines.length > 0 ? `\n\n${contextLines.join('\n')}` : '';
  return isKhmerLanguage(preferences.language)
    ? `<b>${localizedStatusLabel(preferences.language, 'receipt')}</b>\n${lines}\n\n<b>សរុប៖</b> ${escapeTelegramHtml(formatTelegramMoney(preferences, total))}${contextBlock}\n\n${status}`
    : `<b>${localizedStatusLabel(preferences.language, 'receipt')}</b>\n${lines}\n\n<b>Total:</b> ${escapeTelegramHtml(formatTelegramMoney(preferences, total))}${contextBlock}\n\n${status}`;
}

function buildTelegramReply(
  intake: AutomationOrderIntake,
  preferences: TelegramCustomerPreferences,
  options: { receipt?: boolean } = {},
) {
  if (options.receipt) {
    return buildReceiptDetails(intake, preferences);
  }
  if (intake.status === 'quoted') {
    const lineSummary = intake.lines
      .map((line) => `• ${line.quantity} × ${escapeTelegramHtml(line.resolvedLabel ?? line.requestedLabel)} = ${formatTelegramMoney(preferences, line.lineTotal ?? 0)}`)
      .join('\n');
    return isKhmerLanguage(preferences.language)
      ? `<b>${localizedStatusLabel(preferences.language, 'quoted_order')}</b>\n${lineSummary}\n\n<b>តម្លៃសរុប៖</b> ${escapeTelegramHtml(formatTelegramMoney(preferences, intake.quotedTotal ?? 0))}\nកខនឹងរក្សាសំណើនេះសម្រាប់ឲ្យប្រតិបត្តិករពិនិត្យ និងបង្កើតជាសំបុត្រការងារ។`
      : `<b>${localizedStatusLabel(preferences.language, 'quoted_order')}</b>\n${lineSummary}\n\n<b>Quoted total:</b> ${escapeTelegramHtml(formatTelegramMoney(preferences, intake.quotedTotal ?? 0))}\nKaur Khor will keep this intake ready for operator review and promotion.`;
  }
  return isKhmerLanguage(preferences.language)
    ? `<b>${localizedStatusLabel(preferences.language, 'needs_review')}</b>\nកខបានទទួលសាររបស់អ្នកហើយ ប៉ុន្តែត្រូវការឲ្យប្រតិបត្តិករពិនិត្យមុនពេលបញ្ជាក់តម្លៃ។ សូមរង់ចាំ ខណៈពេលកខកំពុងពិនិត្យ។`
    : `<b>${localizedStatusLabel(preferences.language, 'needs_review')}</b>\nI received your message, but Kaur Khor needs an operator to review it before quoting it. Please wait while Kaur Khor reviews it.`;
}

function buildWizardItemImageCaption(row: AutomationExposureRow, preferences: TelegramCustomerPreferences) {
  return `<b>${escapeTelegramHtml(formatExposureLabel(row))}</b>\n${escapeTelegramHtml(formatTelegramMoney(preferences, row.price))}`;
}

function upsertTelegramConversation(
  state: AutomationStoreState,
  message: TelegramMessage,
) {
  const externalConversationKey = String(message.chat.id);
  const existing = state.conversations.find((entry) => entry.externalConversationKey === externalConversationKey);
  const customerDisplayName = telegramCustomerDisplayName(message);
  const customerHandle = message.from?.username ? `@${message.from.username}` : message.chat.username ? `@${message.chat.username}` : null;
  if (existing) {
    existing.customerDisplayName = customerDisplayName;
    existing.customerHandle = customerHandle;
    existing.lastMessageAt = telegramMessageSentAt(message);
    return existing;
  }
  const conversation: AutomationConversationSummary = {
    conversationId: buildTelegramConversationId(externalConversationKey),
    channel: 'telegram',
    externalConversationKey,
    customerDisplayName,
    customerHandle,
    phone: null,
    lastMessageAt: telegramMessageSentAt(message),
    messageCount: 0,
    latestIntakeStatus: null,
    latestTicketId: null,
  };
  state.conversations.unshift(conversation);
  return conversation;
}

function upsertTelegramConversationFromCallback(
  state: AutomationStoreState,
  chatId: string,
  chat: TelegramChat,
  actor: {
    username?: string;
    first_name?: string;
    last_name?: string;
  },
  sentAt: string,
) {
  const existing = state.conversations.find((entry) => entry.externalConversationKey === chatId);
  const customerDisplayName = telegramCustomerDisplayNameFromActor(actor, chat.title ?? null);
  const customerHandle = actor.username ? `@${actor.username}` : chat.username ? `@${chat.username}` : null;
  if (existing) {
    existing.customerDisplayName = customerDisplayName;
    existing.customerHandle = customerHandle;
    existing.lastMessageAt = sentAt;
    return existing;
  }
  const conversation: AutomationConversationSummary = {
    conversationId: buildTelegramConversationId(chatId),
    channel: 'telegram',
    externalConversationKey: chatId,
    customerDisplayName,
    customerHandle,
    phone: null,
    lastMessageAt: sentAt,
    messageCount: 0,
    latestIntakeStatus: null,
    latestTicketId: null,
  };
  state.conversations.unshift(conversation);
  return conversation;
}

function insertTelegramInboundMessage(
  state: AutomationStoreState,
  conversationId: string,
  message: TelegramMessage,
) {
  const externalMessageKey = String(message.message_id);
  const existing = state.messages.find((entry) =>
    entry.conversationId === conversationId && entry.externalMessageKey === externalMessageKey,
  );
  if (existing) {
    return null;
  }
  const rawText = message.text
    ?? (message.location ? `Location: ${telegramLocationText(message)}` : null)
    ?? (message.contact ? `Contact: ${message.contact.phone_number}` : '');
  const record: AutomationMessageRecord = {
    messageId: `msg_${randomUUID()}`,
    conversationId,
    intakeId: null,
    externalMessageKey,
    direction: 'inbound',
    sentAt: telegramMessageSentAt(message),
    rawText,
    normalizedText: normalizeTelegramLabel(rawText),
    parseConfidence: null,
  };
  state.messages.unshift(record);
  return record;
}

function previousIntakeBoundaryForConversation(
  state: AutomationStoreState,
  intake: AutomationOrderIntake,
) {
  return state.intakes
    .filter((entry) => entry.conversationId === intake.conversationId && entry.intakeId !== intake.intakeId)
    .map((entry) => new Date(entry.createdAt).getTime())
    .filter((time) => Number.isFinite(time) && time <= new Date(intake.createdAt).getTime())
    .sort((left, right) => right - left)[0] ?? null;
}

function linkOrderMessagesToIntake(
  state: AutomationStoreState,
  intake: AutomationOrderIntake,
  sourceExternalMessageKey?: string | null,
) {
  if (sourceExternalMessageKey) {
    for (const message of state.messages) {
      if (
        message.conversationId === intake.conversationId
        && message.externalMessageKey === sourceExternalMessageKey
      ) {
        message.intakeId = intake.intakeId;
      }
    }
    return;
  }
  const intakeCreatedAt = new Date(intake.createdAt).getTime();
  const previousBoundary = previousIntakeBoundaryForConversation(state, intake);
  for (const message of state.messages) {
    if (message.conversationId !== intake.conversationId || message.intakeId) {
      continue;
    }
    if (sourceExternalMessageKey && message.externalMessageKey === sourceExternalMessageKey) {
      message.intakeId = intake.intakeId;
      continue;
    }
    const sentAt = new Date(message.sentAt).getTime();
    if (!Number.isFinite(sentAt) || sentAt > intakeCreatedAt) {
      continue;
    }
    if (previousBoundary != null && sentAt <= previousBoundary) {
      continue;
    }
    message.intakeId = intake.intakeId;
  }
}

function isActiveTelegramIntake(intake: AutomationOrderIntake) {
  return intake.status === 'new' || intake.status === 'quoted' || intake.status === 'needs_review';
}

function latestActiveTelegramIntakeForConversation(
  state: AutomationStoreState,
  conversationId: string,
) {
  return state.intakes
    .filter((intake) => intake.conversationId === conversationId && isActiveTelegramIntake(intake))
    .sort((left, right) => compareAutomationNewestFirst(left.updatedAt, right.updatedAt))[0] ?? null;
}

function appendExtraTelegramMessageToActiveIntake(
  state: AutomationStoreState,
  conversation: AutomationConversationSummary,
  messageRecord: AutomationMessageRecord | null,
  rawText: string,
) {
  if (!messageRecord) {
    return false;
  }
  const trimmedText = rawText.trim();
  if (!trimmedText) {
    return false;
  }
  const intake = latestActiveTelegramIntakeForConversation(state, conversation.conversationId);
  if (!intake) {
    return false;
  }
  const updatedAt = messageRecord.sentAt;
  messageRecord.intakeId = intake.intakeId;
  intake.status = 'needs_review';
  intake.parseConfidence = 'low';
  intake.updatedAt = updatedAt;
  const extraNote = `Customer follow-up: ${trimmedText}`;
  intake.notes = intake.notes?.trim()
    ? `${intake.notes.trim()}\n${extraNote}`
    : extraNote;
  recalculateConversation(state, conversation.conversationId);
  return true;
}

function upsertTelegramIntake(
  state: AutomationStoreState,
  conversation: AutomationConversationSummary,
  message: TelegramMessage,
  exposures: AutomationExposureRow[],
  currency: AppCurrency,
) {
  const rawText = message.text?.trim() ?? '';
  const lines = parseTelegramIntakeLines(rawText, exposures);
  const quotedSubtotal = lines.every((line) => line.lineTotal != null)
    ? lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0)
    : null;
  const status: AutomationIntakeStatus = quotedSubtotal != null && lines.every((line) => line.ambiguityReason == null)
    ? 'quoted'
    : 'needs_review';
  const parseConfidence = status === 'quoted' ? 'high' : lines.some((line) => line.entityId != null) ? 'medium' : 'low';
  const intake: AutomationOrderIntake = {
    intakeId: `intake_${randomUUID()}`,
    conversationId: conversation.conversationId,
    channel: 'telegram',
    status,
    parseConfidence,
    customerDisplayName: conversation.customerDisplayName,
    customerHandle: conversation.customerHandle,
    phone: normalizeNullablePhone(conversation.phone),
    notes: rawText || null,
    quotedSubtotal,
    currencyCode: currencyCodeForAppCurrency(currency),
    deliveryFee: null,
    quotedTotal: quotedSubtotal,
    createdAt: telegramMessageSentAt(message),
    updatedAt: telegramMessageSentAt(message),
    promotedTicketId: null,
    lines,
  };
  state.intakes.unshift(intake);
  linkOrderMessagesToIntake(state, intake, String(message.message_id));
  recalculateConversation(state, conversation.conversationId);
  return intake;
}

function renderWizardPromptForSession(
  state: AutomationStoreState,
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
  preferences: TelegramCustomerPreferences,
) {
  switch (session.currentStep) {
    case 'preferences_language':
      return buildWizardPreferencesLanguagePrompt();
    case 'preferences_currency':
      return buildWizardPreferencesCurrencyPrompt(preferences);
    case 'catalog':
      return buildWizardCatalogPrompt(exposures, session, preferences);
    case 'item': {
      const row = selectedExposureRow(session, exposures);
      if (row) {
        return buildWizardItemPrompt(row, session, preferences);
      }
      session.currentStep = 'catalog';
      clearWizardItemSelection(session);
      return buildWizardCatalogPrompt(exposures, session, preferences);
    }
    case 'cart':
      return buildWizardCartPrompt(session, preferences);
    case 'checkout_confirm':
      return buildWizardCheckoutConfirmPrompt(session, preferences);
    case 'checkout_location':
      return buildWizardLocationCapturePrompt(session, preferences);
    case 'checkout_note':
      return buildWizardNoteCapturePrompt(session, preferences);
    case 'menu':
    case 'checkout_identity':
    default:
      return buildWizardMenuPrompt(state.connection, session, preferences);
  }
}

function queueWizardItemImageCleanup(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  chatId: string,
) {
  if (session.lastItemImageMessageId == null) {
    return;
  }
  outboundJobs.push({
    kind: 'delete_message',
    chatId,
    conversationId: session.conversationId,
    messageId: session.lastItemImageMessageId,
    nonFatal: true,
  });
  session.lastItemImageMessageId = null;
  session.selectedItemImageEntityType = null;
  session.selectedItemImageEntityId = null;
}

function syncWizardItemImage(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
  preferences: TelegramCustomerPreferences,
  chatId: string,
) {
  const row = session.currentStep === 'item' ? selectedExposureRow(session, exposures) : null;
  const desiredImagePath = row?.imagePath?.trim() ? row.imagePath.trim() : null;
  const existingImageKey = session.selectedItemImageEntityType && session.selectedItemImageEntityId
    ? wizardLineKey(session.selectedItemImageEntityType, session.selectedItemImageEntityId)
    : null;
  const desiredImageKey = row ? wizardLineKey(row.entityType, row.entityId) : null;

  if (existingImageKey && existingImageKey !== desiredImageKey) {
    queueWizardItemImageCleanup(outboundJobs, session, chatId);
  }

  if (!desiredImagePath) {
    if (session.lastItemImageMessageId != null) {
      queueWizardItemImageCleanup(outboundJobs, session, chatId);
    }
    return;
  }

  if (session.lastItemImageMessageId != null && existingImageKey === desiredImageKey) {
    return;
  }

  outboundJobs.push({
    kind: 'send_photo',
    chatId,
    conversationId: session.conversationId,
    photoPath: desiredImagePath,
    caption: buildWizardItemImageCaption(row!, preferences),
    parseMode: 'HTML',
    storesItemImage: {
      entityType: row!.entityType,
      entityId: row!.entityId,
    },
  });
}

function queueWizardPrompt(
  outboundJobs: TelegramOutboundJob[],
  state: AutomationStoreState,
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
  preferences: TelegramCustomerPreferences,
  chatId: string,
) {
  const prompt = renderWizardPromptForSession(state, session, exposures, preferences);
  queueFreshWizardPrompt(outboundJobs, session, exposures, preferences, chatId, prompt);
}

function queueExplicitWizardMessage(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
  preferences: TelegramCustomerPreferences,
  chatId: string,
  prompt: {
    text: string;
    replyMarkup: TelegramMessageMarkup;
  },
) {
  queueFreshWizardPrompt(outboundJobs, session, exposures, preferences, chatId, prompt);
}

function deleteGeneratedWizardMessages(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  chatId: string,
) {
  const messageIds = [
    ...session.generatedWizardMessageIds,
    ...(session.lastWizardMessageId == null ? [] : [session.lastWizardMessageId]),
  ];
  const uniqueMessageIds = [...new Set(messageIds)];
  if (uniqueMessageIds.length === 0) {
    return;
  }
  for (const messageId of uniqueMessageIds) {
    outboundJobs.push({
      kind: 'delete_message',
      chatId,
      conversationId: session.conversationId,
      messageId,
      nonFatal: true,
    });
  }
  session.lastWizardMessageId = null;
  session.generatedWizardMessageIds = [];
  session.updatedAt = nowIso();
}

function queueGeneratedWizardSend(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  chatId: string,
  text: string,
  replyMarkup: TelegramMessageMarkup,
) {
  outboundJobs.push({
    kind: 'send',
    chatId,
    conversationId: session.conversationId,
    text,
    parseMode: 'HTML',
    replyMarkup,
    storesWizardMessage: true,
    messageRole: 'wizard_generated',
  });
}

function queueFreshWizardPrompt(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
  preferences: TelegramCustomerPreferences,
  chatId: string,
  prompt: {
    text: string;
    replyMarkup: TelegramMessageMarkup;
  },
) {
  deleteGeneratedWizardMessages(outboundJobs, session, chatId);
  syncWizardItemImage(outboundJobs, session, exposures, preferences, chatId);
  queueGeneratedWizardSend(outboundJobs, session, chatId, prompt.text, prompt.replyMarkup);
}

function queueFreshTypedCommandPrompt(
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
  preferences: TelegramCustomerPreferences,
  chatId: string,
  prompt: {
    text: string;
    replyMarkup: TelegramMessageMarkup;
  },
) {
  queueFreshWizardPrompt(outboundJobs, session, exposures, preferences, chatId, prompt);
}

function findExposureRow(
  exposures: AutomationExposureRow[],
  entityType: AutomationExposureEntityType,
  entityId: string,
) {
  return exposures.find((entry) => entry.entityType === entityType && entry.entityId === entityId && entry.exposed) ?? null;
}

function selectedExposureRow(
  session: AutomationWizardSession,
  exposures: AutomationExposureRow[],
) {
  if (session.selectedEntityType == null || session.selectedEntityId == null) {
    return null;
  }
  return findExposureRow(exposures, session.selectedEntityType, session.selectedEntityId);
}

function selectedDraftQuantity(session: AutomationWizardSession, row: AutomationExposureRow) {
  return session.draftLines.find((entry) =>
    wizardLineKey(entry.entityType, entry.entityId) === wizardLineKey(row.entityType, row.entityId),
  )?.quantity ?? 0;
}

function addExposureToWizardDraft(
  session: AutomationWizardSession,
  row: AutomationExposureRow,
) {
  const existing = session.draftLines.find((entry) => wizardLineKey(entry.entityType, entry.entityId) === wizardLineKey(row.entityType, row.entityId));
  if (existing) {
    existing.quantity += 1;
    existing.unitPrice = row.price;
    existing.availabilityStatus = row.availabilityStatus;
  } else {
    session.draftLines.push({
      entityType: row.entityType,
      entityId: row.entityId,
      label: row.label,
      quantity: 1,
      unitPrice: row.price,
      availabilityStatus: row.availabilityStatus,
    });
  }
  session.currentStep = 'cart';
  session.updatedAt = nowIso();
}

function adjustWizardDraftLine(
  session: AutomationWizardSession,
  entityType: AutomationExposureEntityType,
  entityId: string,
  delta: -1 | 1,
) {
  const line = session.draftLines.find((entry) => wizardLineKey(entry.entityType, entry.entityId) === wizardLineKey(entityType, entityId));
  if (!line) {
    return false;
  }
  line.quantity += delta;
  if (line.quantity <= 0) {
    session.draftLines = session.draftLines.filter((entry) => entry !== line);
  }
  session.updatedAt = nowIso();
  return true;
}

function removeWizardDraftLine(
  session: AutomationWizardSession,
  entityType: AutomationExposureEntityType,
  entityId: string,
) {
  const beforeCount = session.draftLines.length;
  session.draftLines = session.draftLines.filter((entry) => wizardLineKey(entry.entityType, entry.entityId) !== wizardLineKey(entityType, entityId));
  session.updatedAt = nowIso();
  return beforeCount !== session.draftLines.length;
}

function handleWizardCallback(
  state: AutomationStoreState,
  outboundJobs: TelegramOutboundJob[],
  session: AutomationWizardSession,
  conversation: AutomationConversationSummary,
  callbackData: string,
  callbackQueryId: string,
  exposures: AutomationExposureRow[],
  defaults: TelegramCustomerPreferences,
) {
  let preferences = conversationPreferencesFor(state, conversation.conversationId, defaults);
  const parsed = parseWizardCallbackData(callbackData);
  if (!parsed) {
    return false;
  }

  const acknowledge = (text?: string) => {
    outboundJobs.push({
      kind: 'answer_callback',
      callbackQueryId,
      text,
    });
  };

  switch (parsed.action) {
    case 'menu':
      session.currentStep = 'menu';
      session.pendingPromptIntent = null;
      clearWizardItemSelection(session);
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    case 'help':
      session.currentStep = 'menu';
      clearWizardItemSelection(session);
      queueExplicitWizardMessage(
        outboundJobs,
        session,
        exposures,
        preferences,
        conversation.externalConversationKey,
        buildWizardHelpPrompt(preferences),
      );
      acknowledge();
      return true;
    case 'preferences':
      session.currentStep = 'preferences_language';
      clearWizardItemSelection(session);
      queueFreshWizardPrompt(
        outboundJobs,
        session,
        exposures,
        preferences,
        conversation.externalConversationKey,
        buildWizardPreferencesLanguagePrompt(),
      );
      acknowledge();
      return true;
    case 'language':
      saveConversationPreferences(state, conversation.conversationId, {
        language: parsed.parts[0] === 'km' ? 'km' : 'en',
      }, defaults);
      preferences = conversationPreferencesFor(state, conversation.conversationId, defaults);
      session.currentStep = 'preferences_currency';
      clearWizardItemSelection(session);
      queueFreshWizardPrompt(
        outboundJobs,
        session,
        exposures,
        preferences,
        conversation.externalConversationKey,
        buildWizardPreferencesCurrencyPrompt(preferences),
      );
      acknowledge(isKhmerLanguage(preferences.language) ? 'បានរក្សាទុកភាសា។' : 'Language saved.');
      return true;
    case 'currency':
      saveConversationPreferences(state, conversation.conversationId, {
        currency: parsed.parts[0] === 'KHR' ? 'KHR' : 'USD',
      }, defaults);
      preferences = conversationPreferencesFor(state, conversation.conversationId, defaults);
      session.currentStep = 'menu';
      clearWizardItemSelection(session);
      queueGeneratedWizardSend(
        outboundJobs,
        session,
        conversation.externalConversationKey,
        buildPreferencesSavedPrompt(preferences.language),
        undefined,
      );
      queueFreshWizardPrompt(
        outboundJobs,
        session,
        exposures,
        preferences,
        conversation.externalConversationKey,
        buildWizardMenuPrompt(state.connection, session, preferences),
      );
      acknowledge(isKhmerLanguage(preferences.language) ? 'បានរក្សាទុករូបិយប័ណ្ណ។' : 'Currency saved.');
      return true;
    case 'available':
      session.currentStep = 'catalog';
      clearWizardItemSelection(session);
      session.catalogCursor = Number(parsed.parts[0] ?? 0) || 0;
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    case 'page':
      session.currentStep = 'catalog';
      clearWizardItemSelection(session);
      session.catalogCursor = Number(parsed.parts[0] ?? 0) || 0;
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    case 'item': {
      const [entityType, entityId] = parsed.parts as [AutomationExposureEntityType, string];
      const row = findExposureRow(exposures, entityType, entityId);
      if (!row) {
        acknowledge(isKhmerLanguage(preferences.language) ? 'មុខទំនិញនេះមិនមានទៀតទេ។' : 'That item is no longer available.');
        return true;
      }
      session.currentStep = 'item';
      session.selectedEntityType = row.entityType;
      session.selectedEntityId = row.entityId;
      session.updatedAt = nowIso();
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    }
    case 'order':
      session.currentStep = hasWizardDraft(session) ? 'cart' : 'catalog';
      clearWizardItemSelection(session);
      queueFreshTypedCommandPrompt(
        outboundJobs,
        session,
        exposures,
        preferences,
        conversation.externalConversationKey,
        renderWizardPromptForSession(state, session, exposures, preferences),
      );
      acknowledge(hasWizardDraft(session)
        ? (isKhmerLanguage(preferences.language) ? 'បានបន្តការបញ្ជាទិញរបស់អ្នក។' : 'Resumed your order.')
        : (isKhmerLanguage(preferences.language) ? 'បានចាប់ផ្តើមការបញ្ជាទិញថ្មី។' : 'Started a new order.'));
      return true;
    case 'cart':
      session.currentStep = 'cart';
      clearWizardItemSelection(session);
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    case 'add': {
      const [entityType, entityId] = parsed.parts as [AutomationExposureEntityType, string];
      const row = findExposureRow(exposures, entityType, entityId);
      if (!row) {
        acknowledge(isKhmerLanguage(preferences.language) ? 'មុខទំនិញនេះមិនមានទៀតទេ។' : 'That item is no longer available.');
        return true;
      }
      addExposureToWizardDraft(session, row);
      if (session.selectedEntityType === row.entityType && session.selectedEntityId === row.entityId) {
        session.currentStep = 'item';
      }
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge(isKhmerLanguage(preferences.language) ? `បានបន្ថែម ${row.label}។` : `${row.label} added.`);
      return true;
    }
    case 'inc': {
      const [entityType, entityId] = parsed.parts as [AutomationExposureEntityType, string];
      if (!adjustWizardDraftLine(session, entityType, entityId, 1)) {
        acknowledge(isKhmerLanguage(preferences.language) ? 'បន្ទាត់នេះមិនមានទៀតនៅក្នុងកន្ត្រកទេ។' : 'That line is no longer in the cart.');
        return true;
      }
      session.currentStep = session.selectedEntityType === entityType && session.selectedEntityId === entityId ? 'item' : 'cart';
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    }
    case 'dec': {
      const [entityType, entityId] = parsed.parts as [AutomationExposureEntityType, string];
      if (!adjustWizardDraftLine(session, entityType, entityId, -1)) {
        acknowledge(isKhmerLanguage(preferences.language) ? 'បន្ទាត់នេះមិនមានទៀតនៅក្នុងកន្ត្រកទេ។' : 'That line is no longer in the cart.');
        return true;
      }
      session.currentStep = session.selectedEntityType === entityType && session.selectedEntityId === entityId ? 'item' : 'cart';
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge();
      return true;
    }
    case 'remove': {
      const [entityType, entityId] = parsed.parts as [AutomationExposureEntityType, string];
      removeWizardDraftLine(session, entityType, entityId);
      session.currentStep = session.selectedEntityType === entityType && session.selectedEntityId === entityId ? 'item' : 'cart';
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge(isKhmerLanguage(preferences.language) ? 'បានលុបចេញពីកន្ត្រក។' : 'Removed from cart.');
      return true;
    }
    case 'checkout':
      session.currentStep = 'checkout_identity';
      clearWizardItemSelection(session);
      session.pendingPromptIntent = 'share_phone';
      queueWizardItemImageCleanup(outboundJobs, session, conversation.externalConversationKey);
      deleteGeneratedWizardMessages(outboundJobs, session, conversation.externalConversationKey);
      const checkoutPrompt = buildWizardPhoneCapturePrompt(session, preferences);
      queueGeneratedWizardSend(outboundJobs, session, conversation.externalConversationKey, checkoutPrompt.text, checkoutPrompt.replyMarkup);
      acknowledge();
      return true;
    case 'confirm': {
      if (session.currentStep !== 'checkout_confirm' || session.draftLines.length === 0) {
        acknowledge(isKhmerLanguage(preferences.language) ? 'ការបញ្ជាទិញនេះត្រូវបានផ្ញើទៅកខរួចហើយ។' : 'This order was already sent to Kaur Khor.');
        return true;
      }
      const intake = submitWizardCheckout(state, outboundJobs, session, conversation, defaults.currency, preferences);
      acknowledge(intake?.status === 'quoted'
        ? (isKhmerLanguage(preferences.language) ? 'បានផ្ញើទៅកខ។' : 'Sent to Kaur Khor.')
        : (isKhmerLanguage(preferences.language) ? 'បានផ្ញើសម្រាប់ការពិនិត្យ។' : 'Sent for review.'));
      return true;
    }
    case 'cancel':
      clearWizardDraft(session);
      outboundJobs.push({
        kind: 'send',
        chatId: conversation.externalConversationKey,
        conversationId: conversation.conversationId,
        text: isKhmerLanguage(preferences.language)
          ? '<b>បានបោះបង់ការបញ្ជាទិញ</b>\nសេចក្តីព្រាងការបញ្ជាទិញរបស់អ្នកត្រូវបានសម្អាត។'
          : '<b>Order canceled</b>\nYour draft order was cleared.',
        parseMode: 'HTML',
        replyMarkup: removeKeyboard(),
      });
      queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      acknowledge(isKhmerLanguage(preferences.language) ? 'បានបោះបង់។' : 'Canceled.');
      return true;
    default:
      return false;
  }
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
    conversations: [...state.conversations].sort((left, right) => compareAutomationNewestFirst(left.lastMessageAt, right.lastMessageAt)),
    intakes: [...state.intakes].sort((left, right) => compareAutomationNewestFirst(left.updatedAt, right.updatedAt)),
  };
}

export async function readAutomationConnection(userDataPath: string): Promise<AutomationChannelConnection> {
  return (await loadAutomationState(userDataPath)).connection;
}

export async function readAutomationTransportState(userDataPath: string) {
  const state = await loadAutomationState(userDataPath);
  const connection = state.connection;
  return {
    botToken: connection.botToken,
    connection,
    telegramUpdateCursor: state.telegramUpdateCursor,
  };
}

export async function saveAutomationConnection(
  userDataPath: string,
  payload: AutomationConnectionPatch,
): Promise<AutomationChannelConnection> {
  assertAutomationConnectionPatchIsValid(payload);
  return updateAutomationState(userDataPath, (state) => {
    const now = nowIso();
    const current = state.connection;
    state.connection = {
      ...current,
      status: payload.status ?? current.status,
      botToken: payload.botToken === undefined ? current.botToken : payload.botToken,
      hasBotToken: payload.botToken === undefined ? current.hasBotToken : Boolean(payload.botToken?.trim()),
      commandsConfiguredAt:
        payload.status === 'disconnected'
          ? null
          : current.commandsConfiguredAt,
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
          ? 'Telegram transport reported an error. Check the connection details and retry.'
          : payload.status === 'connected' || payload.status === 'disconnected'
            ? null
            : current.lastErrorMessage,
    };
    return state.connection;
  });
}

export async function applyAutomationTelegramProfile(
  userDataPath: string,
  {
    token,
    user,
  }: {
    token: string;
    user: TelegramBotUser;
  },
) {
  return updateAutomationState(userDataPath, (state) => {
    const now = nowIso();
    state.connection = {
      ...state.connection,
      botToken: token,
      hasBotToken: Boolean(token.trim()),
      status: 'connected',
      commandsConfiguredAt: state.connection.commandsConfiguredAt,
      botDisplayName: user.first_name,
      botUsername: user.username ?? state.connection.botUsername,
      externalLink: user.username ? `https://t.me/${user.username}` : state.connection.externalLink,
      connectedAt: state.connection.connectedAt ?? now,
      pausedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
    };
    return state.connection;
  });
}

export async function recordAutomationTelegramError(userDataPath: string, message: string) {
  return updateAutomationState(userDataPath, (state) => {
    state.connection.status = 'error';
    state.connection.lastErrorAt = nowIso();
    state.connection.lastErrorMessage = message;
    return state.connection;
  });
}

export async function markAutomationTelegramCommandsConfigured(userDataPath: string) {
  return updateAutomationState(userDataPath, (state) => {
    state.connection.commandsConfiguredAt = nowIso();
    return state.connection;
  });
}

export async function appendAutomationOutboundTelegramMessage(
  userDataPath: string,
  {
    conversationId,
    externalMessageKey,
    intakeId = null,
    sentAt,
    text,
  }: {
    conversationId: string;
    externalMessageKey: string;
    intakeId?: string | null;
    sentAt: string;
    text: string;
  },
) {
  return updateAutomationState(userDataPath, (state) => {
    const exists = state.messages.find((entry) =>
      entry.conversationId === conversationId && entry.externalMessageKey === externalMessageKey,
    );
    if (!exists) {
      state.messages.unshift({
        messageId: `msg_${randomUUID()}`,
        conversationId,
        intakeId,
        externalMessageKey,
        direction: 'outbound',
        sentAt,
        rawText: text,
        normalizedText: normalizeTelegramLabel(text),
        parseConfidence: null,
      });
      recalculateConversation(state, conversationId);
    }
  });
}

export async function removeAutomationOutboundTelegramMessage(
  userDataPath: string,
  {
    conversationId,
    externalMessageKey,
  }: {
    conversationId: string;
    externalMessageKey: string;
  },
) {
  return updateAutomationState(userDataPath, (state) => {
    const beforeCount = state.messages.length;
    state.messages = state.messages.filter((entry) =>
      !(entry.conversationId === conversationId && entry.externalMessageKey === externalMessageKey && entry.direction === 'outbound'),
    );
    const session = wizardSessionForConversation(state, conversationId);
    if (session) {
      const messageId = Number(externalMessageKey);
      if (Number.isFinite(messageId)) {
        session.generatedWizardMessageIds = session.generatedWizardMessageIds.filter((entry) => entry !== messageId);
        if (session.lastWizardMessageId === messageId) {
          session.lastWizardMessageId = null;
        }
        session.updatedAt = nowIso();
      }
    }
    if (state.messages.length !== beforeCount) {
      recalculateConversation(state, conversationId);
    }
  });
}

export async function recordAutomationWizardMessage(
  userDataPath: string,
  {
    conversationId,
    messageId,
  }: {
    conversationId: string;
    messageId: number;
  },
) {
  return updateAutomationState(userDataPath, (state) => {
    const session = wizardSessionForConversation(state, conversationId);
    if (!session) {
      return null;
    }
    session.lastWizardMessageId = messageId;
    if (!session.generatedWizardMessageIds.includes(messageId)) {
      session.generatedWizardMessageIds.push(messageId);
    }
    session.updatedAt = nowIso();
    return session;
  });
}

export async function recordAutomationWizardItemImageMessage(
  userDataPath: string,
  {
    conversationId,
    messageId,
    entityType,
    entityId,
  }: {
    conversationId: string;
    messageId: number;
    entityType: AutomationExposureEntityType;
    entityId: string;
  },
) {
  return updateAutomationState(userDataPath, (state) => {
    const session = wizardSessionForConversation(state, conversationId);
    if (!session) {
      return null;
    }
    session.lastItemImageMessageId = messageId;
    session.selectedItemImageEntityType = entityType;
    session.selectedItemImageEntityId = entityId;
    session.updatedAt = nowIso();
    return session;
  });
}

export async function listAutomationPendingTelegramOutboundJobs(
  userDataPath: string,
): Promise<AutomationPendingTelegramOutboundJob[]> {
  const state = await loadAutomationState(userDataPath);
  return [...state.pendingOutboundJobs].sort(
    (left, right) => automationCreatedAtSortValue(left.createdAt) - automationCreatedAtSortValue(right.createdAt),
  );
}

export async function removeAutomationPendingTelegramOutboundJob(
  userDataPath: string,
  jobId: string,
) {
  return updateAutomationState(userDataPath, (state) => {
    state.pendingOutboundJobs = state.pendingOutboundJobs.filter((entry) => entry.jobId !== jobId);
  });
}

export async function markAutomationPendingTelegramOutboundJobSent(
  userDataPath: string,
  jobId: string,
  sentMessage: AutomationPendingTelegramOutboundJob['sentMessage'],
) {
  return updateAutomationState(userDataPath, (state) => {
    const pendingJob = state.pendingOutboundJobs.find((entry) => entry.jobId === jobId);
    if (!pendingJob || pendingJob.job.kind !== 'send' || !sentMessage) {
      return null;
    }
    pendingJob.sentMessage = sentMessage;
    return pendingJob;
  });
}

function ticketEventIdentity(event: SenaTicketEvent) {
  return [
    event.ticketFamily,
    event.ticketId,
    event.revision,
    event.eventType,
    event.occurredAt,
  ].join('|');
}

export function ticketEventsRequiringTelegramNotification(
  nextTicketEvents: SenaTicketEvent[] | undefined,
  previousTicketEvents?: SenaTicketEvent[] | undefined,
) {
  const previousEventIdentities = new Set((previousTicketEvents ?? []).map(ticketEventIdentity));
  return (nextTicketEvents ?? []).filter((ticketEvent) =>
    ticketEvent.ticketFamily === 'customer' && !previousEventIdentities.has(ticketEventIdentity(ticketEvent)),
  );
}

export async function readAutomationWizardSessionForConversation(
  userDataPath: string,
  conversationId: string,
) {
  const state = await loadAutomationState(userDataPath);
  return wizardSessionForConversation(state, conversationId);
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
  assertAutomationExposurePatchIsValid(payload);
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
      exposed: payload.exposed ?? true,
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
  return [...state.conversations].sort((left, right) => compareAutomationNewestFirst(left.lastMessageAt, right.lastMessageAt));
}

export async function readAutomationConversation(
  userDataPath: string,
  conversationId: string,
): Promise<{
  conversation: AutomationConversationSummary;
  messages: AutomationMessageRecord[];
  intakes: AutomationOrderIntake[];
}> {
  assertAutomationReadConversationIdIsValid(conversationId);
  const state = await loadAutomationState(userDataPath);
  const conversation = state.conversations.find((entry) => entry.conversationId === conversationId);
  if (!conversation) {
    throw new Error('Automation conversation not found.');
  }
  return {
    conversation,
    messages: state.messages
      .filter((entry) => entry.conversationId === conversationId)
      .sort((left, right) => compareAutomationOldestFirst(left.sentAt, right.sentAt)),
    intakes: state.intakes
      .filter((entry) => entry.conversationId === conversationId)
      .sort((left, right) => compareAutomationNewestFirst(left.updatedAt, right.updatedAt)),
  };
}

export async function readAutomationIntakeThread(
  userDataPath: string,
  intakeId: string,
): Promise<{
  conversation: AutomationConversationSummary;
  intake: AutomationOrderIntake;
  messages: AutomationMessageRecord[];
}> {
  assertAutomationReadIntakeIdIsValid(intakeId);
  const state = await loadAutomationState(userDataPath);
  const intake = state.intakes.find((entry) => entry.intakeId === intakeId);
  if (!intake) {
    throw new Error('Automation intake not found.');
  }
  const conversation = state.conversations.find((entry) => entry.conversationId === intake.conversationId);
  if (!conversation) {
    throw new Error('Automation conversation not found.');
  }
  const linkedMessages = state.messages.filter((entry) => entry.intakeId === intakeId);
  const legacySourceMessages = linkedMessages.length > 0
    ? []
    : state.messages.filter((entry) =>
      entry.intakeId == null
      && entry.conversationId === intake.conversationId
      && entry.direction === 'inbound'
      && entry.sentAt === intake.createdAt
      && (entry.rawText.trim() === intake.notes?.trim() || intake.notes?.includes(entry.rawText.trim())),
    );
  return {
    conversation,
    intake,
    messages: [...linkedMessages, ...legacySourceMessages]
      .sort((left, right) => compareAutomationOldestFirst(left.sentAt, right.sentAt)),
  };
}

export async function readAutomationCustomerPreferences(
  userDataPath: string,
  conversationId: string,
): Promise<Pick<TelegramCustomerPreferences, 'language' | 'currency'> | null> {
  const state = await loadAutomationState(userDataPath);
  const record = state.customerPreferences.find((entry) => entry.conversationId === conversationId);
  if (!record) {
    return null;
  }
  return {
    language: record.language,
    currency: record.currency,
  };
}

export async function findAutomationConversationForTelegramTicket(
  userDataPath: string,
  ticketEvent: SenaTicketEvent,
): Promise<AutomationConversationSummary | null> {
  if (ticketEvent.ticketFamily !== 'customer' || ticketEvent.party?.channelKey !== 'telegram') {
    return null;
  }

  const state = await loadAutomationState(userDataPath);
  const intakeMatch = [...state.intakes]
    .filter((entry) => entry.promotedTicketId === ticketEvent.ticketId)
    .sort((left, right) => compareAutomationNewestFirst(left.updatedAt, right.updatedAt))[0];

  if (intakeMatch) {
    return state.conversations.find((entry) => entry.conversationId === intakeMatch.conversationId) ?? null;
  }

  const phoneKey = normalizePhoneLookupKey(ticketEvent.party?.phone);
  if (phoneKey) {
    const conversationByPhone = state.conversations.find((entry) => normalizePhoneLookupKey(entry.phone) === phoneKey);
    if (conversationByPhone) {
      return conversationByPhone;
    }
  }

  const customerNameKey = safeLower(ticketEvent.party?.customerName);
  if (!customerNameKey) {
    return null;
  }

  return state.conversations.find((entry) =>
    safeLower(entry.customerDisplayName) === customerNameKey || safeLower(entry.customerHandle) === customerNameKey,
  ) ?? null;
}

export async function listAutomationIntakes(
  userDataPath: string,
  payload?: AutomationListIntakesPayload,
): Promise<AutomationOrderIntake[]> {
  assertAutomationListIntakesPayloadIsValid(payload);
  const state = await loadAutomationState(userDataPath);
  return filterIntakes(
    [...state.intakes].sort((left, right) => compareAutomationNewestFirst(left.updatedAt, right.updatedAt)),
    payload,
  );
}

export async function readAutomationIntake(
  userDataPath: string,
  intakeId: string,
): Promise<AutomationOrderIntake | null> {
  assertAutomationReadIntakeIdIsValid(intakeId);
  const state = await loadAutomationState(userDataPath);
  return state.intakes.find((entry) => entry.intakeId === intakeId) ?? null;
}

export async function resolveAutomationIntake(
  userDataPath: string,
  payload: AutomationResolveIntakePayload,
): Promise<AutomationOrderIntake> {
  assertAutomationResolvePayloadIsValid(payload);
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
      phone: '+855 12000000',
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
      phone: '+855 12000000',
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

export async function ingestAutomationTelegramUpdates(
  userDataPath: string,
  {
    currency,
    language = 'en',
    persistOutboundJobs = false,
    usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
    updates,
    context,
  }: {
    currency: AppCurrency;
    language?: AppLanguage;
    persistOutboundJobs?: boolean;
    usdToKhrExchangeRate?: number;
    updates: TelegramUpdate[];
    context: ExposureBuildContext;
  },
) {
  const exposures = buildExposureRows(await loadAutomationState(userDataPath), context);
  const defaultPreferences: TelegramCustomerPreferences = {
    language,
    currency,
    usdToKhrExchangeRate,
  };
  return updateAutomationState(userDataPath, (state) => {
    const outboundJobs: TelegramOutboundJob[] = [];
    for (const update of updates) {
      state.telegramUpdateCursor = Math.max(state.telegramUpdateCursor ?? 0, update.update_id + 1);
      const callbackQuery = update.callback_query;
      if (callbackQuery?.message?.chat.type === 'private' && callbackQuery.message.chat.id != null) {
        const callbackSentAt = telegramMessageSentAt(callbackQuery.message);
        const conversation = upsertTelegramConversationFromCallback(
          state,
          String(callbackQuery.message.chat.id),
          callbackQuery.message.chat,
          callbackQuery.from,
          callbackSentAt,
        );
        const session = upsertWizardSession(state, conversation.conversationId);
        const handled = handleWizardCallback(
          state,
          outboundJobs,
          session,
          conversation,
          callbackQuery.data ?? '',
          callbackQuery.id,
          exposures,
          defaultPreferences,
        );
        if (handled) {
          state.connection.status = 'connected';
          state.connection.lastWebhookAt = callbackSentAt;
          state.connection.lastErrorAt = null;
          state.connection.lastErrorMessage = null;
          continue;
        }
      }

      const message = update.message ?? update.edited_message;
      if (message?.chat.type !== 'private') {
        continue;
      }

      const conversation = upsertTelegramConversation(state, message);
      const session = upsertWizardSession(state, conversation.conversationId);
      const command = extractTelegramCommand(message);
      const preferences = conversationPreferencesFor(state, conversation.conversationId, defaultPreferences);
      const requiresPreferenceOnboarding = !hasConfiguredConversationPreferences(state, conversation.conversationId)
        && conversation.messageCount === 0
        && command !== '/preferences';
      const inserted = insertTelegramInboundMessage(state, conversation.conversationId, message);
      if (!inserted && !message.contact && !message.location) {
        continue;
      }

      const normalizedText = normalizeTelegramLabel(message.text);

      if (requiresPreferenceOnboarding) {
        session.currentStep = 'preferences_language';
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardPreferencesLanguagePrompt(),
        );
      } else if (message.contact && session.pendingPromptIntent === 'share_phone') {
        const phone = normalizeNullablePhone(message.contact.phone_number);
        session.phone = phone;
        conversation.phone = phone;
        queueWizardLocationPrompt(outboundJobs, session, conversation, preferences);
      } else if (
        session.pendingPromptIntent === 'share_phone'
        && (normalizedText === 'skip phone' || normalizedText === normalizeTelegramLabel('រំលងលេខទូរស័ព្ទ'))
      ) {
        queueWizardLocationPrompt(outboundJobs, session, conversation, preferences);
      } else if (session.pendingPromptIntent === 'share_location' && message.location) {
        session.deliveryLocation = telegramLocationText(message);
        queueWizardNotePrompt(outboundJobs, session, conversation, preferences);
      } else if (
        session.pendingPromptIntent === 'share_location'
        && (normalizedText === 'skip location' || normalizedText === normalizeTelegramLabel('រំលងទីតាំង'))
      ) {
        queueWizardNotePrompt(outboundJobs, session, conversation, preferences);
      } else if (session.pendingPromptIntent === 'share_location' && message.text?.trim() && !command) {
        session.deliveryLocation = message.text.trim();
        queueWizardNotePrompt(outboundJobs, session, conversation, preferences);
      } else if (
        session.pendingPromptIntent === 'share_note'
        && (normalizedText === 'skip notes' || normalizedText === normalizeTelegramLabel('រំលងកំណត់ចំណាំ'))
      ) {
        session.pendingPromptIntent = null;
        submitWizardCheckout(state, outboundJobs, session, conversation, defaultPreferences.currency, preferences);
      } else if (session.pendingPromptIntent === 'share_note' && message.text?.trim() && !command) {
        session.customerNote = message.text.trim();
        session.pendingPromptIntent = null;
        submitWizardCheckout(state, outboundJobs, session, conversation, defaultPreferences.currency, preferences);
      } else if (command === '/start') {
        session.currentStep = 'menu';
        clearWizardItemSelection(session);
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardMenuPrompt(state.connection, session, preferences),
        );
      } else if (command === '/help') {
        session.currentStep = 'menu';
        clearWizardItemSelection(session);
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardHelpPrompt(preferences),
        );
      } else if (command === '/preferences') {
        session.currentStep = 'preferences_language';
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardPreferencesLanguagePrompt(),
        );
      } else if (command === '/available') {
        session.currentStep = 'catalog';
        clearWizardItemSelection(session);
        session.catalogCursor = 0;
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardCatalogPrompt(exposures, session, preferences),
        );
      } else if (command === '/order') {
        session.currentStep = hasWizardDraft(session) ? 'cart' : 'catalog';
        clearWizardItemSelection(session);
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          renderWizardPromptForSession(state, session, exposures, preferences),
        );
      } else if (command === '/cart') {
        session.currentStep = 'cart';
        clearWizardItemSelection(session);
        queueFreshTypedCommandPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardCartPrompt(session, preferences),
        );
      } else if (command === '/cancel') {
        queueWizardItemImageCleanup(outboundJobs, session, conversation.externalConversationKey);
        deleteGeneratedWizardMessages(outboundJobs, session, conversation.externalConversationKey);
        clearWizardDraft(session);
        outboundJobs.push({
          kind: 'send',
          chatId: conversation.externalConversationKey,
          conversationId: conversation.conversationId,
          text: isKhmerLanguage(preferences.language)
            ? '<b>បានបោះបង់ការបញ្ជាទិញ</b>\nសេចក្តីព្រាងការបញ្ជាទិញរបស់អ្នកត្រូវបានសម្អាត។'
            : '<b>Order canceled</b>\nYour draft order was cleared.',
          parseMode: 'HTML',
          replyMarkup: removeKeyboard(),
        });
        queueFreshWizardPrompt(
          outboundJobs,
          session,
          exposures,
          preferences,
          conversation.externalConversationKey,
          buildWizardMenuPrompt(state.connection, session, preferences),
        );
      } else if (
        (hasWizardDraft(session) || session.currentStep === 'catalog' || session.currentStep === 'item' || session.currentStep === 'cart' || session.currentStep === 'checkout_identity' || session.currentStep === 'checkout_confirm')
        && applyFreeTextCartMatch(session, message.text?.trim() ?? '', exposures)
      ) {
        clearWizardItemSelection(session);
        queueWizardPrompt(outboundJobs, state, session, exposures, preferences, conversation.externalConversationKey);
      } else if (message.text?.trim()) {
        clearWizardItemSelection(session);
        queueWizardItemImageCleanup(outboundJobs, session, conversation.externalConversationKey);
        if (appendExtraTelegramMessageToActiveIntake(state, conversation, inserted, message.text)) {
          state.connection.status = 'connected';
          state.connection.lastWebhookAt = telegramMessageSentAt(message);
          state.connection.lastErrorAt = null;
          state.connection.lastErrorMessage = null;
          continue;
        }
        const intake = upsertTelegramIntake(state, conversation, message, exposures, defaultPreferences.currency);
        outboundJobs.push({
          kind: 'send',
          chatId: conversation.externalConversationKey,
          conversationId: conversation.conversationId,
          intakeId: intake.intakeId,
          text: buildTelegramReply(intake, preferences),
          parseMode: 'HTML',
        });
      }

      state.connection.status = 'connected';
      state.connection.lastWebhookAt = telegramMessageSentAt(message);
      state.connection.lastErrorAt = null;
      state.connection.lastErrorMessage = null;
    }
    if (persistOutboundJobs) {
      const pendingCreatedAt = nowIso();
      for (const job of outboundJobs) {
        state.pendingOutboundJobs.push({
          jobId: `telegram_job_${randomUUID()}`,
          createdAt: pendingCreatedAt,
          job,
        });
      }
    }
    return {
      connection: state.connection,
      outboundJobs,
      replyJobs: outboundJobs
        .filter((job): job is Extract<TelegramOutboundJob, { kind: 'send' | 'edit' }> => job.kind === 'send' || job.kind === 'edit')
        .map((job) => ({
          chatId: job.chatId,
          conversationId: job.conversationId,
          text: job.text,
        })),
      telegramUpdateCursor: state.telegramUpdateCursor,
    };
  });
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
  assertPromoteAutomationIntakePayloadIsValid(payload);
  const state = await loadAutomationState(userDataPath);
  const intake = state.intakes.find((entry) => entry.intakeId === payload.intakeId);
  if (!intake) {
    throw new Error('Automation intake not found.');
  }
  assertPromotableAutomationIntake(intake);
  if (observations.length === 0) {
    throw new Error('Automations needs at least one stock update before it can promote Telegram intake into Kaur Khor tickets.');
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
  const appendTargetTicket = payload.mode === 'append_ticket'
    ? validateAppendTicketTarget(observations, payload.ticketId!)
    : null;
  const observedAt = nowIso();
  const ticketId = payload.mode === 'append_ticket'
    ? payload.ticketId!
    : automationCreatedTicketId(intake.intakeId);
  const existingPromotionEvent = promotionEventForIntake(observations, intake, ticketId);
  if (existingPromotionEvent) {
    const recoveredIntake: AutomationOrderIntake = {
      ...intake,
      status: 'ticketed',
      promotedTicketId: ticketId,
      updatedAt: existingPromotionEvent.occurredAt,
      notes: existingPromotionEvent.note ?? intake.notes,
    };
    return {
      ticketEvent: existingPromotionEvent,
      commercialEvents: [],
      updatedIntake: recoveredIntake,
      shouldIngestObservation: false,
      observationInput: {
        observedAt: existingPromotionEvent.occurredAt,
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
        commercialEvents: [],
        ticketEvents: [],
        recipeUsageHints: [],
        notes: existingPromotionEvent.note ?? null,
      },
    };
  }
  const revision = appendTargetTicket ? appendTargetTicket.revision + 1 : 1;
  const note = buildPromotionNote(intake, payload.note);
  const promotedLines = intake.lines.map((line) => ({
    entityType: line.entityType,
    entityId: line.entityId!,
    quantityDelta: line.quantity,
    note: line.requestedLabel !== line.resolvedLabel ? `Requested as ${line.requestedLabel}` : line.requestedLabel,
  }));
  const lines = appendTargetTicket ? [...appendTargetTicket.lines, ...promotedLines] : promotedLines;
  const phone = normalizeNullablePhone(payload.customerIdentityOverride?.phone || intake.phone);
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
      phone,
      phoneKey: phone ? normalizePhoneLookupKey(phone) : null,
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
    shouldIngestObservation: true,
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
  if (updatedIntake.status !== 'ticketed' || !updatedIntake.promotedTicketId) {
    throw new Error('Automation promotion finalization requires a ticketed intake.');
  }
  return updateAutomationState(userDataPath, (state) => {
    const intakeIndex = state.intakes.findIndex((entry) => entry.intakeId === updatedIntake.intakeId);
    if (intakeIndex < 0) {
      throw new Error('Automation intake disappeared before promotion completed.');
    }
    assertPromotableAutomationIntake(state.intakes[intakeIndex]!);
    state.intakes[intakeIndex] = updatedIntake;
    recalculateConversation(state, updatedIntake.conversationId);
    return updatedIntake;
  });
}
