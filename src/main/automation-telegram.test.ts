// @vitest-environment node

import { mkdtemp, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  finalizeAutomationPromotion,
  ingestAutomationTelegramUpdates,
  listAutomationPendingTelegramOutboundJobs,
  patchAutomationExposureRow,
  prepareAutomationPromotion,
  readAutomationConversation,
  recordAutomationTelegramError,
  readAutomationWizardSessionForConversation,
  readAutomationTransportState,
  readAutomationWorkspace,
  recordAutomationWizardMessage,
} from './automation-store';
import {
  notifyTelegramCustomerOfPromotion,
  notifyTelegramCustomerOfTicketUpdate,
  resolveTelegramPhotoPath,
  sendTelegramCustomerMessageForIntake,
  startTelegramAutomationLoop,
  validateAndSaveTelegramAutomationConnection,
} from './automation-telegram';

async function waitForAssertion(assertion: () => void | Promise<void>) {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 250) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  await assertion();
  throw lastError;
}

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
  chatId: number,
  firstName: string,
  {
    language = 'en',
    currency = 'USD',
  }: {
    language?: 'en' | 'km';
    currency?: 'USD' | 'KHR';
  } = {},
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

function telegramSendMessageText(fetchMock: ReturnType<typeof vi.fn>) {
  const body = fetchMock.mock.calls.at(-1)?.[1]?.body;
  const payload = typeof body === 'string' ? JSON.parse(body) as { text?: string } : {};
  return payload.text ?? '';
}

function expectNoUnexpectedKhmerLatin(text: string, allowedLatinFragments: string[] = []) {
  const withoutHtmlTags = text.replace(/<\/?[A-Za-z][^>]*>/g, '');
  const redacted = allowedLatinFragments.reduce((current, fragment) => current.replaceAll(fragment, ''), withoutHtmlTags);
  expect(redacted.match(/[A-Za-z][A-Za-z0-9@_./-]*/g) ?? []).toEqual([]);
}

describe('telegram automation connection setup', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('validates the bot token and registers commands when saving settings', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
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
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-assets-'));
    const assetsDir = join(userDataPath, 'assets');
    await mkdir(assetsDir, { recursive: true });
    const relativeName = 'kaur-khor-dev-service-008-back-to-school-family-promo.png';
    const absolutePath = join(assetsDir, relativeName);
    await writeFile(absolutePath, new Uint8Array([137, 80, 78, 71]));

    await expect(resolveTelegramPhotoPath(userDataPath, relativeName)).resolves.toBe(await realpath(absolutePath));
  });

  it('rejects Telegram photo paths outside the managed assets directory', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-assets-'));

    await expect(resolveTelegramPhotoPath(userDataPath, '/tmp/file.png')).rejects.toThrow(
      'Telegram photo paths must point to a managed Kaur Khor asset.',
    );
    await expect(resolveTelegramPhotoPath(userDataPath, '../outside.png')).rejects.toThrow(
      'Telegram photo paths must point to a managed Kaur Khor asset.',
    );
  });

  it('allows canonical managed asset paths for Telegram photos', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-assets-'));
    const assetsDir = join(userDataPath, 'assets');
    await mkdir(assetsDir, { recursive: true });
    const assetPath = join(assetsDir, 'cotton-scarf.png');
    await writeFile(assetPath, new Uint8Array([137, 80, 78, 71]));

    await expect(resolveTelegramPhotoPath(userDataPath, assetPath)).resolves.toBe(await realpath(assetPath));
  });

  it('does not poll Telegram while automations are disabled and resumes when re-enabled', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-loop-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await validateAndSaveTelegramAutomationConnection(userDataPath, {
      channel: 'telegram',
      botToken: 'secret-token',
      status: 'connected',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    let showAutomationsPage = false;
    const loadPreferences = vi.fn(async () => ({
      currency: 'USD' as const,
      language: 'en' as const,
      showAutomationsPage,
      usdToKhrExchangeRate: 4000,
    }));
    const loop = startTelegramAutomationLoop(userDataPath, {
      loadContext: async () => context as never,
      loadPreferences,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(loadPreferences).toHaveBeenCalledTimes(1);

    showAutomationsPage = true;
    loop.setEnabled(true);

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(loadPreferences).toHaveBeenCalledTimes(2);
    });
    loop.stop();
  });

  it('keeps polling after a transient Telegram transport error so pending updates recover', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-loop-error-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: [
          {
            update_id: 42,
            message: {
              message_id: 7,
              date: 1_778_172_699,
              text: 'Hi?',
              chat: { id: 555_111, type: 'private' },
              from: { id: 555_111, first_name: 'Ly' },
            },
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 8,
          date: 1_778_172_700,
          text: 'Needs review',
          chat: { id: 555_111, type: 'private' },
        },
      })));
    vi.stubGlobal('fetch', fetchMock);

    await validateAndSaveTelegramAutomationConnection(userDataPath, {
      channel: 'telegram',
      botToken: 'secret-token',
      status: 'connected',
    });
    await recordAutomationTelegramError(userDataPath, 'Conflict: terminated by other getUpdates request');

    const loop = startTelegramAutomationLoop(userDataPath, {
      loadContext: async () => context as never,
      loadPreferences: async () => ({
        currency: 'USD' as const,
        language: 'en' as const,
        showAutomationsPage: true,
        usdToKhrExchangeRate: 4000,
      }),
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6);
    });
    loop.stop();

    const transport = await readAutomationTransportState(userDataPath);
    expect(transport.connection.status).toBe('connected');
    expect(transport.connection.lastErrorMessage).toBeNull();
    expect(transport.telegramUpdateCursor).toBe(43);
    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]?.conversationId;
    expect(conversationId).toBeTruthy();
    const conversation = await readAutomationConversation(userDataPath, conversationId!);
    expect(conversation.messages.map((message) => message.rawText)).toContain('Hi?');
  });

  it('keeps Telegram replies pending when sending fails and flushes them after restart', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-loop-pending-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: [
          {
            update_id: 42,
            message: {
              message_id: 7,
              date: 1_778_172_699,
              text: 'Hi?',
              chat: { id: 555_112, type: 'private' },
              from: { id: 555_112, first_name: 'Ly' },
            },
          },
        ],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        description: 'send failed',
      }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 8,
          date: 1_778_172_700,
          text: 'Choose your language',
          chat: { id: 555_112, type: 'private' },
        },
      })));
    vi.stubGlobal('fetch', fetchMock);

    await validateAndSaveTelegramAutomationConnection(userDataPath, {
      channel: 'telegram',
      botToken: 'secret-token',
      status: 'connected',
    });

    const deps = {
      loadContext: async () => context as never,
      loadPreferences: async () => ({
        currency: 'USD' as const,
        language: 'en' as const,
        showAutomationsPage: true,
        usdToKhrExchangeRate: 4000,
      }),
    };
    const firstLoop = startTelegramAutomationLoop(userDataPath, deps);

    await waitForAssertion(async () => {
      expect(fetchMock).toHaveBeenCalledTimes(6);
      await expect(listAutomationPendingTelegramOutboundJobs(userDataPath))
        .resolves.toHaveLength(1);
    });
    firstLoop.stop();

    const transportAfterFailure = await readAutomationTransportState(userDataPath);
    expect(transportAfterFailure.telegramUpdateCursor).toBe(43);

    const secondLoop = startTelegramAutomationLoop(userDataPath, deps);
    await waitForAssertion(async () => {
      expect(fetchMock).toHaveBeenCalledTimes(9);
      await expect(listAutomationPendingTelegramOutboundJobs(userDataPath))
        .resolves.toHaveLength(0);
    });
    secondLoop.stop();

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]?.conversationId;
    expect(conversationId).toBeTruthy();
    const session = await readAutomationWizardSessionForConversation(userDataPath, conversationId!);
    expect(session?.lastWizardMessageId).toBe(8);
    expect(session?.generatedWizardMessageIds).toContain(8);
  });

  it('continues sending the next wizard prompt when generated message cleanup is already stale', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-cleanup-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: [{
          update_id: 5_557_790,
          callback_query: {
            id: 'callback-stale-generated-add',
            data: 'w:add:sku:sku-1',
            from: { id: 555_778, first_name: 'Sokha' },
            message: {
              message_id: 77,
              date: 1_745_193_700,
              chat: { id: 555_778, type: 'private' },
            },
          },
        }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        description: 'Bad Request: message to delete not found',
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 78,
          date: 1_745_193_701,
          text: 'cart',
          chat: { id: 555_778, type: 'private' },
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, result: [] })));
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
    await completePreferencesOnboarding(userDataPath, 555_778, 'Sokha');

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const conversationId = workspace.conversations[0]!.conversationId;
    await recordAutomationWizardMessage(userDataPath, { conversationId, messageId: 77 });

    const loop = startTelegramAutomationLoop(userDataPath, {
      loadContext: async () => context as never,
      loadPreferences: async () => ({
        currency: 'USD' as const,
        language: 'en' as const,
        showAutomationsPage: true,
        usdToKhrExchangeRate: 4000,
      }),
    });

    await waitForAssertion(async () => {
      expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/botsecret-token/sendMessage', expect.anything());
      const session = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
      expect(session?.lastWizardMessageId).toBe(78);
      expect(session?.generatedWizardMessageIds).toEqual([78]);
    });
    loop.stop();

    const session = await readAutomationWizardSessionForConversation(userDataPath, conversationId);
    expect(session?.lastWizardMessageId).toBe(78);
    expect(session?.generatedWizardMessageIds).toEqual([78]);
  });

  it('notifies the Telegram customer after an intake is promoted to a ticket', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValue(new Response(JSON.stringify({
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

  it('sends an operator-authored intake message and links it to that intake thread', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValue(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 12,
          date: 1_745_193_702,
          text: 'Custom &lt;approval&gt;',
          chat: { id: 555_779, type: 'private' },
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
    await completePreferencesOnboarding(userDataPath, 555_779, 'Sokha');
    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3,
          message: {
            message_id: 3,
            date: 1_745_193_602,
            text: '2 cotton scarf',
            chat: { id: 555_779, type: 'private' },
            from: { id: 555_779, first_name: 'Sokha' },
          },
        },
      ],
    });
    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const intake = workspace.intakes[0]!;

    await sendTelegramCustomerMessageForIntake(userDataPath, {
      conversationId: intake.conversationId,
      intakeId: intake.intakeId,
      text: 'Custom <approval>',
    });

    expect(telegramSendMessageText(fetchMock)).toBe('Custom &lt;approval&gt;');
    const updatedConversation = await readAutomationConversation(userDataPath, intake.conversationId);
    expect(updatedConversation.messages.some((entry) =>
      entry.direction === 'outbound'
      && entry.intakeId === intake.intakeId
      && entry.externalMessageKey === '12',
    )).toBe(true);
  });

  it('notifies the Telegram customer after a Telegram customer ticket is updated and escapes note HTML', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValue(new Response(JSON.stringify({
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
        note: 'Pickup <a> <b> & <',
        revision: 2,
      },
    });

    expect(notified).toBe(true);
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.telegram.org/botsecret-token/sendMessage', expect.anything());
    expect(telegramSendMessageText(fetchMock)).toContain('Note: Pickup &lt;a&gt; &lt;b&gt; &amp; &lt;');
    expect(telegramSendMessageText(fetchMock)).not.toContain('Note: Pickup <a> <b> & <');

    const updatedConversation = await readAutomationConversation(userDataPath, intake.conversationId);
    expect(updatedConversation.messages.some((entry) =>
      entry.direction === 'outbound'
      && entry.externalMessageKey === '11'
      && entry.intakeId === intake.intakeId,
    )).toBe(true);
  });

  it('renders Khmer promotion and ticket update notifications without unintended Latin UI copy', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-automation-telegram-km-'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          id: 1,
          is_bot: true,
          first_name: 'Kaur Khor bot',
          username: 'kaur_khor_bot',
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockImplementation(async () => new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 12,
          date: 1_745_193_702,
          text: 'sent',
          chat: { id: 555_889, type: 'private' },
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
    await completePreferencesOnboarding(userDataPath, 555_889, 'Sokha', {
      language: 'km',
      currency: 'KHR',
    });

    await ingestAutomationTelegramUpdates(userDataPath, {
      context: context as never,
      currency: 'USD',
      updates: [
        {
          update_id: 3,
          message: {
            message_id: 3,
            date: 1_745_193_602,
            text: '2 cotton scarf',
            chat: {
              id: 555_889,
              type: 'private',
            },
            from: {
              id: 555_889,
              first_name: 'Sokha',
            },
          },
        },
      ],
    });

    const workspace = await readAutomationWorkspace(userDataPath, context as never);
    const intake = workspace.intakes[0]!;
    await notifyTelegramCustomerOfPromotion(userDataPath, {
      conversationId: intake.conversationId,
      intake: {
        ...intake,
        status: 'ticketed',
        promotedTicketId: 'ticket-12',
      },
    });
    const promotionText = telegramSendMessageText(fetchMock);

    const prepared = await prepareAutomationPromotion(userDataPath, {
      intakeId: intake.intakeId,
      mode: 'create_ticket',
    }, {
      observations: context.observations as never,
    });
    await finalizeAutomationPromotion(userDataPath, prepared.updatedIntake);
    await notifyTelegramCustomerOfTicketUpdate(userDataPath, {
      ticketEvent: {
        ...prepared.ticketEvent,
        eventType: 'revised',
        note: 'យកទំនិញក្រោយម៉ោង 5 ល្ងាច',
        revision: 2,
      },
    });
    const updateText = telegramSendMessageText(fetchMock);

    expect(promotionText).toContain('<b>កខបានទទួលការបញ្ជាទិញរបស់អ្នក</b>');
    expect(promotionText).toContain('តម្លៃសរុប៖ KHR 100000');
    expect(updateText).toContain('<b>បច្ចុប្បន្នភាពការបញ្ជាទិញពីកខ</b>');
    expect(updateText).toContain('សំបុត្រការងាររបស់អ្នកត្រូវបានធ្វើបច្ចុប្បន្នភាព');
    expectNoUnexpectedKhmerLatin(`${promotionText}\n${updateText}`, ['KHR']);
  });
});
