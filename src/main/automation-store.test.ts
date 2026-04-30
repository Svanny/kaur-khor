// @vitest-environment node

import { mkdtemp, readFile } from 'node:fs/promises';
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
  recordAutomationWizardItemImageMessage,
  recordAutomationWizardMessage,
  readAutomationWizardSessionForConversation,
  readAutomationWorkspace,
} from './automation-store';

const AUTOMATION_STORE_SOURCE_PATH = new URL('./automation-store.ts', import.meta.url);

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

function expectFreshWizardSendRetiresPreviousWizard(
  result: Awaited<ReturnType<typeof ingestAutomationTelegramUpdates>>,
  messageId: number,
) {
  const freshWizardIndex = result.outboundJobs.findIndex((job) =>
    job.kind === 'send' && job.storesWizardMessage,
  );
  expect(freshWizardIndex).toBeGreaterThanOrEqual(0);
 expect(result.outboundJobs.slice(0, freshWizardIndex).some((job) =>
    job.kind === 'edit_reply_markup' &&
    job.messageId === messageId &&
    job.replyMarkup?.inline_keyboard.length === 0,
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

describe('automation telegram ingestion', () => {
  it('creates quoted intake and reply jobs for matched exposed telegram items', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
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
  });

  it('creates needs-review intake when telegram text does not resolve to an exposed sellable', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
    expect(result.replyJobs[0]?.text).toContain('banji needs an operator to review it');
    expect(result.replyJobs[0]?.text).toContain('Please wait while banji reviews it.');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes[0]?.status).toBe('needs_review');
    expect(workspace.intakes[0]?.lines[0]?.ambiguityReason).toBe('item_not_found');
  });

  it('creates and updates a customer wizard session through commands and callbacks', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
        kind: 'edit_reply_markup',
        conversationId,
        messageId: 999,
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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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

  it('reopens customer preferences with the /preferences command after setup', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));
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

    expectFreshWizardSendRetiresPreviousWizard(secondResult, 77);
  });

  it('sends a fresh wizard message when Start order is clicked from an older wizard', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));
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

    expectFreshWizardSendRetiresPreviousWizard(secondResult, 88);
  });

  it('requires every fresh wizard send to retire the older wizard first', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
        expectFreshWizardSendRetiresPreviousWizard(result, testCase.messageId);
        expectWizardRemainsLatest(result);
      } catch (error) {
        throw new Error(`${testCase.label} did not retire the previous wizard: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  it('keeps the active wizard as the last outbound message even when item media is included', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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

    expectFreshWizardSendRetiresPreviousWizard(result, 97);
    expect(result.outboundJobs.findIndex((job) => job.kind === 'send_photo')).toBeLessThan(
      result.outboundJobs.findIndex((job) => job.kind === 'send' && job.storesWizardMessage),
    );
    expectWizardRemainsLatest(result);
  });

  it('keeps fresh wizard sends centralized behind retirement-aware helpers', async () => {
    const source = await readFile(AUTOMATION_STORE_SOURCE_PATH, 'utf8');
    const directWizardSendFunctions = [...source.matchAll(/storesWizardMessage:\s*true/g)]
      .map((match) => {
        const before = source.slice(0, match.index);
        return [...before.matchAll(/function\s+(\w+)\s*\(/g)].at(-1)?.[1] ?? 'unknown';
      });

    expect(directWizardSendFunctions).toEqual([
      'queueFreshWizardPrompt',
    ]);
  });

  it('submits a cart checkout after optional phone capture and keeps free-text fallback working', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
      ],
    });

    expect(checkoutResult.replyJobs.some((job) => job.text.includes('<b>Checkout</b>'))).toBe(true);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('<b>Ready to confirm</b>'))).toBe(false);
    expect(checkoutResult.replyJobs.some((job) => job.text.includes('Quoted total:</b> USD 12.50'))).toBe(true);

    let workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes[0]?.status).toBe('quoted');
    expect(workspace.intakes[0]?.quotedTotal).toBe(12.5);

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

  it('normalizes shared Telegram contact phones before intake and promotion writes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.conversations[0]?.phone).toBe('+855 12345678');
    expect(workspace.intakes[0]?.phone).toBe('+855 12345678');

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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
      ],
    });

    const staleResult = await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 124,
          callback_query: {
            id: 'callback-8',
            data: 'w:confirm',
            from: {
              id: 555_666,
              first_name: 'Sela',
            },
            message: {
              message_id: 1011,
              date: 1_745_193_624,
              chat: {
                id: 555_666,
                type: 'private',
              },
            },
          },
        },
      ],
    });

    expect(staleResult.outboundJobs.some((job) => job.kind === 'answer_callback' && job.text === 'This order was already sent to banji.')).toBe(true);

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    expect(workspace.intakes).toHaveLength(1);
  });

  it('finds the Telegram conversation for a promoted customer ticket update', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-store-'));

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
});
