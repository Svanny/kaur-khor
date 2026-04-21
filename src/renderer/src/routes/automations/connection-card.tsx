import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { AutomationChannelConnection } from '@shared/automation';
import { ActionSaveIcon } from '@icons/actions';

export function AutomationConnectionCard({
  connection,
  botDisplayName,
  botToken,
  botUsername,
  externalLink,
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
  onBotDisplayNameChange: (value: string) => void;
  onBotTokenChange: (value: string) => void;
  onBotUsernameChange: (value: string) => void;
  onExternalLinkChange: (value: string) => void;
  onSave: () => void;
}) {
  const resolvedDisplayName = connection?.botDisplayName ?? botDisplayName;
  const resolvedUsername = connection?.botUsername ?? botUsername;

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-[1.25rem] border border-border/60 bg-background/70 p-4">
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Bot identity</p>
          <p className="text-sm text-foreground">
            {resolvedDisplayName || 'Telegram bot not named yet'}
            {resolvedUsername ? ` · @${resolvedUsername.replace(/^@/, '')}` : ''}
          </p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Connection state</p>
          <p className="text-sm text-foreground">{connection?.status ?? 'disconnected'}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Last webhook</p>
          <p className="text-sm text-foreground">{connection?.lastWebhookAt ?? 'No webhook received yet'}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Last error</p>
          <p className="text-sm text-foreground">{connection?.lastErrorMessage ?? 'No transport error recorded'}</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Customer-order contract</p>
          <p className="text-sm leading-6 text-muted-foreground">Customers can browse approved sellables, request quantities, and receive a quoted total. banj will only create customer tickets after the intake passes review or confirmation rules.</p>
        </div>
        <div className="grid gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Intake rule summary</p>
          <p className="text-sm leading-6 text-muted-foreground">Telegram stays an ingress channel. Pricing, ticket truth, and fulfillment still belong to banj.</p>
        </div>
      </div>

      <div className="grid gap-3 rounded-[1.25rem] border border-border/60 bg-background/70 p-4">
        <Input placeholder="Bot display name" value={botDisplayName} onChange={(event) => onBotDisplayNameChange(event.target.value)} />
        <Input placeholder="@bot_username" value={botUsername} onChange={(event) => onBotUsernameChange(event.target.value)} />
        <Input placeholder="https://t.me/your_bot" value={externalLink} onChange={(event) => onExternalLinkChange(event.target.value)} />
        <Textarea placeholder="Telegram bot token" value={botToken} onChange={(event) => onBotTokenChange(event.target.value)} />
        <div className="flex justify-end">
          <Button type="button" onClick={onSave}>
            <ActionSaveIcon className="size-4" />
            Save Telegram settings
          </Button>
        </div>
      </div>
    </div>
  );
}
