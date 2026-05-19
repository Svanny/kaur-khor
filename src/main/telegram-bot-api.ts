import { prepareDesktopImageUpload } from './desktop-image';

async function telegramFetch(input: string, init?: RequestInit) {
  if (process.versions.electron) {
    try {
      const electron = await import('electron');
      if (typeof electron.net?.fetch === 'function') {
        return electron.net.fetch(input, init);
      }
    } catch {
      // Non-Electron test runners and build tools should keep using global fetch.
    }
  }

  return fetch(input, init);
}

type TelegramApiEnvelope<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

export type TelegramBotUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  chat: TelegramChat;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
  contact?: {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
  from?: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
};

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export type TelegramKeyboardButton =
  | string
  | {
    text: string;
    request_contact?: boolean;
    request_location?: boolean;
  };

export type TelegramReplyKeyboardMarkup = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
  is_persistent?: boolean;
};

export type TelegramReplyKeyboardRemove = {
  remove_keyboard: true;
};

export type TelegramMenuButton =
  | {
    type: 'commands';
  }
  | {
    type: 'default';
  };

export type TelegramCallbackQuery = {
  id: string;
  from: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type TelegramBotCommand = {
  command: string;
  description: string;
};

export class TelegramBotApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'TelegramBotApiError';
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTelegramChat(value: unknown): value is TelegramChat {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const chat = value as Partial<TelegramChat>;
  return isFiniteNumber(chat.id) && typeof chat.type === 'string';
}

function isTelegramBotUser(value: unknown): value is TelegramBotUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const user = value as Partial<TelegramBotUser>;
  return isFiniteNumber(user.id) &&
    typeof user.is_bot === 'boolean' &&
    typeof user.first_name === 'string' &&
    (user.username === undefined || typeof user.username === 'string');
}

function isTelegramMessageEntity(value: unknown): value is NonNullable<TelegramMessage['entities']>[number] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const entity = value as Partial<NonNullable<TelegramMessage['entities']>[number]>;
  const offset = entity.offset;
  const length = entity.length;
  return typeof entity.type === 'string' &&
    Number.isSafeInteger(offset) &&
    typeof offset === 'number' &&
    offset >= 0 &&
    Number.isSafeInteger(length) &&
    typeof length === 'number' &&
    length >= 0;
}

function isTelegramContact(value: unknown): value is NonNullable<TelegramMessage['contact']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const contact = value as Partial<NonNullable<TelegramMessage['contact']>>;
  return typeof contact.phone_number === 'string' &&
    typeof contact.first_name === 'string' &&
    (contact.last_name === undefined || typeof contact.last_name === 'string') &&
    (contact.user_id === undefined || isFiniteNumber(contact.user_id));
}

function isTelegramLocation(value: unknown): value is NonNullable<TelegramMessage['location']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const location = value as Partial<NonNullable<TelegramMessage['location']>>;
  return isFiniteNumber(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    isFiniteNumber(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180;
}

function isTelegramMessageSender(value: unknown): value is NonNullable<TelegramMessage['from']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const sender = value as Partial<NonNullable<TelegramMessage['from']>>;
  return isFiniteNumber(sender.id) &&
    (sender.username === undefined || typeof sender.username === 'string') &&
    (sender.first_name === undefined || typeof sender.first_name === 'string') &&
    (sender.last_name === undefined || typeof sender.last_name === 'string');
}

function isTelegramMessage(value: unknown): value is TelegramMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const message = value as Partial<TelegramMessage>;
  return isFiniteNumber(message.message_id) &&
    isFiniteNumber(message.date) &&
    isTelegramChat(message.chat) &&
    (message.text === undefined || typeof message.text === 'string') &&
    (message.entities === undefined || (Array.isArray(message.entities) && message.entities.every(isTelegramMessageEntity))) &&
    (message.contact === undefined || isTelegramContact(message.contact)) &&
    (message.location === undefined || isTelegramLocation(message.location)) &&
    (message.from === undefined || isTelegramMessageSender(message.from));
}

function isTelegramCallbackQuery(value: unknown): value is TelegramCallbackQuery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const callbackQuery = value as Partial<TelegramCallbackQuery>;
  const from = callbackQuery.from as Partial<TelegramCallbackQuery['from']> | undefined;
  return typeof callbackQuery.id === 'string' &&
    Boolean(from && isFiniteNumber(from.id)) &&
    (callbackQuery.message === undefined || isTelegramMessage(callbackQuery.message)) &&
    (callbackQuery.data === undefined || typeof callbackQuery.data === 'string');
}

function isTelegramUpdate(value: unknown): value is TelegramUpdate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const update = value as Partial<TelegramUpdate>;
  return typeof update.update_id === 'number' &&
    Number.isSafeInteger(update.update_id) &&
    update.update_id >= 0 &&
    (update.message === undefined || isTelegramMessage(update.message)) &&
    (update.edited_message === undefined || isTelegramMessage(update.edited_message)) &&
    (update.callback_query === undefined || isTelegramCallbackQuery(update.callback_query));
}

function requireTelegramMessageResult(method: string, result: unknown): TelegramMessage {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new TelegramBotApiError(`Telegram ${method} returned a malformed message.`);
  }
  const message = result as Partial<TelegramMessage>;
  if (!isFiniteNumber(message.message_id) || !isTelegramChat(message.chat)) {
    throw new TelegramBotApiError(`Telegram ${method} returned a malformed message.`);
  }
  return {
    ...message,
    message_id: message.message_id,
    date: isFiniteNumber(message.date) ? message.date : Number.NaN,
    chat: message.chat,
  };
}

async function telegramApiRequest<TResult>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<TResult> {
  const response = await telegramFetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload: TelegramApiEnvelope<TResult> | null = null;
  try {
    payload = await response.json() as TelegramApiEnvelope<TResult>;
  } catch {
    throw new TelegramBotApiError(`Telegram ${method} returned a non-JSON response.`, response.status);
  }

  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramBotApiError(
      payload.description || `Telegram ${method} failed with status ${response.status}.`,
      response.status,
    );
  }

  return payload.result;
}

export async function telegramGetMe(token: string) {
  const user = await telegramApiRequest<unknown>(token, 'getMe');
  if (!isTelegramBotUser(user)) {
    throw new TelegramBotApiError('Telegram getMe returned a malformed bot profile.');
  }
  return user;
}

export async function telegramGetUpdates(
  token: string,
  {
    offset,
    timeout = 20,
  }: {
    offset?: number | null;
    timeout?: number;
  },
) {
  const updates = await telegramApiRequest<unknown>(token, 'getUpdates', {
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    offset: offset ?? undefined,
    timeout,
  });
  if (!Array.isArray(updates) || updates.some((update) => !isTelegramUpdate(update))) {
    throw new TelegramBotApiError('Telegram getUpdates returned malformed updates.');
  }
  return updates;
}

export async function telegramSendMessage(
  token: string,
  {
    chatId,
    text,
    parseMode,
    replyMarkup,
  }: {
    chatId: number | string;
    text: string;
    parseMode?: 'HTML';
    replyMarkup?: TelegramInlineKeyboardMarkup | TelegramReplyKeyboardMarkup | TelegramReplyKeyboardRemove;
  },
) {
  return requireTelegramMessageResult('sendMessage', await telegramApiRequest<unknown>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  }));
}

export async function telegramSendPhoto(
  token: string,
  {
    chatId,
    photoPath,
    caption,
    parseMode,
  }: {
    chatId: number | string;
    photoPath: string;
    caption?: string;
    parseMode?: 'HTML';
  },
) {
  if (/^https?:\/\//i.test(photoPath)) {
    return requireTelegramMessageResult('sendPhoto', await telegramApiRequest<unknown>(token, 'sendPhoto', {
      chat_id: chatId,
      photo: photoPath,
      caption,
      parse_mode: parseMode,
    }));
  }

  const upload = await prepareDesktopImageUpload(photoPath);
  const formData = new FormData();
  formData.set('chat_id', String(chatId));
  formData.set('photo', new Blob([upload.bytes]), upload.filename);
  if (caption) {
    formData.set('caption', caption);
  }
  if (parseMode) {
    formData.set('parse_mode', parseMode);
  }

  const response = await telegramFetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });

  let payload: TelegramApiEnvelope<TelegramMessage> | null = null;
  try {
    payload = await response.json() as TelegramApiEnvelope<TelegramMessage>;
  } catch {
    throw new TelegramBotApiError('Telegram sendPhoto returned a non-JSON response.', response.status);
  }

  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new TelegramBotApiError(
      payload.description || `Telegram sendPhoto failed with status ${response.status}.`,
      response.status,
    );
  }

  return requireTelegramMessageResult('sendPhoto', payload.result);
}

export async function telegramEditMessageText(
  token: string,
  {
    chatId,
    messageId,
    text,
    parseMode,
    replyMarkup,
  }: {
    chatId: number | string;
    messageId: number;
    text: string;
    parseMode?: 'HTML';
    replyMarkup?: TelegramInlineKeyboardMarkup;
  },
) {
  return requireTelegramMessageResult('editMessageText', await telegramApiRequest<unknown>(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  }));
}

export async function telegramEditMessageReplyMarkup(
  token: string,
  {
    chatId,
    messageId,
    replyMarkup,
  }: {
    chatId: number | string;
    messageId: number;
    replyMarkup?: TelegramInlineKeyboardMarkup;
  },
) {
  return requireTelegramMessageResult('editMessageReplyMarkup', await telegramApiRequest<unknown>(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  }));
}

export async function telegramAnswerCallbackQuery(
  token: string,
  {
    callbackQueryId,
    text,
    showAlert,
  }: {
    callbackQueryId: string;
    text?: string;
    showAlert?: boolean;
  },
) {
  return telegramApiRequest<boolean>(token, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function telegramDeleteMessage(
  token: string,
  {
    chatId,
    messageId,
  }: {
    chatId: number | string;
    messageId: number;
  },
) {
  return telegramApiRequest<boolean>(token, 'deleteMessage', {
    chat_id: chatId,
    message_id: messageId,
  });
}

export async function telegramSetMyCommands(token: string, commands: TelegramBotCommand[]) {
  return telegramApiRequest<boolean>(token, 'setMyCommands', {
    commands,
  });
}

export async function telegramSetChatMenuButton(
  token: string,
  {
    chatId,
    menuButton,
  }: {
    chatId?: number | string;
    menuButton: TelegramMenuButton;
  },
) {
  return telegramApiRequest<boolean>(token, 'setChatMenuButton', {
    chat_id: chatId,
    menu_button: menuButton,
  });
}
