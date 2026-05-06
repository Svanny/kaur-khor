// @vitest-environment node

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareDesktopImageUpload } from './desktop-image';
import {
  telegramAnswerCallbackQuery,
  telegramDeleteMessage,
  telegramEditMessageReplyMarkup,
  telegramEditMessageText,
  telegramSendPhoto,
  telegramSendMessage,
  telegramSetChatMenuButton,
  telegramSetMyCommands,
} from './telegram-bot-api';

vi.mock('./desktop-image', () => ({
  prepareDesktopImageUpload: vi.fn(),
}));

describe('telegram bot api wrapper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends message payloads with parse mode and reply markup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      result: {
        message_id: 10,
        date: 1_745_193_600,
        text: 'hello',
        chat: { id: 1, type: 'private' },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);

    await telegramSendMessage('token', {
      chatId: 1,
      text: '<b>Hello</b>',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: 'Start', callback_data: 'w:order' }]],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bottoken/sendMessage',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 1,
          text: '<b>Hello</b>',
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: 'Start', callback_data: 'w:order' }]],
          },
        }),
      }),
    );
  });

  it('supports edit, reply-markup-only edit, callback answers, commands, and menu button calls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 55,
          date: 1_745_193_600,
          text: 'edited',
          chat: { id: 1, type: 'private' },
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 55,
          date: 1_745_193_600,
          text: 'edited',
          chat: { id: 1, type: 'private' },
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })));
    vi.stubGlobal('fetch', fetchMock);

    await telegramEditMessageText('token', {
      chatId: 1,
      messageId: 55,
      text: '<b>Edited</b>',
      parseMode: 'HTML',
      replyMarkup: { inline_keyboard: [[{ text: 'Cart', callback_data: 'w:cart' }]] },
    });
    await telegramEditMessageReplyMarkup('token', {
      chatId: 1,
      messageId: 55,
      replyMarkup: { inline_keyboard: [] },
    });
    await telegramAnswerCallbackQuery('token', {
      callbackQueryId: 'cb-1',
      text: 'Added.',
    });
    await telegramSetMyCommands('token', [
      { command: 'start', description: 'Open menu' },
    ]);
    await telegramSetChatMenuButton('token', {
      menuButton: { type: 'commands' },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.telegram.org/bottoken/editMessageText',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: 1,
          message_id: 55,
          text: '<b>Edited</b>',
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[{ text: 'Cart', callback_data: 'w:cart' }]] },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.telegram.org/bottoken/editMessageReplyMarkup',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: 1,
          message_id: 55,
          reply_markup: { inline_keyboard: [] },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.telegram.org/bottoken/answerCallbackQuery',
      expect.objectContaining({
        body: JSON.stringify({
          callback_query_id: 'cb-1',
          text: 'Added.',
          show_alert: undefined,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://api.telegram.org/bottoken/setMyCommands',
      expect.objectContaining({
        body: JSON.stringify({
          commands: [{ command: 'start', description: 'Open menu' }],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://api.telegram.org/bottoken/setChatMenuButton',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: undefined,
          menu_button: { type: 'commands' },
        }),
      }),
    );
  });

  it('supports sending a local photo upload and deleting a message', async () => {
    const tempPhotoPath = join(tmpdir(), `kaur-khor-telegram-photo-${Date.now()}.png`);
    await writeFile(tempPhotoPath, new Uint8Array([137, 80, 78, 71]));
    vi.mocked(prepareDesktopImageUpload).mockResolvedValue({
      bytes: new Uint8Array([137, 80, 78, 71]),
      filename: 'kaur-khor-telegram-photo.png',
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 77,
          date: 1_745_193_601,
          chat: { id: 1, type: 'private' },
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: true })));
    vi.stubGlobal('fetch', fetchMock);

    await telegramSendPhoto('token', {
      chatId: 1,
      photoPath: tempPhotoPath,
      caption: '<b>Cotton Scarf</b>',
      parseMode: 'HTML',
    });
    await telegramDeleteMessage('token', {
      chatId: 1,
      messageId: 77,
    });

    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall?.[0]).toBe('https://api.telegram.org/bottoken/sendPhoto');
    expect(firstCall?.[1]).toMatchObject({ method: 'POST' });
    expect(firstCall?.[1]?.body).toBeInstanceOf(FormData);
    expect(prepareDesktopImageUpload).toHaveBeenCalledWith(tempPhotoPath);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.telegram.org/bottoken/deleteMessage',
      expect.objectContaining({
        body: JSON.stringify({
          chat_id: 1,
          message_id: 77,
        }),
      }),
    );
  });
});
