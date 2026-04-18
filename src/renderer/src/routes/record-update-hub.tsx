import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionCreatePackageIcon,
  ActionReceiveInventoryIcon,
} from '@icons/actions';
import { EntityRevenueIcon, EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import type { IconComponent } from '@icons';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
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
];
const PRIMARY_HUB_CARDS: RecordUpdateHubCard[] = [
  RECORD_UPDATE_HUB_CARDS[0]!,
  RECORD_UPDATE_HUB_CARDS[3]!,
  RECORD_UPDATE_HUB_CARDS[4]!,
];
const SECONDARY_HUB_CARDS: RecordUpdateHubCard[] = [
  RECORD_UPDATE_HUB_CARDS[1]!,
  RECORD_UPDATE_HUB_CARDS[2]!,
];

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

function HubCard({ card }: { card: RecordUpdateHubCard }) {
  const CardIcon = card.icon;
  const { language } = usePreferences();
  const hasDraftSaved = hasDraftSavedForLane(card.laneId);
  const title = translateUiLiteral(language, card.title);
  const description = translateUiLiteral(language, card.description);

  return (
    <Link
      aria-label={title}
      className={cn(
        'group flex size-[var(--hub-tile-size)] min-h-0 flex-col rounded-[2rem] border p-8 shadow-[0_22px_50px_rgba(48,31,20,0.10)] transition duration-200 hover:-translate-y-1 hover:border-foreground/30 hover:shadow-[0_28px_60px_rgba(48,31,20,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
        tintedSurfaceClassName(card.tone),
        'bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.55),rgba(255,255,255,0.16)_36%,rgba(255,255,255,0.02)_100%)]',
      )}
      to={card.href}
    >
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
    </Link>
  );
}

export function RecordUpdateHubRoute() {
  const { language } = usePreferences();

  return (
    <WorkspacePage className="gap-5">
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
              <HubCard key={card.title} card={card} />
            ))}
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}
