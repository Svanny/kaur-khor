import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AutomationConnectionCard } from './connection-card';

describe('AutomationConnectionCard', () => {
  test('localizes Telegram identity placeholders in Khmer', () => {
    render(
      <AutomationConnectionCard
        botDisplayName=""
        botToken=""
        botUsername=""
        connection={null}
        externalLink=""
        isSaving={false}
        language="km"
        onBotDisplayNameChange={vi.fn()}
        onBotTokenChange={vi.fn()}
        onBotUsernameChange={vi.fn()}
        onExternalLinkChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('ឈ្មោះប្រើបូតតេលេក្រាម')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('តំណបូតតេលេក្រាម')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('@bot_username')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('https://t.me/your_bot')).not.toBeInTheDocument();
  });
});
