// @vitest-environment node

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  finalizeAutomationPromotion,
  findAutomationConversationForTelegramTicket,
  ingestAutomationTelegramUpdates,
  patchAutomationExposureRow,
  prepareAutomationPromotion,
  readAutomationConversation,
  readAutomationIntakeThread,
  readAutomationWorkspace,
  readAutomationTransportState,
  recordAutomationWizardItemImageMessage,
  recordAutomationWizardMessage,
  readAutomationWizardSessionForConversation,
  saveAutomationConnection,
  ticketEventsRequiringTelegramNotification,
} from './automation-store';
import type { SenaTicketEvent } from '@shared/sena';

const AUTOMATION_STORE_SOURCE_PATH = new URL('./automation-store.ts', import.meta.url);
const MAIN_INDEX_SOURCE_PATH = new URL('./index.ts', import.meta.url);

const context = {
  catalog: {
    schemaVersion: 1,
    bundles: [],
    services: [],
    sharingMask: [],
    skus: [
      {
        archived: false,
        costPerUnit: 5,
        description: 'Cotton scarf',
        imagePath: '/tmp/cotton-scarf.png',
        leadTimeMeanDaysHint: 3,
        leadTimeStdDaysHint: 1,
        name: 'Cotton Scarf',
        productPrice: 12.5,
        skuId: 'sku-1',
        soldAsProduct: true,
        supplierName: 'Mekong Looms',
      },
    ],
  },
  recordUpdateContext: {
    observationFingerprint: {
      count: 1,
      latestObservationId: 'obs-1',
      latestObservedAt: '2026-04-21T00:00:00.000Z',
    },
    latestObservedAt: '2026-04-21T00:00:00.000Z',
    latestStockBySku: {
      'sku-1': {
        observationId: 'obs-1',
        observedAt: '2026-04-21T00:00:00.000Z',
        value: {
          skuId: 'sku-1',
          unitsInStock: 8,
        },
      },
    },
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: { customer: [], supplier: [] },
    latestTicketsById: {},
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  },
  observations: [
    {
      observationId: 'obs-1',
      input: {
        ticketEvents: [],
      },
    },
  ],
};

async function completePreferencesOnboarding(
  userDataPath: string,
  {
    chatId,
    firstName,
    language = 'en',
    currency = 'USD',
  }: {
    chatId: number;
    firstName: string;
    language?: 'en' | 'km';
    currency?: 'USD' | 'KHR';
  },
) {
  await ingestAutomationTelegramUpdates(userDataPath, {
    context: context as never,
    currency: 'USD',
    updates: [
      {
        update_id: chatId * 10 + 1,
        message: {
          message_id: chatId * 10 + 1,
          date: 1_745_193_500,
          text: '/start',
          chat: {
            id: chatId,
            type: 'private',
          },
          from: {
            id: chatId,
            first_name: firstName,
          },
        },
      },
      {
        update_id: chatId * 10 + 2,
        callback_query: {
          id: `callback-language-${chatId}`,
          data: `w:language:${language}`,
          from: {
            id: chatId,
            first_name: firstName,
          },
          message: {
            message_id: chatId * 10 + 2,
            date: 1_745_193_501,
            chat: {
              id: chatId,
              type: 'private',
            },
          },
        },
      },
      {
        update_id: chatId * 10 + 3,
        callback_query: {
          id: `callback-currency-${chatId}`,
          data: `w:currency:${currency}`,
          from: {
            id: chatId,
            first_name: firstName,
          },
          message: {
            message_id: chatId * 10 + 3,
            date: 1_745_193_502,
            chat: {
              id: chatId,
              type: 'private',
            },
          },
        },
      },
    ],
  });
}

function expectFreshWizardSendDeletesPreviousWizard(
  result: Awaited<ReturnType<typeof ingestAutomationTelegramUpdates>>,
  messageId: number,
) {
  const freshWizardIndex = [...result.outboundJobs]
    .map((job, index) => ({ job, index }))
    .filter((entry) => entry.job.kind === 'send' && entry.job.storesWizardMessage)
    .at(-1)?.index ?? -1;
  expect(freshWizardIndex).toBeGreaterThanOrEqual(0);
 expect(result.outboundJobs.slice(0, freshWizardIndex).some((job) =>
    job.kind === 'delete_message' &&
    job.messageId === messageId &&
    job.nonFatal === true,
  ), JSON.stringify(result.outboundJobs, null, 2)).toBe(true);
}

function expectWizardRemainsLatest(
  result: Awaited<ReturnType<typeof ingestAutomationTelegramUpdates>>,
) {
  const latestWizardIndex = [...result.outboundJobs]
    .map((job, index) => ({ job, index }))
    .filter((entry) => entry.job.kind === 'send' && entry.job.storesWizardMessage)
    .at(-1)?.index ?? -1;
  expect(latestWizardIndex).toBeGreaterThanOrEqual(0);
  expect(
    result.outboundJobs.slice(latestWizardIndex + 1).some((job) =>
      job.kind === 'send' || job.kind === 'send_photo' || job.kind === 'edit',
    ),
    JSON.stringify(result.outboundJobs, null, 2),
  ).toBe(false);
}

function telegramRenderedParts(result: Awaited<ReturnType<typeof ingestAutomationTelegramUpdates>>) {
  const parts: string[] = [];
  for (const job of result.outboundJobs) {
    if ((job.kind === 'send' || job.kind === 'edit') && job.text) {
      parts.push(job.text);
    }
    if (job.kind === 'send_photo' && job.caption) {
      parts.push(job.caption);
    }
    if (job.kind === 'answer_callback' && job.text) {
      parts.push(job.text);
    }
    if ((job.kind === 'send' || job.kind === 'edit') && 'replyMarkup' in job && job.replyMarkup) {
      if ('inline_keyboard' in job.replyMarkup) {
        for (const row of job.replyMarkup.inline_keyboard) {
          for (const button of row) {
            parts.push(button.text);
          }
        }
      }
      if ('keyboard' in job.replyMarkup) {
        for (const row of job.replyMarkup.keyboard) {
          for (const button of row) {
            parts.push(typeof button === 'string' ? button : button.text);
          }
        }
      }
    }
  }
  return parts;
}

function expectNoUnexpectedKhmerLatin(renderedParts: string[]) {
  const allowedLatinFragments = [
    '/preferences',
    '2 Cotton Scarf',
    'Cotton Scarf',
    'KHR',
    'USD',
  ];
  const unexpected = renderedParts.flatMap((part) => {
    const withoutHtmlTags = part.replace(/<\/?[A-Za-z][^>]*>/g, '');
    const redacted = allowedLatinFragments.reduce((text, fragment) => text.replaceAll(fragment, ''), withoutHtmlTags);
    const matches = redacted.match(/[A-Za-z][A-Za-z0-9@_./-]*/g) ?? [];
    return matches.map((match) => `${match} <<< ${part}`);
  });
  expect(unexpected).toEqual([]);
}

function makeTicketEvent(overrides: Partial<SenaTicketEvent> = {}): SenaTicketEvent {
  return {
    ticketId: 'ticket:customer:open',
    ticketFamily: 'customer',
    lifecycle: 'open',
    stage: 'pending',
    revision: 1,
    eventType: 'created',
    occurredAt: '2026-04-21T00:00:00.000Z',
    nextTouchAt: null,
    party: {
      role: 'customer',
      channelKey: 'telegram',
      channelLabel: 'Telegram',
      customerName: 'Sokha',
      customerNameKey: 'sokha',
      phone: null,
      phoneKey: null,
      supplierName: null,
    },
    lines: [
      {
        entityType: 'sku',
        entityId: 'sku-1',
        quantityDelta: 1,
        note: null,
      },
    ],
    note: null,
    ...overrides,
  };
}

async function createQuotedAutomationIntake(userDataPath: string, chatId: number) {
  await patchAutomationExposureRow(userDataPath, context as never, {
    entityId: 'sku-1',
    entityType: 'sku',
    exposed: true,
  });
  await completePreferencesOnboarding(userDataPath, {
    chatId,
    firstName: 'Sokha',
  });
  await ingestAutomationTelegramUpdates(userDataPath, {
    context: context as never,
    currency: 'USD',
    updates: [
      {
        update_id: chatId * 10 + 4,
        message: {
          message_id: chatId * 10 + 4,
          date: 1_745_193_600,
          text: '2 cotton scarf',
          chat: {
            id: chatId,
            type: 'private',
          },
          from: {
            id: chatId,
            first_name: 'Sokha',
          },
        },
      },
    ],
  });

  const workspace = await readAutomationWorkspace(userDataPath, context as never);
  return workspace.intakes[0]!;
}

async function createWizardCheckoutAutomationIntake(userDataPath: string, chatId: number) {
  await patchAutomationExposureRow(userDataPath, context as never, {
    entityId: 'sku-1',
    entityType: 'sku',
    exposed: true,
  });
  await completePreferencesOnboarding(userDataPath, {
    chatId,
    firstName: 'Sela',
  });
  await ingestAutomationTelegramUpdates(userDataPath, {
    context: context as never,
    currency: 'USD',
    updates: [
      {
        update_id: chatId * 10 + 4,
        message: {
          message_id: chatId * 10 + 4,
          date: 1_745_193_620,
          text: '/start',
          chat: { id: chatId, type: 'private' },
          from: { id: chatId, first_name: 'Sela' },
        },
      },
      {
        update_id: chatId * 10 + 5,
        callback_query: {
          id: `callback-add-${chatId}`,
          data: 'w:add:sku:sku-1',
          from: { id: chatId, first_name: 'Sela' },
          message: { message_id: chatId * 10 + 50, date: 1_745_193_621, chat: { id: chatId, type: 'private' } },
        },
      },
      {
        update_id: chatId * 10 + 6,
        callback_query: {
          id: `callback-checkout-${chatId}`,
          data: 'w:checkout',
          from: { id: chatId, first_name: 'Sela' },
          message: { message_id: chatId * 10 + 50, date: 1_745_193_622, chat: { id: chatId, type: 'private' } },
        },
      },
      {
        update_id: chatId * 10 + 7,
        message: {
          message_id: chatId * 10 + 7,
          date: 1_745_193_623,
          text: 'Skip phone',
          chat: { id: chatId, type: 'private' },
          from: { id: chatId, first_name: 'Sela' },
        },
      },
      {
        update_id: chatId * 10 + 8,
        message: {
          message_id: chatId * 10 + 8,
          date: 1_745_193_624,
          text: 'Skip location',
          chat: { id: chatId, type: 'private' },
          from: { id: chatId, first_name: 'Sela' },
        },
      },
      {
        update_id: chatId * 10 + 9,
        message: {
          message_id: chatId * 10 + 9,
          date: 1_745_193_625,
          text: 'Skip notes',
          chat: { id: chatId, type: 'private' },
          from: { id: chatId, first_name: 'Sela' },
        },
      },
    ],
  });

  const workspace = await readAutomationWorkspace(userDataPath, context as never);
  return workspace.intakes[0]!;
}

describe('automation telegram ingestion', () => {
  it('exposes sellables by default before the operator writes exposure rules', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    const workspace = await readAutomationWorkspace(userDataPath, context as never);

    expect(workspace.exposures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityType: 'sku',
        entityId: 'sku-1',
        exposed: true,
      }),
    ]));
    expect(workspace.metrics.exposedSellables).toBe(1);
  });

  it('keeps explicit hidden exposure rules hidden', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: false,
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);

    expect(workspace.exposures.find((row) => row.entityId === 'sku-1')?.exposed).toBe(false);
    expect(workspace.metrics.exposedSellables).toBe(0);
  });

  it('creates quoted intake and reply jobs for matched exposed telegram items', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_111,
      firstName: 'Sokha',
    });

    const result = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 100,
          message: {
            message_id: 200,
            date: 1_745_193_600,
            text: '2 cotton scarf',
            chat: {
              id: 555_111,
              type: 'private',
            },
            from: {
              id: 555_111,
              first_name: 'Sokha',
              username: 'sokha_customer',
            },
          },
        },
      ],
    });

    expect(result.replyJobs).toHaveLength(1);
    expect(result.replyJobs[0]?.text).toContain('Quoted total:</b> USD 25.00');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.conversations).toHaveLength(1);
    expect(workspace.intakes).toHaveLength(1);
    expect(workspace.intakes[0]?.status).toBe('quoted');
    expect(workspace.intakes[0]?.quotedTotal).toBe(25);
    expect(workspace.intakes[0]?.customerHandle).toBe('@sokha_customer');

    const conversation = await readAutomationConversation(userDataPath, workspace.conversations[0]!.conversationId);
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages.at(-1)?.rawText).toBe('2 cotton scarf');
    const thread = await readAutomationIntakeThread(userDataPath, workspace.intakes[0]!.intakeId);
    expect(thread.messages.some((message) => message.rawText === '2 cotton scarf')).toBe(true);
    expect(thread.messages.every((message) => message.intakeId === workspace.intakes[0]!.intakeId)).toBe(true);
  });

  it('routes extra free-text messages in one Telegram chat to the active intake thread', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const firstIntake = await createQuotedAutomationIntake(userDataPath, 555_112);

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 555_112 * 10 + 5,
          message: {
            message_id: 555_112 * 10 + 5,
            date: 1_745_193_700,
            text: '1 cotton scarf',
            chat: {
              id: 555_112,
              type: 'private',
            },
            from: {
              id: 555_112,
              first_name: 'Sokha',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.conversations).toHaveLength(1);
    expect(workspace.intakes).toHaveLength(1);
    expect(workspace.intakes[0]).toMatchObject({
      intakeId: firstIntake.intakeId,
      status: 'needs_review',
      parseConfidence: 'low',
    });
    expect(workspace.intakes[0]?.notes).toContain('Customer follow-up: 1 cotton scarf');
    const firstThread = await readAutomationIntakeThread(userDataPath, firstIntake.intakeId);

    expect(firstThread.messages.map((message) => message.rawText)).toContain('2 cotton scarf');
    expect(firstThread.messages.map((message) => message.rawText)).toContain('1 cotton scarf');
    expect(firstThread.messages.every((message) => message.intakeId === firstIntake.intakeId)).toBe(true);
  });

  it('routes extra customer chat after wizard checkout to that active order for review', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createWizardCheckoutAutomationIntake(userDataPath, 555_114);

    const result = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 555_114 * 10 + 10,
          message: {
            message_id: 555_114 * 10 + 10,
            date: 1_745_193_700,
            text: 'Can you confirm my phone and location?',
            chat: {
              id: 555_114,
              type: 'private',
            },
            from: {
              id: 555_114,
              first_name: 'Sela',
            },
          },
        },
      ],
    });

    expect(result.replyJobs).toHaveLength(0);
    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes).toHaveLength(1);
    expect(workspace.intakes[0]).toMatchObject({
      intakeId: intake.intakeId,
      status: 'needs_review',
      parseConfidence: 'low',
    });
    expect(workspace.intakes[0]?.notes).toContain('Customer follow-up: Can you confirm my phone and location?');
    expect(workspace.conversations[0]?.latestIntakeStatus).toBe('needs_review');
    const thread = await readAutomationIntakeThread(userDataPath, intake.intakeId);
    expect(thread.messages.map((message) => message.rawText)).toContain('Can you confirm my phone and location?');
  });

  it('creates a separate intake for a new message after the latest Telegram intake is terminal', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const firstIntake = await createQuotedAutomationIntake(userDataPath, 555_113);
    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: firstIntake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    });
    await finalizeAutomationPromotion(userDataPath, prepared.updatedIntake);

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 555_113 * 10 + 5,
          message: {
            message_id: 555_113 * 10 + 5,
            date: 1_745_193_700,
            text: '1 cotton scarf',
            chat: {
              id: 555_113,
              type: 'private',
            },
            from: {
              id: 555_113,
              first_name: 'Sokha',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.conversations).toHaveLength(1);
    expect(workspace.intakes).toHaveLength(2);
    const secondIntake = workspace.intakes.find((intake) => intake.intakeId !== firstIntake.intakeId)!;
    const firstThread = await readAutomationIntakeThread(userDataPath, firstIntake.intakeId);
    const secondThread = await readAutomationIntakeThread(userDataPath, secondIntake.intakeId);

    expect(firstThread.messages.map((message) => message.rawText)).toContain('2 cotton scarf');
    expect(firstThread.messages.map((message) => message.rawText)).not.toContain('1 cotton scarf');
    expect(secondThread.messages.map((message) => message.rawText)).toContain('1 cotton scarf');
    expect(secondThread.messages.map((message) => message.rawText)).not.toContain('2 cotton scarf');
  });

  it('creates needs-review intake when telegram text does not resolve to an exposed sellable', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_222,
      firstName: 'Nary',
    });

    const result = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 101,
          message: {
            message_id: 201,
            date: 1_745_193_601,
            text: 'need 3 winter gloves',
            chat: {
              id: 555_222,
              type: 'private',
            },
            from: {
              id: 555_222,
              first_name: 'Nary',
            },
          },
        },
      ],
    });

    expect(result.replyJobs).toHaveLength(1);
    expect(result.replyJobs[0]?.text).toContain('Needs review');
    expect(result.replyJobs[0]?.text).toContain('Kaur Khor needs an operator to review it');
    expect(result.replyJobs[0]?.text).toContain('Please wait while Kaur Khor reviews it.');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes[0]?.status).toBe('needs_review');
    expect(workspace.intakes[0]?.lines[0]?.ambiguityReason).toBe('item_not_found');
  });

  it('keeps exposed items with unknown stock distinct from missing items', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const unknownStockContext = {
      ...context,
      recordUpdateContext: {
        ...context.recordUpdateContext,
        latestStockBySku: {},
      },
    };

    await patchAutomationExposureRow(userDataPath, unknownStockContext as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_223,
      firstName: 'Nary',
    });

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: unknownStockContext as never,
      currency: 'USD',
      updates: [
        {
          update_id: 102,
          message: {
            message_id: 202,
            date: 1_745_193_602,
            text: '2 cotton scarf',
            chat: {
              id: 555_223,
              type: 'private',
            },
            from: {
              id: 555_223,
              first_name: 'Nary',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, unknownStockContext as never);
    expect(workspace.intakes[0]?.status).toBe('needs_review');
    expect(workspace.intakes[0]?.lines[0]?.entityId).toBe('sku-1');
    expect(workspace.intakes[0]?.lines[0]?.ambiguityReason).toBe('availability_unknown');
  });

  it('counts ticketed and completed metrics from updatedAt day boundaries', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    await writeFile(join(userDataPath, 'desktop-automation-store.json'), JSON.stringify({
      version: 1,
      telegramUpdateCursor: null,
      connection: {
        channel: 'telegram',
        status: 'disconnected',
        hasBotToken: false,
        botDisplayName: null,
        botUsername: null,
        externalLink: null,
        connectedAt: null,
        pausedAt: null,
        lastWebhookAt: null,
        lastErrorAt: null,
        lastErrorMessage: null,
      },
      exposureRules: [],
      conversations: [],
      messages: [],
      customerPreferences: [],
      wizardSessions: [],
      intakes: [
        {
          intakeId: 'ticketed-today',
          conversationId: 'conv-1',
          channel: 'telegram',
          status: 'ticketed',
          parseConfidence: 'high',
          customerDisplayName: null,
          customerHandle: null,
          phone: null,
          notes: null,
          quotedSubtotal: null,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: null,
          createdAt: yesterday.toISOString(),
          updatedAt: today.toISOString(),
          promotedTicketId: 'ticket-1',
          lines: [],
        },
        {
          intakeId: 'completed-today',
          conversationId: 'conv-2',
          channel: 'telegram',
          status: 'completed',
          parseConfidence: 'high',
          customerDisplayName: null,
          customerHandle: null,
          phone: null,
          notes: null,
          quotedSubtotal: null,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: null,
          createdAt: yesterday.toISOString(),
          updatedAt: today.toISOString(),
          promotedTicketId: 'ticket-2',
          lines: [],
        },
        {
          intakeId: 'ticketed-yesterday',
          conversationId: 'conv-3',
          channel: 'telegram',
          status: 'ticketed',
          parseConfidence: 'high',
          customerDisplayName: null,
          customerHandle: null,
          phone: null,
          notes: null,
          quotedSubtotal: null,
          currencyCode: 'USD',
          deliveryFee: null,
          quotedTotal: null,
          createdAt: yesterday.toISOString(),
          updatedAt: yesterday.toISOString(),
          promotedTicketId: 'ticket-3',
          lines: [],
        },
      ],
    }), 'utf8');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);

    expect(workspace.metrics.ticketedToday).toBe(1);
    expect(workspace.metrics.completedToday).toBe(1);
  });

  it('does not reset a corrupt automation store during a later mutation', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const storePath = join(userDataPath, 'desktop-automation-store.json');
    const corruptPayload = '{ "version": 1, "intakes": [';
    await writeFile(storePath, corruptPayload, 'utf8');

    await expect(patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    })).rejects.toThrow();

    await expect(readFile(storePath, 'utf8')).resolves.toBe(corruptPayload);
  });

  it('rejects malformed automation connection patches before persisting state', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await expect(saveAutomationConnection(userDataPath, {
      channel: 'telegram',
      status: 'sleeping',
    } as never)).rejects.toThrow('Automation connection status is invalid.');

    const transport = await readAutomationTransportState(userDataPath);
    expect(transport.connection.status).toBe('disconnected');
  });

  it('rejects malformed automation exposure patches before persisting rules', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await expect(patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      sortOrder: Number.NaN,
    } as never)).rejects.toThrow('Automation exposure sort order must be a finite number or null.');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.exposures.find((row) => row.entityId === 'sku-1')?.sortOrder).toBe(0);
  });

  it('creates and updates a customer wizard session through commands and callbacks', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_333,
      firstName: 'Dara',
    });

    const cancelResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 102,
          message: {
            message_id: 202,
            date: 1_745_193_602,
            text: '/start',
            chat: {
              id: 555_333,
              type: 'private',
            },
            from: {
              id: 555_333,
              first_name: 'Dara',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    const session = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(session?.currentStep).toBe('menu');

    const addResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 103,
          callback_query: {
            id: 'callback-1',
            data: 'w:add:sku:sku-1',
            from: {
              id: 555_333,
              first_name: 'Dara',
            },
            message: {
              message_id: 999,
              date: 1_745_193_603,
              chat: {
                id: 555_333,
                type: 'private',
              },
              text: 'wizard',
            },
          },
        },
      ],
    });

    expect(addResult.outboundJobs.some((job) => job.kind === 'answer_callback')).toBe(true);
    const updatedSession = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(updatedSession?.currentStep).toBe('cart');
    expect(updatedSession?.draftLines[0]?.quantity).toBe(1);

    const checkoutResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 104,
          callback_query: {
            id: 'callback-2',
            data: 'w:cancel',
            from: {
              id: 555_333,
              first_name: 'Dara',
            },
            message: {
              message_id: 999,
              date: 1_745_193_604,
              chat: {
                id: 555_333,
                type: 'private',
              },
              text: 'wizard',
            },
          },
        },
      ],
    });
    expect(cancelResult.replyJobs.length).toBeGreaterThan(0);

    const canceledSession = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(canceledSession?.currentStep).toBe('menu');
    expect(canceledSession?.draftLines).toHaveLength(0);
  });

  it('sends an item photo when a customer opens an item and deletes it when leaving the item view', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_334,
      firstName: 'Dara',
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    await recordAutomationWizardMessage(userDataPath, {
      conversationId,
      messageId: 999,
    });

    const openItemResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1031,
          callback_query: {
            id: 'callback-item-open',
            data: 'w:item:sku:sku-1',
            from: {
              id: 555_334,
              first_name: 'Dara',
            },
            message: {
              message_id: 999,
              date: 1_745_193_603,
              chat: {
                id: 555_334,
                type: 'private',
              },
              text: 'wizard',
            },
          },
        },
      ],
    });

    expect(openItemResult.outboundJobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'send_photo',
        conversationId,
        photoPath: '/tmp/cotton-scarf.png',
      }),
      expect.objectContaining({
        kind: 'delete_message',
        conversationId,
        messageId: 999,
        nonFatal: true,
      }),
      expect.objectContaining({
        kind: 'send',
        conversationId,
        storesWizardMessage: true,
      }),
    ]));
    expect(openItemResult.outboundJobs.findIndex((job) => job.kind === 'send_photo')).toBeLessThan(
      openItemResult.outboundJobs.findIndex((job) => job.kind === 'send' && job.storesWizardMessage),
    );
    expectWizardRemainsLatest(openItemResult);

    const itemSession = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(itemSession?.currentStep).toBe('item');
    expect(itemSession?.selectedEntityId).toBe('sku-1');

    await recordAutomationWizardItemImageMessage(userDataPath, {
      conversationId,
      messageId: 1001,
      entityType: 'sku',
      entityId: 'sku-1',
    });

    const leaveItemResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1032,
          callback_query: {
            id: 'callback-item-exit',
            data: 'w:available:0',
            from: {
              id: 555_334,
              first_name: 'Dara',
            },
            message: {
              message_id: 999,
              date: 1_745_193_604,
              chat: {
                id: 555_334,
                type: 'private',
              },
              text: 'wizard',
            },
          },
        },
      ],
    });

    expect(leaveItemResult.outboundJobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'delete_message',
        conversationId,
        messageId: 1001,
      }),
      expect.objectContaining({
        kind: 'send',
        conversationId,
        storesWizardMessage: true,
      }),
    ]));
    expectWizardRemainsLatest(leaveItemResult);

    const catalogSession = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(catalogSession?.currentStep).toBe('catalog');
    expect(catalogSession?.lastItemImageMessageId).toBeNull();
  });

  it('omits availability labels from customer-facing catalog and item wizard messages', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_335,
      firstName: 'Dara',
    });

    const catalogResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1033,
          callback_query: {
            id: 'callback-open-catalog',
            data: 'w:available:0',
            from: {
              id: 555_335,
              first_name: 'Dara',
            },
            message: {
              message_id: 999,
              date: 1_745_193_605,
              chat: {
                id: 555_335,
                type: 'private',
              },
              text: 'wizard',
            },
          },
        },
      ],
    });

    const catalogJob = catalogResult.outboundJobs.find((job) => job.kind === 'send' && job.storesWizardMessage);
    const catalogText = catalogJob?.kind === 'send' ? catalogJob.text : '';
    expect(catalogText).not.toContain('Available');
    expect(catalogText).not.toContain('Unavailable');

    const itemResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1034,
          callback_query: {
            id: 'callback-open-item-copy',
            data: 'w:item:sku:sku-1',
            from: {
              id: 555_335,
              first_name: 'Dara',
            },
            message: {
              message_id: 1000,
              date: 1_745_193_606,
              chat: {
                id: 555_335,
                type: 'private',
              },
              text: 'wizard',
            },
          },
        },
      ],
    });

    const itemJob = itemResult.outboundJobs.find((job) => job.kind === 'send' && job.storesWizardMessage);
    const itemText = itemJob?.kind === 'send' ? itemJob.text : '';
    expect(itemText).not.toContain('Available');
    expect(itemText).not.toContain('Unavailable');
    const itemPhotoCaption = itemResult.outboundJobs.find((job) => job.kind === 'send_photo')?.caption ?? '';
    expect(itemPhotoCaption).not.toContain('Available');
    expect(itemPhotoCaption).not.toContain('Unavailable');
  });

  it('runs first-contact onboarding and uses the selected display currency in wizard replies', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });

    const onboardingResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1020,
          message: {
            message_id: 2020,
            date: 1_745_193_620,
            text: '/start',
            chat: {
              id: 555_339,
              type: 'private',
            },
            from: {
              id: 555_339,
              first_name: 'Pov',
            },
          },
        },
      ],
    });

    expect(onboardingResult.replyJobs[0]?.text).toContain('Choose your language');

    const languageResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1021,
          callback_query: {
            id: 'callback-language-km',
            data: 'w:language:km',
            from: {
              id: 555_339,
              first_name: 'Pov',
            },
            message: {
              message_id: 3001,
              date: 1_745_193_621,
              chat: {
                id: 555_339,
                type: 'private',
              },
            },
          },
        },
      ],
    });

    expect(languageResult.replyJobs.some((job) => job.text.includes('ជ្រើសរើសរូបិយប័ណ្ណ'))).toBe(true);

    const currencyResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1022,
          callback_query: {
            id: 'callback-currency-khr',
            data: 'w:currency:KHR',
            from: {
              id: 555_339,
              first_name: 'Pov',
            },
            message: {
              message_id: 3002,
              date: 1_745_193_622,
              chat: {
                id: 555_339,
                type: 'private',
              },
            },
          },
        },
      ],
    });

    expect(currencyResult.replyJobs.some((job) => job.text.includes('បានរក្សាទុកចំណូលចិត្ត'))).toBe(true);

    const catalogResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1023,
          message: {
            message_id: 2023,
            date: 1_745_193_623,
            text: '/available',
            chat: {
              id: 555_339,
              type: 'private',
            },
            from: {
              id: 555_339,
              first_name: 'Pov',
            },
          },
        },
      ],
    });

    expect(catalogResult.replyJobs[0]?.text).toContain('KHR 50000');
  });

  it('renders representative Khmer Telegram wizard messages without unintended Latin UI copy', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-km-'));
    const renderedParts: string[] = [];
    const collect = (result: Awaited<ReturnType<typeof ingestAutomationTelegramUpdates>>) => {
      renderedParts.push(...telegramRenderedParts(result));
    };
    const khmerRenderedParts: string[] = [];
    const collectKhmer = (result: Awaited<ReturnType<typeof ingestAutomationTelegramUpdates>>) => {
      const parts = telegramRenderedParts(result);
      renderedParts.push(...parts);
      khmerRenderedParts.push(...parts);
    };

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });

    collect(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3020,
          message: {
            message_id: 4020,
            date: 1_745_193_720,
            text: '/start',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3021,
          callback_query: {
            id: 'callback-km-language',
            data: 'w:language:km',
            from: { id: 555_739, first_name: 'Pov' },
            message: {
              message_id: 4021,
              date: 1_745_193_721,
              chat: { id: 555_739, type: 'private' },
            },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3022,
          callback_query: {
            id: 'callback-km-currency',
            data: 'w:currency:KHR',
            from: { id: 555_739, first_name: 'Pov' },
            message: {
              message_id: 4022,
              date: 1_745_193_722,
              chat: { id: 555_739, type: 'private' },
            },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3023,
          message: {
            message_id: 4023,
            date: 1_745_193_723,
            text: '/help',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3024,
          message: {
            message_id: 4024,
            date: 1_745_193_724,
            text: '/available',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3025,
          callback_query: {
            id: 'callback-km-item',
            data: 'w:item:sku:sku-1',
            from: { id: 555_739, first_name: 'Pov' },
            message: {
              message_id: 4025,
              date: 1_745_193_725,
              chat: { id: 555_739, type: 'private' },
            },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3026,
          callback_query: {
            id: 'callback-km-add',
            data: 'w:add:sku:sku-1',
            from: { id: 555_739, first_name: 'Pov' },
            message: {
              message_id: 4026,
              date: 1_745_193_726,
              chat: { id: 555_739, type: 'private' },
            },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3027,
          callback_query: {
            id: 'callback-km-cart',
            data: 'w:cart',
            from: { id: 555_739, first_name: 'Pov' },
            message: {
              message_id: 4027,
              date: 1_745_193_727,
              chat: { id: 555_739, type: 'private' },
            },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3028,
          callback_query: {
            id: 'callback-km-checkout',
            data: 'w:checkout',
            from: { id: 555_739, first_name: 'Pov' },
            message: {
              message_id: 4028,
              date: 1_745_193_728,
              chat: { id: 555_739, type: 'private' },
            },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3029,
          message: {
            message_id: 4029,
            date: 1_745_193_729,
            text: 'រំលងលេខទូរស័ព្ទ',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3030,
          message: {
            message_id: 4030,
            date: 1_745_193_730,
            text: 'រំលងទីតាំង',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    }));

    collectKhmer(await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3031,
          message: {
            message_id: 4031,
            date: 1_745_193_731,
            text: 'រំលងកំណត់ចំណាំ',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    }));

    const postCheckoutFollowup = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3032,
          message: {
            message_id: 4032,
            date: 1_745_193_732,
            text: 'need 3 winter gloves',
            chat: { id: 555_739, type: 'private' },
            from: { id: 555_739, first_name: 'Pov' },
          },
        },
      ],
    });
    expect(postCheckoutFollowup.replyJobs).toHaveLength(0);

    expect(renderedParts.join('\n')).toContain('<b>ជ្រើសរើសភាសា</b>');
    expect(khmerRenderedParts.join('\n')).toContain('<b>កាតាឡុក</b>');
    expect(khmerRenderedParts.join('\n')).toContain('<b>កន្ត្រករបស់អ្នក</b>');
    expect(khmerRenderedParts.join('\n')).toContain('<b>បង្កាន់ដៃ</b>');
    expectNoUnexpectedKhmerLatin(khmerRenderedParts);
  });

  it('reopens customer preferences with the /preferences command after setup', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1024,
          message: {
            message_id: 2024,
            date: 1_745_193_624,
            text: '/start',
            chat: {
              id: 555_338,
              type: 'private',
            },
            from: {
              id: 555_338,
              first_name: 'Rath',
            },
          },
        },
        {
          update_id: 1025,
          callback_query: {
            id: 'callback-language-en',
            data: 'w:language:en',
            from: {
              id: 555_338,
              first_name: 'Rath',
            },
            message: {
              message_id: 3003,
              date: 1_745_193_625,
              chat: {
                id: 555_338,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 1026,
          callback_query: {
            id: 'callback-currency-usd',
            data: 'w:currency:USD',
            from: {
              id: 555_338,
              first_name: 'Rath',
            },
            message: {
              message_id: 3004,
              date: 1_745_193_626,
              chat: {
                id: 555_338,
                type: 'private',
              },
            },
          },
        },
      ],
    });

    const preferencesResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1027,
          message: {
            message_id: 2027,
            date: 1_745_193_627,
            text: '/preferences',
            chat: {
              id: 555_338,
              type: 'private',
            },
            from: {
              id: 555_338,
              first_name: 'Rath',
            },
          },
        },
      ],
    });

    expect(preferencesResult.replyJobs[0]?.text).toContain('Choose your language');
  });

  it('recognizes Telegram bot commands when they include the bot username suffix', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_340,
      firstName: 'Pich',
    });

    const result = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1040,
          message: {
            message_id: 2040,
            date: 1_745_193_640,
            text: '/start@kanha_sales_assistant hello',
            entities: [
              {
                type: 'bot_command',
                offset: 0,
                length: '/start@kanha_sales_assistant'.length,
              },
            ],
            chat: {
              id: 555_340,
              type: 'private',
            },
            from: {
              id: 555_340,
              first_name: 'Pich',
            },
          },
        },
      ],
    });

    expect(result.replyJobs).toHaveLength(1);
    expect(result.replyJobs[0]?.text).toContain('Welcome to');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    const session = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(session?.currentStep).toBe('menu');
  });

  it('sends a fresh wizard message for typed commands when an older wizard already exists', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_341,
      firstName: 'Kiri',
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    await recordAutomationWizardMessage(userDataPath, {
      conversationId,
      messageId: 77,
    });
    expect((await readAutomationWizardSessionForConversation(userDataPath, conversationId))?.lastWizardMessageId).toBe(77);

    const secondResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1042,
          message: {
            message_id: 2042,
            date: 1_745_193_642,
            text: '/start',
            chat: {
              id: 555_341,
              type: 'private',
            },
            from: {
              id: 555_341,
              first_name: 'Kiri',
            },
          },
        },
      ],
    });

    expectFreshWizardSendDeletesPreviousWizard(secondResult, 77);
  });

  it('sends a fresh wizard message when Start order is clicked from an older wizard', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_342,
      firstName: 'Lina',
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    await recordAutomationWizardMessage(userDataPath, {
      conversationId,
      messageId: 88,
    });

    const secondResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1044,
          callback_query: {
            id: 'callback-older-order',
            data: 'w:order',
            from: {
              id: 555_342,
              first_name: 'Lina',
            },
            message: {
              message_id: 88,
              date: 1_745_193_644,
              chat: {
                id: 555_342,
                type: 'private',
              },
              text: 'old wizard',
            },
          },
        },
      ],
    });

    expectFreshWizardSendDeletesPreviousWizard(secondResult, 88);
  });

  it('requires every fresh wizard send to delete the older wizard first', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_343,
      firstName: 'Mina',
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    const cases: Array<{
      label: string;
      messageId: number;
      update: Parameters<typeof ingestAutomationTelegramUpdates>[1]['updates'][number];
    }> = [
      {
        label: '/start',
        messageId: 91,
        update: {
          update_id: 1045,
          message: {
            message_id: 2045,
            date: 1_745_193_645,
            text: '/start',
            chat: { id: 555_343, type: 'private' },
            from: { id: 555_343, first_name: 'Mina' },
          },
        },
      },
      {
        label: '/preferences',
        messageId: 92,
        update: {
          update_id: 1046,
          message: {
            message_id: 2046,
            date: 1_745_193_646,
            text: '/preferences',
            chat: { id: 555_343, type: 'private' },
            from: { id: 555_343, first_name: 'Mina' },
          },
        },
      },
      {
        label: 'preferences button',
        messageId: 93,
        update: {
          update_id: 1047,
          callback_query: {
            id: 'callback-preferences-global',
            data: 'w:preferences',
            from: { id: 555_343, first_name: 'Mina' },
            message: {
              message_id: 93,
              date: 1_745_193_647,
              chat: { id: 555_343, type: 'private' },
            },
          },
        },
      },
      {
        label: 'language button',
        messageId: 94,
        update: {
          update_id: 1048,
          callback_query: {
            id: 'callback-language-global',
            data: 'w:language:en',
            from: { id: 555_343, first_name: 'Mina' },
            message: {
              message_id: 94,
              date: 1_745_193_648,
              chat: { id: 555_343, type: 'private' },
            },
          },
        },
      },
      {
        label: 'currency button',
        messageId: 95,
        update: {
          update_id: 1049,
          callback_query: {
            id: 'callback-currency-global',
            data: 'w:currency:USD',
            from: { id: 555_343, first_name: 'Mina' },
            message: {
              message_id: 95,
              date: 1_745_193_649,
              chat: { id: 555_343, type: 'private' },
            },
          },
        },
      },
      {
        label: 'order button',
        messageId: 96,
        update: {
          update_id: 1050,
          callback_query: {
            id: 'callback-order-global',
            data: 'w:order',
            from: { id: 555_343, first_name: 'Mina' },
            message: {
              message_id: 96,
              date: 1_745_193_650,
              chat: { id: 555_343, type: 'private' },
            },
          },
        },
      },
    ];

    for (const testCase of cases) {
      await recordAutomationWizardMessage(userDataPath, {
        conversationId,
        messageId: testCase.messageId,
      });
      const result = await ingestAutomationTelegramUpdates(userDataPath, {
        context: context as never,
        currency: 'USD',
        updates: [testCase.update],
      });
      try {
        expectFreshWizardSendDeletesPreviousWizard(result, testCase.messageId);
        expectWizardRemainsLatest(result);
      } catch (error) {
        throw new Error(`${testCase.label} did not delete the previous wizard: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  it('keeps the active wizard as the last outbound message even when item media is included', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_344,
      firstName: 'Rina',
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    await recordAutomationWizardMessage(userDataPath, {
      conversationId,
      messageId: 97,
    });

    const result = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1051,
          callback_query: {
            id: 'callback-item-bottommost',
            data: 'w:item:sku:sku-1',
            from: { id: 555_344, first_name: 'Rina' },
            message: {
              message_id: 97,
              date: 1_745_193_651,
              chat: { id: 555_344, type: 'private' },
            },
          },
        },
      ],
    });

    expectFreshWizardSendDeletesPreviousWizard(result, 97);
    expect(result.outboundJobs.findIndex((job) => job.kind === 'send_photo')).toBeLessThan(
      result.outboundJobs.findIndex((job) => job.kind === 'send' && job.storesWizardMessage),
    );
    expectWizardRemainsLatest(result);
  });

  it('keeps fresh wizard sends centralized behind cleanup-aware helpers', async () => {
    const source = await readFile(AUTOMATION_STORE_SOURCE_PATH, 'utf8');
    const directWizardSendFunctions = [...source.matchAll(/storesWizardMessage:\s*true/g)]
      .map((match) => {
        const before = source.slice(0, match.index);
        return [...before.matchAll(/function\s+(\w+)\s*\(/g)].at(-1)?.[1] ?? 'unknown';
      });

    expect(directWizardSendFunctions).toEqual([
      'queueGeneratedWizardSend',
    ]);
  });

  it('keeps automation promotion recovery on a critical SENA observation read', async () => {
    const source = await readFile(MAIN_INDEX_SOURCE_PATH, 'utf8');
    const promoteHandlerStart = source.indexOf('IPC_CHANNELS.automationPromoteIntake');
    const promoteHandlerEnd = source.indexOf('IPC_CHANNELS.automationTestTelegramConnection', promoteHandlerStart);
    const promoteHandlerSource = source.slice(promoteHandlerStart, promoteHandlerEnd);

    expect(promoteHandlerSource).toContain('listFreshSenaObservations()');
    expect(source).toContain("readPriority: 'critical'");
  });

  it('submits a cart checkout after optional phone capture and keeps free-text fallback working', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_444,
      firstName: 'Maly',
    });

    const checkoutResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 105,
          message: {
            message_id: 205,
            date: 1_745_193_605,
            text: '/start',
            chat: {
              id: 555_444,
              type: 'private',
            },
            from: {
              id: 555_444,
              first_name: 'Maly',
            },
          },
        },
        {
          update_id: 106,
          callback_query: {
            id: 'callback-3',
            data: 'w:add:sku:sku-1',
            from: {
              id: 555_444,
              first_name: 'Maly',
            },
            message: {
              message_id: 1001,
              date: 1_745_193_606,
              chat: {
                id: 555_444,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 107,
          callback_query: {
            id: 'callback-4',
            data: 'w:checkout',
            from: {
              id: 555_444,
              first_name: 'Maly',
            },
            message: {
              message_id: 1001,
              date: 1_745_193_607,
              chat: {
                id: 555_444,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 108,
          message: {
            message_id: 208,
            date: 1_745_193_608,
            text: 'Skip phone',
            chat: {
              id: 555_444,
              type: 'private',
            },
            from: {
              id: 555_444,
              first_name: 'Maly',
            },
          },
        },
        {
          update_id: 109,
          message: {
            message_id: 209,
            date: 1_745_193_609,
            text: 'https://maps.google.com/?q=11.5564,104.9282',
            chat: {
              id: 555_444,
              type: 'private',
            },
            from: {
              id: 555_444,
              first_name: 'Maly',
            },
          },
        },
        {
          update_id: 111,
          message: {
            message_id: 211,
            date: 1_745_193_611,
            text: 'Please deliver after 6 PM',
            chat: {
              id: 555_444,
              type: 'private',
            },
            from: {
              id: 555_444,
              first_name: 'Maly',
            },
          },
        },
      ],
    });

    expect(checkoutResult.replyJobs.some((job) => job.text.includes('<b>Checkout</b>'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('Google Maps link like <code>https://maps.google.com/?q=11.5564,104.9282</code>'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('Send any notes you want to give'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('<b>Ready to confirm</b>'))).toBe(false);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('<b>Receipt</b>'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('<b>Total:</b> USD 12.50'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('Delivery location: https://maps.google.com/?q=11.5564,104.9282'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('Customer note: Please deliver after 6 PM'))).toBe(true);

    let workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes[0]?.status).toBe('quoted');
    expect(workspace.intakes[0]?.quotedTotal).toBe(12.5);
    expect(workspace.intakes[0]?.notes).toContain('Delivery location: https://maps.google.com/?q=11.5564,104.9282');
    expect(workspace.intakes[0]?.notes).toContain('Customer note: Please deliver after 6 PM');

    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_555,
      firstName: 'Rina',
    });
    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 110,
          message: {
            message_id: 210,
            date: 1_745_193_610,
            text: '2 cotton scarf',
            chat: {
              id: 555_555,
              type: 'private',
            },
            from: {
              id: 555_555,
              first_name: 'Rina',
            },
          },
        },
      ],
    });
    workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes).toHaveLength(2);
    expect(workspace.intakes.some((entry) => entry.customerDisplayName === 'Rina' && entry.quotedTotal === 25)).toBe(true);
  });

  it('deletes generated checkout prompts before sending the lasting receipt', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_445,
      firstName: 'Maly',
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    const chat = { id: 555_445, type: 'private' as const };
    const from = { id: 555_445, first_name: 'Maly' };

    await recordAutomationWizardMessage(userDataPath, { conversationId, messageId: 301 });
    const addResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [{
        update_id: 220,
        callback_query: { id: 'callback-cleanup-add', data: 'w:add:sku:sku-1', from, message: { message_id: 301, date: 1_745_193_620, chat } },
      }],
    });
    expectFreshWizardSendDeletesPreviousWizard(addResult, 301);

    await recordAutomationWizardMessage(userDataPath, { conversationId, messageId: 302 });
    const checkoutResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [{
        update_id: 221,
        callback_query: { id: 'callback-cleanup-checkout', data: 'w:checkout', from, message: { message_id: 302, date: 1_745_193_621, chat } },
      }],
    });
    expectFreshWizardSendDeletesPreviousWizard(checkoutResult, 302);

    await recordAutomationWizardMessage(userDataPath, { conversationId, messageId: 303 });
    const locationResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [{
        update_id: 222,
        message: { message_id: 222, date: 1_745_193_622, text: 'Skip phone', chat, from },
      }],
    });
    expectFreshWizardSendDeletesPreviousWizard(locationResult, 303);

    await recordAutomationWizardMessage(userDataPath, { conversationId, messageId: 304 });
    const noteResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [{
        update_id: 223,
        message: { message_id: 223, date: 1_745_193_623, text: 'House 12, Street 310, BKK1, Phnom Penh', chat, from },
      }],
    });
    expectFreshWizardSendDeletesPreviousWizard(noteResult, 304);

    await recordAutomationWizardMessage(userDataPath, { conversationId, messageId: 305 });
    const receiptResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [{
        update_id: 224,
        message: { message_id: 224, date: 1_745_193_624, text: 'Please deliver after 6 PM', chat, from },
      }],
    });

    const receiptIndex = receiptResult.outboundJobs.findIndex((job) =>
      job.kind === 'send' && job.messageRole === 'receipt',
    );
    expect(receiptIndex).toBeGreaterThanOrEqual(0);
    expect(receiptResult.outboundJobs.slice(0, receiptIndex).some((job) =>
      job.kind === 'delete_message' && job.messageId === 305 && job.nonFatal === true,
    ), JSON.stringify(receiptResult.outboundJobs, null, 2)).toBe(true);
    const receiptJob = receiptResult.outboundJobs[receiptIndex];
    expect(receiptJob?.kind === 'send' ? receiptJob.storesWizardMessage : true).toBeFalsy();
    expect(receiptJob?.kind === 'send' ? receiptJob.text : '').toContain('<b>Receipt</b>');
    expect(receiptJob?.kind === 'send' ? receiptJob.text : '').toContain('Customer note: Please deliver after 6 PM');

    const finalSession = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(finalSession?.lastWizardMessageId).toBeNull();
    expect(finalSession?.generatedWizardMessageIds).toEqual([]);
  });

  it('normalizes shared Telegram contact phones before intake and promotion writes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_556,
      firstName: 'Sophea',
    });

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 117,
          message: {
            message_id: 217,
            date: 1_745_193_617,
            text: '/start',
            chat: {
              id: 555_556,
              type: 'private',
            },
            from: {
              id: 555_556,
              first_name: 'Sophea',
            },
          },
        },
        {
          update_id: 118,
          callback_query: {
            id: 'callback-phone-add',
            data: 'w:add:sku:sku-1',
            from: {
              id: 555_556,
              first_name: 'Sophea',
            },
            message: {
              message_id: 1008,
              date: 1_745_193_618,
              chat: {
                id: 555_556,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 119,
          callback_query: {
            id: 'callback-phone-checkout',
            data: 'w:checkout',
            from: {
              id: 555_556,
              first_name: 'Sophea',
            },
            message: {
              message_id: 1008,
              date: 1_745_193_619,
              chat: {
                id: 555_556,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 120,
          message: {
            message_id: 220,
            date: 1_745_193_620,
            contact: {
              first_name: 'Sophea',
              phone_number: '012345678',
            },
            chat: {
              id: 555_556,
              type: 'private',
            },
            from: {
              id: 555_556,
              first_name: 'Sophea',
            },
          },
        },
        {
          update_id: 121,
          message: {
            message_id: 221,
            date: 1_745_193_621,
            location: {
              latitude: 11.5564,
              longitude: 104.9282,
            },
            chat: {
              id: 555_556,
              type: 'private',
            },
            from: {
              id: 555_556,
              first_name: 'Sophea',
            },
          },
        },
        {
          update_id: 122,
          message: {
            message_id: 222,
            date: 1_745_193_622,
            text: 'Skip notes',
            chat: {
              id: 555_556,
              type: 'private',
            },
            from: {
              id: 555_556,
              first_name: 'Sophea',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.conversations[0]?.phone).toBe('+855 12345678');
    expect(workspace.intakes[0]?.phone).toBe('+855 12345678');
    expect(workspace.intakes[0]?.notes).toContain('Delivery location: https://maps.google.com/?q=11.5564,104.9282');

    const promotion = await prepareAutomationPromotion(userDataPath, {
      intakeId: workspace.intakes[0]!.intakeId,
      mode: 'create_ticket',
      customerIdentityOverride: {
        phone: '012345678',
      },
    }, {
      observations: context.observations as never,
    });

    expect(promotion.ticketEvent.party?.phone).toBe('+855 12345678');
    expect(promotion.ticketEvent.party?.phoneKey).toBe('+85512345678');
    await expect(findAutomationConversationForTelegramTicket(userDataPath, promotion.ticketEvent)).resolves.toMatchObject({
      phone: '+855 12345678',
    });
  });

  it('ignores stale confirm callbacks once checkout has already been submitted', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_666,
      firstName: 'Sela',
    });

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 120,
          message: {
            message_id: 220,
            date: 1_745_193_620,
            text: '/start',
            chat: {
              id: 555_666,
              type: 'private',
            },
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
          },
        },
        {
          update_id: 121,
          callback_query: {
            id: 'callback-6',
            data: 'w:add:sku:sku-1',
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
            message: {
              message_id: 1010,
              date: 1_745_193_621,
              chat: {
                id: 555_666,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 122,
          callback_query: {
            id: 'callback-7',
            data: 'w:checkout',
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
            message: {
              message_id: 1010,
              date: 1_745_193_622,
              chat: {
                id: 555_666,
                type: 'private',
              },
            },
          },
        },
        {
          update_id: 123,
          message: {
            message_id: 223,
            date: 1_745_193_623,
            text: 'Skip phone',
            chat: {
              id: 555_666,
              type: 'private',
            },
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
          },
        },
        {
          update_id: 124,
          message: {
            message_id: 224,
            date: 1_745_193_624,
            text: 'Skip location',
            chat: {
              id: 555_666,
              type: 'private',
            },
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
          },
        },
        {
          update_id: 125,
          message: {
            message_id: 225,
            date: 1_745_193_625,
            text: 'Skip notes',
            chat: {
              id: 555_666,
              type: 'private',
            },
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
          },
        },
      ],
    });

    const staleResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 126,
          callback_query: {
            id: 'callback-8',
            data: 'w:confirm',
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
            message: {
              message_id: 1011,
              date: 1_745_193_626,
              chat: {
                id: 555_666,
                type: 'private',
              },
            },
          },
        },
      ],
    });

    expect(staleResult.outboundJobs.some((job) => job.kind === 'answer_callback' && job.text === 'This order was already sent to Kaur Khor.')).toBe(true);

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes).toHaveLength(1);
  });

  it('finds the Telegram conversation for a promoted customer ticket update', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, {
      chatId: 555_777,
      firstName: 'Sokha',
    });

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 130,
          message: {
            message_id: 230,
            date: 1_745_193_630,
            text: '2 cotton scarf',
            chat: {
              id: 555_777,
              type: 'private',
            },
            from: {
              id: 555_777,
              first_name: 'Sokha',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const intake = workspace.intakes[0]!;
    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    });
    await finalizeAutomationPromotion(userDataPath, prepared.updatedIntake);

    const conversation = await findAutomationConversationForTelegramTicket(userDataPath, prepared.ticketEvent);
    expect(conversation?.conversationId).toBe(intake.conversationId);
  });

  it('rejects appending Telegram intake to a nonexistent ticket', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createQuotedAutomationIntake(userDataPath, 555_778);

    await expect(prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'append_ticket',
      ticketId: 'ticket:customer:missing',
    }, {
      observations: context.observations as never,
    })).rejects.toThrow('Appending Telegram intake requires an existing customer ticket.');
  });

  it('rejects duplicate promotion after an intake is already ticketed', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createQuotedAutomationIntake(userDataPath, 555_779);
    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    });
    const stalePrepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    });

    await finalizeAutomationPromotion(userDataPath, prepared.updatedIntake);

    await expect(prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    })).rejects.toThrow('already been promoted');
    await expect(finalizeAutomationPromotion(userDataPath, stalePrepared.updatedIntake))
      .rejects.toThrow('already been promoted');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes[0]).toMatchObject({
      intakeId: intake.intakeId,
      status: 'ticketed',
      promotedTicketId: prepared.ticketEvent.ticketId,
    });
  });

  it('recovers create-ticket promotion when SENA already contains the ticket event', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createQuotedAutomationIntake(userDataPath, 555_781);
    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    });

    const recovered = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: [{
        observationId: 'obs-existing-promotion',
        input: {
          ticketEvents: [prepared.ticketEvent],
        },
      }] as never,
    });

    expect(recovered.shouldIngestObservation).toBe(false);
    expect(recovered.ticketEvent.ticketId).toBe(prepared.ticketEvent.ticketId);
    expect(recovered.updatedIntake).toMatchObject({
      intakeId: intake.intakeId,
      status: 'ticketed',
      promotedTicketId: prepared.ticketEvent.ticketId,
    });
  });

  it('rejects appending Telegram intake to a supplier ticket', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createQuotedAutomationIntake(userDataPath, 555_779);
    const supplierTicket = makeTicketEvent({
      ticketId: 'ticket:supplier:open',
      ticketFamily: 'supplier',
      stage: 'to_order',
      party: {
        role: 'supplier',
        channelKey: null,
        channelLabel: null,
        customerName: null,
        customerNameKey: null,
        phone: null,
        phoneKey: null,
        supplierName: 'Mekong Looms',
      },
    });

    await expect(prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'append_ticket',
      ticketId: supplierTicket.ticketId,
    }, {
      observations: [{
        observationId: 'obs-supplier-ticket',
        input: {
          ticketEvents: [supplierTicket],
        },
      }] as never,
    })).rejects.toThrow('Appending Telegram intake requires an open customer ticket.');
  });

  it('accepts appending Telegram intake to a known open customer ticket', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createQuotedAutomationIntake(userDataPath, 555_780);
    const customerTicket = makeTicketEvent({
      ticketId: 'ticket:customer:known-open',
      revision: 3,
    });

    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'append_ticket',
      ticketId: customerTicket.ticketId,
    }, {
      observations: [{
        observationId: 'obs-customer-ticket',
        input: {
          ticketEvents: [customerTicket],
        },
      }] as never,
    });

    expect(prepared.ticketEvent.ticketId).toBe(customerTicket.ticketId);
    expect(prepared.ticketEvent.ticketFamily).toBe('customer');
    expect(prepared.ticketEvent.eventType).toBe('revised');
    expect(prepared.ticketEvent.revision).toBe(4);
    expect(prepared.ticketEvent.lines).toHaveLength(2);
    expect(prepared.ticketEvent.lines[0]).toMatchObject(customerTicket.lines[0]!);
    expect(prepared.ticketEvent.lines[1]).toMatchObject({
      entityType: 'sku',
      entityId: 'sku-1',
      quantityDelta: 2,
    });
    expect(prepared.updatedIntake.promotedTicketId).toBe(customerTicket.ticketId);
  });

  it('recovers append-ticket promotion when SENA already contains the revised event', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-store-'));
    const intake = await createQuotedAutomationIntake(userDataPath, 555_782);
    const customerTicket = makeTicketEvent({
      ticketId: 'ticket:customer:known-open',
      revision: 3,
    });
    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'append_ticket',
      ticketId: customerTicket.ticketId,
    }, {
      observations: [{
        observationId: 'obs-customer-ticket',
        input: {
          ticketEvents: [customerTicket],
        },
      }] as never,
    });

    const recovered = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'append_ticket',
      ticketId: customerTicket.ticketId,
    }, {
      observations: [{
        observationId: 'obs-existing-append',
        input: {
          ticketEvents: [customerTicket, prepared.ticketEvent],
        },
      }] as never,
    });

    expect(recovered.shouldIngestObservation).toBe(false);
    expect(recovered.ticketEvent.revision).toBe(prepared.ticketEvent.revision);
    expect(recovered.updatedIntake.promotedTicketId).toBe(customerTicket.ticketId);
  });

  it('filters unchanged and historical ticket events from Telegram notifications', () => {
    const previousEvent = makeTicketEvent({
      ticketId: 'ticket:customer:existing',
      revision: 2,
      eventType: 'revised',
      occurredAt: '2026-04-21T01:00:00.000Z',
      note: 'Previous note',
    });
    const rewrittenHistoricalEvent = {
      ...previousEvent,
      note: 'Operator corrected an old note',
    };
    const newCustomerEvent = makeTicketEvent({
      ticketId: 'ticket:customer:new',
      revision: 1,
      occurredAt: '2026-04-21T02:00:00.000Z',
    });
    const supplierEvent = makeTicketEvent({
      ticketId: 'ticket:supplier:new',
      ticketFamily: 'supplier',
      party: {
        role: 'supplier',
        channelKey: null,
        channelLabel: null,
        customerName: null,
        customerNameKey: null,
        phone: null,
        phoneKey: null,
        supplierName: 'Mekong Looms',
      },
    });

    expect(ticketEventsRequiringTelegramNotification([
      rewrittenHistoricalEvent,
      newCustomerEvent,
      supplierEvent,
    ], [previousEvent])).toEqual([newCustomerEvent]);
  });
});
