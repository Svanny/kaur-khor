// @vitest-environment node

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeAutomationPromotion,
  ingestAutomationTelegramUpdates,
  patchAutomationExposureRow,
  prepareAutomationPromotion,
  readAutomationConversation,
  readAutomationTransportState,
  readAutomationWorkspace,
} from './automation-store';
import {
  notifyTelegramCustomerOfPromotion,
  notifyTelegramCustomerOfTicketUpdate,
  resolveTelegramPhotoPath,
  validateAndSaveTelegramAutomationConnection,
} from './automation-telegram';

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
        imagePath: null,
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
  chatId: number,
  firstName: string,
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
          data: 'w:language:en',
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
          data: 'w:currency:USD',
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

describe('telegram automation connection setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates the bot token and registers commands when saving settings', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'banji bot',
          username: 'banji_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })));
    vi.stubGlobal('fetch', fetchMock);

    const connection = await validateAndSaveTelegramAutomationConnection(userDataPath, {
      channel: 'telegram',
      botToken: 'secret-token',
      status: 'connected',
    });

    expect(connection.status).toBe('connected');
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://api.telegram.org/botsecret-token/getMe', expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://api.telegram.org/botsecret-token/setMyCommands', expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://api.telegram.org/botsecret-token/setChatMenuButton', expect.anything());

    const transport = await readAutomationTransportState(userDataPath);
    expect(transport.connection.commandsConfiguredAt).not.toBeNull();
  });

  it('resolves relative catalog image paths from the desktop assets directory', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-telegram-assets-'));
    const assetsDir = join(userDataPath, 'assets');
    await mkdir(assetsDir, { recursive: true });
    const relativeName = 'banji-dev-service-008-back-to-school-family-promo.png';
    const absolutePath = join(assetsDir, relativeName);
    await writeFile(absolutePath, new Uint8Array([137, 80, 78, 71]));

    await expect(resolveTelegramPhotoPath(userDataPath, relativeName)).resolves.toBe(absolutePath);
  });

  it('notifies the Telegram customer after an intake is promoted to a ticket', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'banji bot',
          username: 'banji_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 10,
          date: 1_745_193_700,
          text: 'sent',
          chat: { id: 555_777, type: 'private' },
        },
      })));
    vi.stubGlobal('fetch', fetchMock);

    await validateAndSaveTelegramAutomationConnection(userDataPath, {
      channel: 'telegram',
      botToken: 'secret-token',
      status: 'connected',
    });

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, 555_777, 'Sokha');

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 1,
          message: {
            message_id: 1,
            date: 1_745_193_600,
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
    const conversationId = workspace.conversations[0]!.conversationId;
    const conversation = await readAutomationConversation(userDataPath, conversationId);
    const intake = conversation.intakes[0]!;
    const notified = await notifyTelegramCustomerOfPromotion(userDataPath, {
      conversationId,
      intake: {
        ...intake,
        status: 'ticketed',
        promotedTicketId: 'ticket-1',
      },
    });

    expect(notified).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.telegram.org/botsecret-token/sendMessage', expect.anything());

    const updatedConversation = await readAutomationConversation(userDataPath, conversationId);
    expect(updatedConversation.messages.some((entry) => entry.direction === 'outbound' && entry.externalMessageKey === '10')).toBe(true);
  });

  it('notifies the Telegram customer after a Telegram customer ticket is updated', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'banji bot',
          username: 'banji_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 11,
          date: 1_745_193_701,
          text: 'updated',
          chat: { id: 555_888, type: 'private' },
        },
      })));
    vi.stubGlobal('fetch', fetchMock);

    await validateAndSaveTelegramAutomationConnection(userDataPath, {
      channel: 'telegram',
      botToken: 'secret-token',
      status: 'connected',
    });

    await patchAutomationExposureRow(userDataPath, context as never, {
      entityId: 'sku-1',
      entityType: 'sku',
      exposed: true,
    });
    await completePreferencesOnboarding(userDataPath, 555_888, 'Sokha');

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 2,
          message: {
            message_id: 2,
            date: 1_745_193_601,
            text: '2 cotton scarf',
            chat: {
              id: 555_888,
              type: 'private',
            },
            from: {
              id: 555_888,
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

    const notified = await notifyTelegramCustomerOfTicketUpdate(userDataPath, {
      ticketEvent: {
        ...prepared.ticketEvent,
        eventType: 'revised',
        note: 'Pickup after 5 PM',
        revision: 2,
      },
    });

    expect(notified).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.telegram.org/botsecret-token/sendMessage', expect.anything());

    const updatedConversation = await readAutomationConversation(userDataPath, intake.conversationId);
    expect(updatedConversation.messages.some((entry) => entry.direction === 'outbound' && entry.externalMessageKey === '11')).toBe(true);
  });
});
