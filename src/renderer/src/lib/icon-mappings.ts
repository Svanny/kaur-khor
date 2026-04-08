import type { RankingEntryType } from '@shared/inventory';
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BrainCircuit,
  Bot,
  CalendarClock,
  ClipboardCheck,
  ClipboardClock,
  ClipboardList,
  FileText,
  HandCoins,
  Layers3,
  ListTodo,
  ListChecks,
  ShoppingBasket,
  Package,
  PackagePlus,
  PackageCheck,
  ScanLine,
  ScrollText,
  Send,
  TimerReset,
  Eye,
  BellRing,
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
  service: HandCoins,
  sku: Package,
};
