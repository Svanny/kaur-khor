import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AutomationChannelConnection } from '@shared/automation';
import type { AppLanguage } from '@shared/inventory';
import { ActionSaveIcon } from '@icons/actions';
import { StatusWarningIcon } from '@icons/status';
import { translateUiLiteral } from '@/lib/translations';

function connectionLabel(status: AutomationChannelConnection['status'] | undefined, language: AppLanguage) {
  if (status === 'connected') {
    return translateUiLiteral(language, 'Connected');
  }
  if (status === 'paused') {
    return translateUiLiteral(language, 'Paused');
  }
  if (status === 'error') {
    return translateUiLiteral(language, 'Error');
  }
  return translateUiLiteral(language, 'Disconnected');
}

export function AutomationConnectionCard({
  connection,
  botDisplayName,
  botToken,
  botUsername,
  externalLink,
  isSaving,
  isBrowserRuntime = false,
  language,
  onBotDisplayNameChange,
  onBotTokenChange,
  onBotUsernameChange,
  onExternalLinkChange,
  onSave,
}: {
  connection: AutomationChannelConnection | null;
  botDisplayName: string;
  botToken: string;
  botUsername: string;
  externalLink: string;
  isSaving: boolean;
  isBrowserRuntime?: boolean;
  language: AppLanguage;
  onBotDisplayNameChange: (value: string) => void;
  onBotTokenChange: (value: string) => void;
  onBotUsernameChange: (value: string) => void;
  onExternalLinkChange: (value: string) => void;
  onSave: () => void;
}) {
  const resolvedDisplayName = connection?.botDisplayName ?? botDisplayName;
  const resolvedUsername = connection?.botUsername ?? botUsername;
  const literal = (englishTemplate: string) => translateUiLiteral(language, englishTemplate);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2 rounded-[1.25rem] border border-amber-300/70 bg-amber-50/85 p-4 text-sm leading-6 text-amber-950">
        <div className="flex items-start gap-3">
          <StatusWarningIcon className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{literal('Advanced experimental automation settings')}</p>
            <p>
              {literal('This tab is a work in progress. Telegram automation is experimental, subject to change, and might be unstable.')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-[1.25rem] border border-border/60 bg-background/70 p-4">
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{literal('Bot identity')}</p>
          <p className="text-sm text-foreground">
            {resolvedDisplayName || literal('Telegram bot not named yet')}
            {resolvedUsername ? ` · @${resolvedUsername.replace(/^@/, '')}` : ''}
          </p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{literal('Connection state')}</p>
          <p className="text-sm text-foreground">{connectionLabel(connection?.status, language)}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{literal('Last webhook')}</p>
          <p className="text-sm text-foreground">{connection?.lastWebhookAt ?? literal('No webhook received yet')}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{literal('Last error')}</p>
          <p className="text-sm text-foreground">{connection?.lastErrorMessage ?? literal('No transport error recorded')}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{literal('Customer-order contract')}</p>
          <p className="text-sm leading-6 text-muted-foreground">{literal('Customers can browse approved sellables, request quantities, and receive a quoted total. Kaur Khor will only create customer tickets after the intake passes review or confirmation rules.')}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{literal('Intake rule summary')}</p>
          <p className="text-sm leading-6 text-muted-foreground">{literal('Telegram stays an ingress channel. Pricing, ticket truth, and fulfillment still belong to Kaur Khor.')}</p>
        </div>
      </div>

      {isBrowserRuntime ? (
        <div className="grid gap-2 rounded-[1.25rem] border border-amber-300/60 bg-amber-50/80 p-4 text-sm leading-6 text-amber-950">
          <p className="font-semibold">{literal('Browser Telegram is while-tab-open only')}</p>
          <p>
            {literal('SENA is single-threaded in browser mode. Telegram polling only runs while this tab is open, visible, and awake.')}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{literal('The bot token is stored in this browser profile.')}</li>
            <li>{literal('Clearing browser data can remove browser automation state and the saved token.')}</li>
            <li>{literal('Do not run the same bot token in desktop and browser at the same time unless you coordinate the handoff.')}</li>
            <li>{literal('If Telegram blocks browser fetch, Kaur Khor will show a browser-blocked state and require the desktop app.')}</li>
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-[1.25rem] border border-border/60 bg-background/70 p-4">
        <Input placeholder={literal('Bot display name')} value={botDisplayName} onChange={(event) => onBotDisplayNameChange(event.target.value)} />
        <Input placeholder={literal('@bot_username')} value={botUsername} onChange={(event) => onBotUsernameChange(event.target.value)} />
        <Input placeholder={literal('https://t.me/your_bot')} value={externalLink} onChange={(event) => onExternalLinkChange(event.target.value)} />
        <Textarea placeholder={literal('Telegram bot token')} value={botToken} onChange={(event) => onBotTokenChange(event.target.value)} />
        <div className="flex justify-end">
          <Button disabled={isSaving} type="button" onClick={onSave}>
            <ActionSaveIcon className="size-4" />
            {isSaving ? literal('Saving...') : literal('Save Telegram settings')}
          </Button>
        </div>
      </div>
    </div>
  );
}
