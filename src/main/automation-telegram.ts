import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AppCurrency } from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import {
  appendAutomationOutboundTelegramMessage,
  applyAutomationTelegramProfile,
  findAutomationConversationForTelegramTicket,
  ingestAutomationTelegramUpdates,
  markAutomationTelegramCommandsConfigured,
  recordAutomationWizardItemImageMessage,
  readAutomationConnection,
  readAutomationConversation,
  readAutomationCustomerPreferences,
  readAutomationTransportState,
  recordAutomationWizardMessage,
  recordAutomationTelegramError,
  saveAutomationConnection,
} from './automation-store';
import type { AutomationOrderIntake } from '@shared/automation';
import type { SenaTicketEvent } from '@shared/sena';
import { loadDesktopPreferences } from './preferences';
import {
  telegramAnswerCallbackQuery,
  telegramDeleteMessage,
  telegramEditMessageReplyMarkup,
  telegramEditMessageText,
  telegramGetMe,
  telegramGetUpdates,
  telegramSendPhoto,
  telegramSendMessage,
  telegramSetChatMenuButton,
  telegramSetMyCommands,
} from './telegram-bot-api';

type AutomationWorkspaceContext = Parameters<typeof ingestAutomationTelegramUpdates>[1]['context'];

const TELEGRAM_BOT_COMMANDS = [
  { command: 'start', description: 'Open the main customer menu' },
  { command: 'help', description: 'Show ordering help and shortcuts' },
  { command: 'available', description: 'Browse exposed sellables' },
  { command: 'order', description: 'Start or resume an order' },
  { command: 'cart', description: 'Review the current order draft' },
  { command: 'cancel', description: 'Cancel the current order draft' },
  { command: 'preferences', description: 'Change bot language and display currency' },
] as const;

export async function resolveTelegramPhotoPath(userDataPath: string, photoPath: string) {
  const trimmed = photoPath.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('Telegram photo paths must point to a managed banji asset.');
  }

  const assertManagedAssetPath = (candidatePath: string, rootPath: string) => {
    const relativePath = relative(rootPath, candidatePath);
    if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Telegram photo paths must point to a managed banji asset.');
    }
  };

  const assetsRoot = resolve(userDataPath, 'assets');
  const candidate = isAbsolute(trimmed) ? resolve(trimmed) : resolve(assetsRoot, trimmed);
  try {
    const [canonicalAssetsRoot, canonicalCandidate] = await Promise.all([
      realpath(assetsRoot),
      realpath(candidate),
    ]);
    assertManagedAssetPath(canonicalCandidate, canonicalAssetsRoot);
    return canonicalCandidate;
  } catch (error) {
    assertManagedAssetPath(candidate, assetsRoot);
    if (error instanceof Error && ('code' in error) && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return candidate;
    }
    throw error;
  }
}

function displayMoneyFromUsd(amount: number | null, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  if (amount == null) {
    return null;
  }
  return currency === 'KHR' ? amount * usdToKhrExchangeRate : amount;
}

function formatTelegramMoney(
  amountUsd: number | null,
  preferences: {
    currency: 'USD' | 'KHR';
    usdToKhrExchangeRate: number;
  },
) {
  const displayAmount = displayMoneyFromUsd(amountUsd, preferences.currency, preferences.usdToKhrExchangeRate);
  if (amountUsd == null) {
    return `${preferences.currency} TBD`;
  }
  return preferences.currency === 'KHR'
    ? `${preferences.currency} ${Math.round(displayAmount!).toFixed(0)}`
    : `${preferences.currency} ${displayAmount!.toFixed(2)}`;
}

function isKhmer(language: 'en' | 'km') {
  return language === 'km';
}

function resolvedTokenPayload(existingHasToken: boolean, nextToken: string | null | undefined) {
  if (nextToken === undefined) {
    return undefined;
  }
  if (nextToken.trim()) {
    return nextToken.trim();
  }
  return existingHasToken ? undefined : null;
}

async function configureTelegramBotUi(userDataPath: string, token: string) {
  await telegramSetMyCommands(token, [...TELEGRAM_BOT_COMMANDS]);
  await telegramSetChatMenuButton(token, {
    menuButton: { type: 'commands' },
  });
  await markAutomationTelegramCommandsConfigured(userDataPath);
}

async function sendTelegramConversationMessage(
  userDataPath: string,
  {
    conversationId,
    text,
  }: {
    conversationId: string;
    text: string;
  },
) {
  const transport = await readAutomationTransportState(userDataPath);
  const token = transport.botToken?.trim();
  if (!token) {
    return false;
  }

  const { conversation } = await readAutomationConversation(userDataPath, conversationId);
  const sent = await telegramSendMessage(token, {
    chatId: conversation.externalConversationKey,
    text,
    parseMode: 'HTML',
  });

  await appendAutomationOutboundTelegramMessage(userDataPath, {
    conversationId,
    externalMessageKey: String(sent.message_id),
    sentAt: new Date(sent.date * 1000).toISOString(),
    text: sent.text ?? text,
  });
  return true;
}

export async function validateAndSaveTelegramAutomationConnection(
  userDataPath: string,
  payload: Parameters<typeof saveAutomationConnection>[1],
) {
  const current = await readAutomationTransportState(userDataPath);
  const token = resolvedTokenPayload(current.connection.hasBotToken, payload.botToken);

  if (payload.status === 'disconnected') {
    return saveAutomationConnection(userDataPath, { ...payload, botToken: token });
  }

  if (token?.trim()) {
    const bot = await telegramGetMe(token);
    await applyAutomationTelegramProfile(userDataPath, { token, user: bot });
    await configureTelegramBotUi(userDataPath, token);
    return saveAutomationConnection(userDataPath, {
      ...payload,
      botDisplayName: payload.botDisplayName ?? bot.first_name,
      botToken: undefined,
      botUsername: payload.botUsername ?? bot.username ?? null,
      externalLink: payload.externalLink ?? (bot.username ? `https://t.me/${bot.username}` : null),
      status: payload.status ?? 'connected',
    });
  }

  return saveAutomationConnection(userDataPath, { ...payload, botToken: token });
}

export async function runTelegramConnectionTest(
  userDataPath: string,
  {
    latestConversationChatId,
  }: {
    latestConversationChatId: string | null;
  },
) {
  const transport = await readAutomationTransportState(userDataPath);
  const token = transport.botToken?.trim();
  if (!token) {
    throw new Error('Save a Telegram bot token before running a test message.');
  }

  const bot = await telegramGetMe(token);
  await applyAutomationTelegramProfile(userDataPath, { token, user: bot });
  await configureTelegramBotUi(userDataPath, token);

  if (!latestConversationChatId) {
    throw new Error('Send a message to your bot from Telegram first, then run Test message again.');
  }

  await telegramSendMessage(token, {
    chatId: latestConversationChatId,
    text: '<b>banji test message</b>\nTelegram transport is connected and ready for customer intake.',
    parseMode: 'HTML',
  });

  return readAutomationConnection(userDataPath);
}

function buildPromotionNotification(
  intake: AutomationOrderIntake,
  preferences: {
    language: 'en' | 'km';
    currency: 'USD' | 'KHR';
    usdToKhrExchangeRate: number;
  },
) {
  const totalLabel = intake.quotedTotal != null
    ? isKhmer(preferences.language)
      ? `\nតម្លៃសរុប៖ ${formatTelegramMoney(intake.quotedTotal, preferences)}`
      : `\nQuoted total: ${formatTelegramMoney(intake.quotedTotal, preferences)}`
    : '';
  return isKhmer(preferences.language)
    ? `<b>បាន់ជីបានទទួលការបញ្ជាទិញរបស់អ្នក</b>\nការបញ្ជាទិញរបស់អ្នកត្រូវបានបន្ថែមទៅសំបុត្រការងារអតិថិជន ហើយកំពុងស្ថិតនៅក្រុមប្រតិបត្តិករ។${totalLabel}\n\nបាន់ជីនឹងបន្តតាមដានតាមសំបុត្រការងារនេះ។`
    : `<b>Order received by banji</b>\nYour order was added to a customer ticket and is now with the operator team.${totalLabel}\n\nbanji will continue the follow-up from this ticket.`;
}

function buildTicketUpdateNotification(ticketEvent: SenaTicketEvent, language: 'en' | 'km') {
  const statusLabel = ticketEvent.lifecycle === 'canceled'
    ? (isKhmer(language) ? 'បានបោះបង់' : 'Canceled')
    : ticketEvent.lifecycle === 'resolved'
      ? (isKhmer(language) ? 'បានបញ្ចប់' : 'Completed')
      : ticketEvent.stage === 'ready'
        ? (isKhmer(language) ? 'រួចរាល់' : 'Ready')
        : (isKhmer(language) ? 'បានធ្វើបច្ចុប្បន្នភាព' : 'Updated');
  const noteLabel = ticketEvent.note?.trim()
    ? isKhmer(language)
      ? `\nកំណត់ចំណាំ៖ ${ticketEvent.note.trim()}`
      : `\nNote: ${ticketEvent.note.trim()}`
    : '';
  return isKhmer(language)
    ? `<b>បច្ចុប្បន្នភាពការបញ្ជាទិញពីបាន់ជី</b>\nស្ថានភាព៖ ${statusLabel}\nសំបុត្រការងាររបស់អ្នកត្រូវបានធ្វើបច្ចុប្បន្នភាពដោយក្រុមប្រតិបត្តិករ។${noteLabel}`
    : `<b>Order update from banji</b>\nStatus: ${statusLabel}\nYour ticket was updated by the operator team.${noteLabel}`;
}

export async function notifyTelegramCustomerOfPromotion(
  userDataPath: string,
  {
    conversationId,
    intake,
  }: {
    conversationId: string;
    intake: AutomationOrderIntake;
  },
) {
  const desktopPreferences = await loadDesktopPreferences(userDataPath);
  const storedPreferences = await readAutomationCustomerPreferences(userDataPath, conversationId);
  return sendTelegramConversationMessage(userDataPath, {
    conversationId,
    text: buildPromotionNotification(intake, {
      language: storedPreferences?.language ?? desktopPreferences.language,
      currency: storedPreferences?.currency ?? desktopPreferences.currency,
      usdToKhrExchangeRate: desktopPreferences.usdToKhrExchangeRate ?? DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
    }),
  });
}

export async function notifyTelegramCustomerOfTicketUpdate(
  userDataPath: string,
  {
    ticketEvent,
  }: {
    ticketEvent: SenaTicketEvent;
  },
) {
  const conversation = await findAutomationConversationForTelegramTicket(userDataPath, ticketEvent);
  if (!conversation) {
    return false;
  }
  const desktopPreferences = await loadDesktopPreferences(userDataPath);
  const storedPreferences = await readAutomationCustomerPreferences(userDataPath, conversation.conversationId);

  return sendTelegramConversationMessage(userDataPath, {
    conversationId: conversation.conversationId,
    text: buildTicketUpdateNotification(ticketEvent, storedPreferences?.language ?? desktopPreferences.language),
  });
}

async function syncTelegramAutomationOnce(
  userDataPath: string,
  {
    loadContext,
    loadPreferences,
  }: {
    loadContext: () => Promise<AutomationWorkspaceContext>;
    loadPreferences: () => Promise<{
      currency: AppCurrency;
      language: 'en' | 'km';
      showAutomationsPage: boolean;
      usdToKhrExchangeRate: number;
    }>;
  },
) {
  const preferences = await loadPreferences();
  if (!preferences.showAutomationsPage) {
    return { disabled: true };
  }

  const transport = await readAutomationTransportState(userDataPath);
  const token = transport.botToken?.trim();
  if (!token || transport.connection.status !== 'connected') {
    return { disabled: false };
  }

  const bot = await telegramGetMe(token);
  await applyAutomationTelegramProfile(userDataPath, { token, user: bot });
  if (!transport.connection.commandsConfiguredAt) {
    await configureTelegramBotUi(userDataPath, token);
  }

  const updates = await telegramGetUpdates(token, {
    offset: transport.telegramUpdateCursor,
    timeout: 1,
  });
  if (updates.length === 0) {
    return { disabled: false };
  }

  const context = await loadContext();
  const result = await ingestAutomationTelegramUpdates(userDataPath, {
    context,
    currency: preferences.currency,
    language: preferences.language,
    usdToKhrExchangeRate: preferences.usdToKhrExchangeRate,
    updates,
  });

  for (const job of result.outboundJobs) {
    if (job.kind === 'answer_callback') {
      await telegramAnswerCallbackQuery(token, {
        callbackQueryId: job.callbackQueryId,
        text: job.text,
        showAlert: job.showAlert,
      });
      continue;
    }

    if (job.kind === 'edit') {
      await telegramEditMessageText(token, {
        chatId: job.chatId,
        messageId: job.messageId,
        text: job.text,
        parseMode: job.parseMode,
        replyMarkup: job.replyMarkup,
      });
      continue;
    }

    if (job.kind === 'edit_reply_markup') {
      await telegramEditMessageReplyMarkup(token, {
        chatId: job.chatId,
        messageId: job.messageId,
        replyMarkup: job.replyMarkup,
      });
      continue;
    }

    if (job.kind === 'delete_message') {
      await telegramDeleteMessage(token, {
        chatId: job.chatId,
        messageId: job.messageId,
      });
      continue;
    }

    if (job.kind === 'send_photo') {
      let sent;
      try {
        const resolvedPhotoPath = await resolveTelegramPhotoPath(userDataPath, job.photoPath);
        sent = await telegramSendPhoto(token, {
          chatId: job.chatId,
          photoPath: resolvedPhotoPath,
          caption: job.caption,
          parseMode: job.parseMode,
        });
      } catch (error) {
        if (
          error instanceof Error
          && ('code' in error)
          && (error as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
          continue;
        }
        throw error;
      }
      if (job.storesItemImage) {
        await recordAutomationWizardItemImageMessage(userDataPath, {
          conversationId: job.conversationId,
          messageId: sent.message_id,
          entityType: job.storesItemImage.entityType,
          entityId: job.storesItemImage.entityId,
        });
      }
      continue;
    }

    const sent = await telegramSendMessage(token, {
      chatId: job.chatId,
      text: job.text,
      parseMode: job.parseMode,
      replyMarkup: job.replyMarkup,
    });
    await appendAutomationOutboundTelegramMessage(userDataPath, {
      conversationId: job.conversationId,
      externalMessageKey: String(sent.message_id),
      sentAt: new Date(sent.date * 1000).toISOString(),
      text: sent.text ?? job.text,
    });
    if (job.storesWizardMessage) {
      await recordAutomationWizardMessage(userDataPath, {
        conversationId: job.conversationId,
        messageId: sent.message_id,
      });
    }
  }
  return { disabled: false };
}

export function startTelegramAutomationLoop(
  userDataPath: string,
  deps: {
    loadContext: () => Promise<AutomationWorkspaceContext>;
    loadPreferences: () => Promise<{
      currency: AppCurrency;
      language: 'en' | 'km';
      showAutomationsPage: boolean;
      usdToKhrExchangeRate: number;
    }>;
  },
) {
  let stopped = false;
  let enabled = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const schedule = (delayMs: number) => {
    if (stopped || !enabled) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };

  const tick = async () => {
    if (stopped || !enabled || running) {
      return;
    }
    running = true;
    let disabledByPreference = false;
    try {
      const result = await syncTelegramAutomationOnce(userDataPath, deps);
      disabledByPreference = result.disabled;
    } catch (error) {
      await recordAutomationTelegramError(
        userDataPath,
        error instanceof Error ? error.message : 'Telegram automation sync failed.',
      );
    } finally {
      running = false;
      if (disabledByPreference) {
        enabled = false;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      } else {
        schedule(2_000);
      }
    }
  };

  schedule(0);

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    setEnabled(nextEnabled: boolean) {
      enabled = nextEnabled;
      if (!enabled) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      schedule(0);
    },
    triggerSoon() {
      schedule(0);
    },
  };
}
