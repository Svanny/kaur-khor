import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionCreatePackageIcon,
  ActionLayoutGridIcon,
  ActionReceiveInventoryIcon,
} from '@icons/actions';
import { EntityRevenueIcon, EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import type { IconComponent } from '@icons';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import {
  BASE_RECORD_UPDATE_LANES,
  RECORD_UPDATE_CUSTOM_PATH,
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
  type BaseRecordUpdateLaneId,
  type RecordUpdateLaneId,
} from '@/lib/record-update-routes';
import { tintedSurfaceClassName, type TintedSurfaceTone } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';

interface RecordUpdateHubCard {
  title: string;
  description: string;
  href: string;
  icon: IconComponent;
  laneId: RecordUpdateLaneId;
  tone: TintedSurfaceTone;
  rainbow?: boolean;
}

const draftStorageKeyByLaneId = new Map(RECORD_UPDATE_LANES.map((lane) => [lane.id, lane.draftStorageKey]));

const RECORD_UPDATE_HUB_CARDS: RecordUpdateHubCard[] = [
  {
    title: 'Stock Count',
    description: 'Count what is physically on hand and reconcile mistakes.',
    href: RECORD_UPDATE_STOCK_COUNT_PATH,
    icon: EntitySkuIcon,
    laneId: 'stock-count',
    tone: 'info',
  },
  {
    title: 'Customer Orders Pending',
    description: 'Record new customer orders, changes, or cancellations that are still open.',
    href: RECORD_UPDATE_CUSTOMER_PENDING_PATH,
    icon: EntityRevenueIcon,
    laneId: 'customer-order-pending',
    tone: 'success',
  },
  {
    title: 'Customer Orders Fulfilled',
    description: 'Record fulfilled customer orders and immediate sales.',
    href: RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
    icon: EntityServiceIcon,
    laneId: 'customer-order-completed',
    tone: 'orange',
  },
  {
    title: 'Supplier Orders Pending',
    description: 'Record supplier orders placed, changes, or cancellations still awaiting receipt.',
    href: RECORD_UPDATE_SUPPLIER_PENDING_PATH,
    icon: ActionCreatePackageIcon,
    laneId: 'supplier-order-pending',
    tone: 'warning',
  },
  {
    title: 'Supplier Receipts',
    description: 'Record goods received from suppliers and immediate purchases.',
    href: RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
    icon: ActionReceiveInventoryIcon,
    laneId: 'supplier-receipt',
    tone: 'danger',
  },
  {
    title: 'Custom',
    description: 'Choose any update lanes for one combined capture flow.',
    href: RECORD_UPDATE_CUSTOM_PATH,
    icon: ActionLayoutGridIcon,
    laneId: 'custom',
    tone: 'info',
    rainbow: true,
  },
];
const PRIMARY_HUB_CARDS: RecordUpdateHubCard[] = [
  RECORD_UPDATE_HUB_CARDS[0]!,
  RECORD_UPDATE_HUB_CARDS[3]!,
  RECORD_UPDATE_HUB_CARDS[4]!,
];
const SECONDARY_HUB_CARDS: RecordUpdateHubCard[] = [
  RECORD_UPDATE_HUB_CARDS[1]!,
  RECORD_UPDATE_HUB_CARDS[2]!,
  RECORD_UPDATE_HUB_CARDS[5]!,
];
const hubCardByLaneId = new Map(RECORD_UPDATE_HUB_CARDS.map((card) => [card.laneId, card]));

function hasDraftSavedForLane(laneId: RecordUpdateLaneId) {
  if (
    typeof window === 'undefined' ||
    !window.localStorage ||
    typeof window.localStorage.getItem !== 'function'
  ) {
    return false;
  }
  const draftStorageKey = draftStorageKeyByLaneId.get(laneId);
  try {
    return draftStorageKey ? window.localStorage.getItem(draftStorageKey) !== null : false;
  } catch {
    return false;
  }
}

function HubCard({ card, onClick }: { card: RecordUpdateHubCard; onClick?: () => void }) {
  const CardIcon = card.icon;
  const { language } = usePreferences();
  const hasDraftSaved = hasDraftSavedForLane(card.laneId);
  const title = translateUiLiteral(language, card.title);
  const description = translateUiLiteral(language, card.description);
  const className = cn(
    'group flex size-[var(--hub-tile-size)] min-h-0 flex-col rounded-[2rem] border p-8 shadow-[0_22px_50px_rgba(48,31,20,0.10)] transition duration-200 hover:-translate-y-1 hover:border-foreground/30 hover:shadow-[0_28px_60px_rgba(48,31,20,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
    card.rainbow
      ? 'border-fuchsia-200/80 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.62),rgba(255,255,255,0.18)_34%,rgba(255,255,255,0.02)_100%),linear-gradient(135deg,rgba(239,68,68,0.16),rgba(245,158,11,0.15)_18%,rgba(234,179,8,0.15)_34%,rgba(34,197,94,0.14)_50%,rgba(14,165,233,0.15)_66%,rgba(99,102,241,0.15)_82%,rgba(217,70,239,0.16))]'
      : tintedSurfaceClassName(card.tone),
    !card.rainbow
      ? 'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),rgba(255,255,255,0.16)_36%,rgba(255,255,255,0.02)_100%)]'
      : null,
  );
  const contents = (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <CardIcon className="size-20 shrink-0" />
      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{title}</h2>
        <p className="max-w-[18rem] text-sm leading-6 text-muted-foreground">{description}</p>
        {hasDraftSaved ? (
          <p className="mx-auto inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {translateUiLiteral(language, 'Draft saved')}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        aria-label={title}
        className={cn(className, 'cursor-pointer')}
        type="button"
        onClick={onClick}
      >
        {contents}
      </button>
    );
  }

  return (
    <Link
      aria-label={title}
      className={className}
      to={card.href}
    >
      {contents}
    </Link>
  );
}

export function RecordUpdateHubRoute() {
  const { language } = usePreferences();
  const navigate = useNavigate();
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [selectedCustomLaneIds, setSelectedCustomLaneIds] = useState<BaseRecordUpdateLaneId[]>([]);
  const baseCustomLanes = useMemo(() => BASE_RECORD_UPDATE_LANES, []);

  function toggleCustomLane(laneId: BaseRecordUpdateLaneId) {
    setSelectedCustomLaneIds((current) =>
      current.includes(laneId)
        ? current.filter((id) => id !== laneId)
        : [...current, laneId],
    );
  }

  function startCustomUpdate() {
    if (selectedCustomLaneIds.length === 0) {
      return;
    }
    const params = new URLSearchParams();
    params.set('lanes', selectedCustomLaneIds.join(','));
    setCustomDialogOpen(false);
    navigate(`${RECORD_UPDATE_CUSTOM_PATH}?${params.toString()}`);
  }

  return (
    <WorkspacePage className="gap-5">
      {customDialogOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
          role="presentation"
          onClick={() => setCustomDialogOpen(false)}
        >
          <div
            aria-describedby="custom-update-dialog-description"
            aria-labelledby="custom-update-dialog-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="space-y-2">
              <p id="custom-update-dialog-title" className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                {translateUiLiteral(language, 'Build a custom update')}
              </p>
              <p id="custom-update-dialog-description" className="text-sm leading-6 text-muted-foreground">
                {translateUiLiteral(language, 'Choose any lanes to include in one combined update wizard.')}
              </p>
            </div>
            <div className="mt-5 grid gap-1">
              {baseCustomLanes.map((lane) => {
                const checked = selectedCustomLaneIds.includes(lane.id);
                const checkboxId = `custom-lane-${lane.id}`;
                const LaneIcon = hubCardByLaneId.get(lane.id)?.icon ?? ActionLayoutGridIcon;
                return (
                  <div
                    key={lane.id}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 px-1 py-2 text-sm font-medium text-foreground transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                      checked ? 'text-primary' : null,
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleCustomLane(lane.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleCustomLane(lane.id);
                      }
                    }}
                  >
                    <Checkbox
                      aria-label={translateUiLiteral(language, lane.title)}
                      checked={checked}
                      id={checkboxId}
                      onClick={(event) => event.stopPropagation()}
                      onCheckedChange={() => toggleCustomLane(lane.id)}
                    />
                    <LaneIcon className="size-5 shrink-0 text-current" />
                    <span>{translateUiLiteral(language, lane.title)}</span>
                  </div>
                );
              })}
            </div>
            {selectedCustomLaneIds.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                {translateUiLiteral(language, 'Choose at least one update lane.')}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setCustomDialogOpen(false)}>
                {translateUiLiteral(language, 'Cancel')}
              </Button>
              <Button
                disabled={selectedCustomLaneIds.length === 0}
                type="button"
                onClick={startCustomUpdate}
              >
                {translateUiLiteral(language, 'Start custom update')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Record update')}
        title={translateUiLiteral(language, 'Choose an update lane')}
        descriptor={translateUiLiteral(
          language,
          'Choose the physical, customer, or supplier capture flow that matches the work you are recording.',
        )}
      />
      <div className="flex min-h-[calc(100svh-20rem)] items-center justify-center">
        <div
          className="flex w-full max-w-[82rem] flex-col gap-4"
          style={
            {
              '--hub-tile-size': 'min(22rem, calc((100vw - 11rem) / 3), calc((100svh - 19rem) / 2))',
            } as CSSProperties
          }
        >
          <div className="flex flex-wrap justify-center gap-4">
            {PRIMARY_HUB_CARDS.map((card) => (
              <HubCard key={card.title} card={card} />
            ))}
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {SECONDARY_HUB_CARDS.map((card) => (
              <HubCard
                key={card.title}
                card={card}
                onClick={card.laneId === 'custom' ? () => setCustomDialogOpen(true) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}
