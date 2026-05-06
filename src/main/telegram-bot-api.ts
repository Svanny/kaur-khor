import { prepareDesktopImageUpload } from './desktop-image';

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

async function telegramApiRequest<TResult>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<TResult> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
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
  return telegramApiRequest<TelegramBotUser>(token, 'getMe');
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
  return telegramApiRequest<TelegramUpdate[]>(token, 'getUpdates', {
    allowed_updates: ['message', 'edited_message', 'callback_query'],
    offset: offset ?? undefined,
    timeout,
  });
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
  return telegramApiRequest<TelegramMessage>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  });
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
    return telegramApiRequest<TelegramMessage>(token, 'sendPhoto', {
      chat_id: chatId,
      photo: photoPath,
      caption,
      parse_mode: parseMode,
    });
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

  const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
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

  return payload.result;
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
  return telegramApiRequest<TelegramMessage>(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  });
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
  return telegramApiRequest<TelegramMessage>(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
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
