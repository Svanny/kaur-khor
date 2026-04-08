import type { RankingEntryType } from '@shared/inventory';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BadgePercent,
  BrainCircuit,
  Bot,
  CalendarClock,
  CircleGauge,
  CircleOff,
  ClipboardCheck,
  ClipboardClock,
  ClipboardList,
  Flame,
  FileText,
  Layers3,
  ListTodo,
  ListChecks,
  MoonStar,
  ShoppingBasket,
  Package,
  PackagePlus,
  PackageCheck,
  ScanLine,
  ScrollText,
  Send,
  Store,
  TimerReset,
  Eye,
  BellRing,
  Wrench,
} from 'lucide-react';
import type {
  OverviewTaskAction,
  OverviewTaskFilter,
  OverviewDrawerBandId,
} from '@/routes/overview/view-model';

export const overviewTaskActionIconMap: Record<OverviewTaskAction, LucideIcon | null> = {
  log_order: PackagePlus,
  update_eta: CalendarClock,
  follow_up: Send,
  receive: ScanLine,
  review: null,
  start_update: ClipboardList,
  remind_tomorrow: BellRing,
};

export const overviewTaskFilterIconMap: Record<OverviewTaskFilter, LucideIcon> = {
  all: ClipboardList,
  to_order: ShoppingBasket,
  awaiting_receipt: ClipboardClock,
  follow_up_today: ListTodo,
  ready_to_receive: ClipboardCheck,
  received_today: Archive,
};

export const overviewDrawerBandIconMap: Record<OverviewDrawerBandId, LucideIcon> = {
  real_life: ScrollText,
  timing: TimerReset,
  order_shape: Package,
  optional_learning: BrainCircuit,
  receipt_details: PackageCheck,
  preview: Eye,
  note: FileText,
  next_steps: Bot,
};

export const rankingEntryTypeIconMap: Record<RankingEntryType, LucideIcon> = {
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

export const regimeIconMap: Record<RegimeIconKey, LucideIcon> = {
  normal: CircleGauge,
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

export function regimeIconFor(regime: string | null | undefined): LucideIcon {
  return regimeIconMap[normalizeRegimeIconKey(regime)];
}
