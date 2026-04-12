import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionCreatePackageIcon,
  ActionReceiveInventoryIcon,
} from '@icons/actions';
import { EntityRevenueIcon, EntitySkuIcon } from '@icons/entities';
import type { IconComponent } from '@icons';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import {
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_RECORD_ORDER_PATH,
  RECORD_UPDATE_RECORD_RECEIPT_PATH,
  RECORD_UPDATE_SALES_UPDATE_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
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
    description: 'Open the current record-update wizard.',
    href: RECORD_UPDATE_STOCK_COUNT_PATH,
    icon: EntitySkuIcon,
    laneId: 'stock-count',
    tone: 'info',
  },
  {
    title: 'Sales Update',
    description: 'Open a dedicated record-update session for sales signals.',
    href: RECORD_UPDATE_SALES_UPDATE_PATH,
    icon: EntityRevenueIcon,
    laneId: 'sales-update',
    tone: 'success',
  },
  {
    title: 'Record Order',
    description: 'Open a dedicated record-update session for supplier orders.',
    href: RECORD_UPDATE_RECORD_ORDER_PATH,
    icon: ActionCreatePackageIcon,
    laneId: 'record-order',
    tone: 'warning',
  },
  {
    title: 'Record Receipt',
    description: 'Open a dedicated record-update session for received stock.',
    href: RECORD_UPDATE_RECORD_RECEIPT_PATH,
    icon: ActionReceiveInventoryIcon,
    laneId: 'record-receipt',
    tone: 'danger',
  },
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

  return (
    <Link
      aria-label={card.title}
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
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-foreground">{card.title}</h2>
          <p className="max-w-[18rem] text-sm leading-6 text-muted-foreground">{card.description}</p>
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
          'Start from the hub, then drop into the capture flow that matches the work you are recording.',
        )}
      />
      <div className="flex min-h-[calc(100svh-20rem)] items-center justify-center">
        <div
          className="grid grid-cols-2 gap-4"
          style={
            {
              '--hub-tile-size': 'min(22rem, calc((100vw - 11rem) / 2), calc((100svh - 19rem) / 2))',
            } as CSSProperties
          }
        >
          {RECORD_UPDATE_HUB_CARDS.map((card) => (
            <HubCard key={card.title} card={card} />
          ))}
        </div>
      </div>
    </WorkspacePage>
  );
}
