import type { RankingEntryType } from '@shared/inventory';
import type {
  OverviewDrawerBandId,
  OverviewTaskAction,
  OverviewTaskFilter,
} from '../renderer/src/routes/overview/view-model';
import type { IconComponent } from './types';
import {
  Archive,
  BadgePercent,
  BellRing,
  Bot,
  BrainCircuit,
  CalendarClock,
  Circle,
  CircleGauge,
  CircleOff,
  ClipboardCheck,
  ClipboardClock,
  ClipboardList,
  Eye,
  FileText,
  Flame,
  ListTodo,
  MoonStar,
  Package,
  PackageCheck,
  PackagePlus,
  ScanLine,
  ScrollText,
  Send,
  ShoppingBasket,
  Store,
  TimerReset,
  Wrench,
} from 'lucide-react';

export const overviewTaskActionIcons: Record<OverviewTaskAction, IconComponent | null> = {
  log_order: PackagePlus,
  update_eta: CalendarClock,
  follow_up: Send,
  receive: ScanLine,
  review: null,
  start_update: ClipboardList,
  remind_tomorrow: BellRing,
};

export const overviewTaskFilterIcons: Record<OverviewTaskFilter, IconComponent> = {
  all: ClipboardList,
  to_order: ShoppingBasket,
  awaiting_receipt: ClipboardClock,
  follow_up_today: ListTodo,
  ready_to_receive: ClipboardCheck,
  received_today: Archive,
};

export const overviewDrawerBandIcons: Record<OverviewDrawerBandId, IconComponent> = {
  real_life: ScrollText,
  timing: TimerReset,
  order_shape: Package,
  optional_learning: BrainCircuit,
  receipt_details: PackageCheck,
  preview: Eye,
  note: FileText,
  next_steps: Bot,
};

export const rankingEntryTypeIcons: Record<RankingEntryType, IconComponent> = {
  service: Store,
  sku: Package,
};

export type RegimeIconKey =
  | 'normal'
  | 'promo'
  | 'spike'
  | 'lull'
  | 'stockout_constrained'
  | 'correction'
  | 'unknown';

export const regimeIcons: Record<RegimeIconKey, IconComponent> = {
  normal: Circle,
  promo: BadgePercent,
  spike: Flame,
  lull: MoonStar,
  stockout_constrained: CircleOff,
  correction: Wrench,
  unknown: CircleGauge,
};

export function normalizeRegimeIconKey(regime: string | null | undefined): RegimeIconKey {
  const normalized = regime?.trim().toLowerCase() ?? '';
  if (normalized.includes('promo')) {
    return 'promo';
  }
  if (normalized.includes('spike')) {
    return 'spike';
  }
  if (normalized.includes('lull')) {
    return 'lull';
  }
  if (normalized.includes('correction')) {
    return 'correction';
  }
  if (normalized.includes('stockout')) {
    return 'stockout_constrained';
  }
  if (normalized.includes('normal')) {
    return 'normal';
  }
  return 'unknown';
}

export function getRegimeIcon(regime: string | null | undefined): IconComponent {
  return regimeIcons[normalizeRegimeIconKey(regime)];
}
