export type StatusPillTone =
  | 'danger'
  | 'warning'
  | 'success'
  | 'info'
  | 'neutral'
  | 'price-up'
  | 'price-down';

export type SurfacePillTone = 'selected' | 'default';
export type TintedSurfaceTone = StatusPillTone;
export type RegimeToneKey =
  | 'normal'
  | 'promo'
  | 'spike'
  | 'lull'
  | 'stockout_constrained'
  | 'correction'
  | 'unknown';

const STATUS_PILL_TONE_CLASS_NAMES: Record<StatusPillTone, string> = {
  danger: 'border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300 hover:text-rose-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:text-amber-900',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:text-emerald-800',
  info: 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:text-sky-800',
  neutral:
    'border-stone-200 bg-stone-100 text-stone-700 hover:border-stone-300 hover:text-stone-800',
  'price-up':
    'border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:text-violet-900',
  'price-down':
    'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 hover:border-fuchsia-300 hover:text-fuchsia-900',
};

export function statusPillClassName(tone: StatusPillTone) {
  return STATUS_PILL_TONE_CLASS_NAMES[tone];
}

export interface StateToneColors {
  fill: string;
  fillOpacity: number;
  stroke: string;
}

export type DemandSparklineTone = 'up' | 'flat' | 'down' | 'previous';

const STATUS_TONE_COLORS: Record<StatusPillTone, StateToneColors> = {
  danger: {
    fill: 'rgb(225 29 72)',
    fillOpacity: 0.18,
    stroke: 'rgb(190 24 93)',
  },
  warning: {
    fill: 'rgb(245 158 11)',
    fillOpacity: 0.18,
    stroke: 'rgb(180 83 9)',
  },
  success: {
    fill: 'rgb(16 185 129)',
    fillOpacity: 0.18,
    stroke: 'rgb(4 120 87)',
  },
  info: {
    fill: 'rgb(14 165 233)',
    fillOpacity: 0.18,
    stroke: 'rgb(3 105 161)',
  },
  neutral: {
    fill: 'rgb(120 113 108)',
    fillOpacity: 0.14,
    stroke: 'rgb(87 83 78)',
  },
  'price-up': {
    fill: 'rgb(139 92 246)',
    fillOpacity: 0.18,
    stroke: 'rgb(109 40 217)',
  },
  'price-down': {
    fill: 'rgb(217 70 239)',
    fillOpacity: 0.18,
    stroke: 'rgb(162 28 175)',
  },
};

export function statusToneColors(tone: StatusPillTone) {
  return STATUS_TONE_COLORS[tone];
}

const DEMAND_SPARKLINE_TONE_COLORS: Record<DemandSparklineTone, StateToneColors> = {
  up: {
    fill: 'rgb(52 211 153)',
    fillOpacity: 0.22,
    stroke: 'rgb(5 150 105)',
  },
  flat: {
    fill: 'rgb(96 165 250)',
    fillOpacity: 0.2,
    stroke: 'rgb(37 99 235)',
  },
  down: {
    fill: 'rgb(251 191 36)',
    fillOpacity: 0.22,
    stroke: 'rgb(217 119 6)',
  },
  previous: {
    fill: 'rgb(191 219 254)',
    fillOpacity: 0.12,
    stroke: 'rgb(148 163 184)',
  },
};

export function demandSparklineToneColors(tone: DemandSparklineTone) {
  return DEMAND_SPARKLINE_TONE_COLORS[tone];
}

const SURFACE_PILL_TONE_CLASS_NAMES: Record<SurfacePillTone, string> = {
  selected: 'border-border/80 bg-card text-foreground shadow-[0_1px_2px_rgba(27,15,7,0.08)]',
  default: 'border-border/70 bg-background/70 text-muted-foreground hover:bg-card hover:text-foreground',
};

export function surfacePillClassName(tone: SurfacePillTone) {
  return SURFACE_PILL_TONE_CLASS_NAMES[tone];
}

const TINTED_SURFACE_TONE_CLASS_NAMES: Record<TintedSurfaceTone, string> = {
  danger: 'border-rose-200/80 bg-rose-50/70',
  warning: 'border-amber-200/80 bg-amber-50/70',
  success: 'border-emerald-200/80 bg-emerald-50/70',
  info: 'border-sky-200/80 bg-sky-50/70',
  neutral: 'border-stone-200/80 bg-stone-50/80',
  'price-up': 'border-violet-200/80 bg-violet-50/70',
  'price-down': 'border-fuchsia-200/80 bg-fuchsia-50/70',
};

export function tintedSurfaceClassName(tone: TintedSurfaceTone) {
  return TINTED_SURFACE_TONE_CLASS_NAMES[tone];
}

export const REGIME_LEGEND_ORDER = [
  'normal',
  'promo',
  'spike',
  'lull',
  'stockout_constrained',
  'correction',
] as const satisfies readonly RegimeToneKey[];

interface RegimeToneSpec {
  strongFill: string;
  mutedFill: string;
  surfaceClassName: string;
}

const REGIME_TONE_SPECS: Record<RegimeToneKey, RegimeToneSpec> = {
  normal: {
    strongFill: 'rgba(244, 223, 207, 0.72)',
    mutedFill: 'rgba(244, 223, 207, 0.48)',
    surfaceClassName: 'border-stone-200/80 bg-stone-50/90',
  },
  promo: {
    strongFill: 'rgba(248, 224, 184, 0.78)',
    mutedFill: 'rgba(248, 224, 184, 0.54)',
    surfaceClassName: 'border-amber-200/80 bg-amber-50/85',
  },
  spike: {
    strongFill: 'rgba(245, 196, 176, 0.78)',
    mutedFill: 'rgba(245, 196, 176, 0.5)',
    surfaceClassName: 'border-rose-200/80 bg-rose-50/85',
  },
  lull: {
    strongFill: 'rgba(216, 232, 222, 0.74)',
    mutedFill: 'rgba(216, 232, 222, 0.5)',
    surfaceClassName: 'border-emerald-200/80 bg-emerald-50/85',
  },
  stockout_constrained: {
    strongFill: 'rgba(239, 192, 192, 0.8)',
    mutedFill: 'rgba(239, 192, 192, 0.54)',
    surfaceClassName: 'border-red-200/80 bg-red-50/85',
  },
  correction: {
    strongFill: 'rgba(207, 218, 234, 0.78)',
    mutedFill: 'rgba(207, 218, 234, 0.52)',
    surfaceClassName: 'border-sky-200/80 bg-sky-50/85',
  },
  unknown: {
    strongFill: 'rgba(244, 223, 207, 0.72)',
    mutedFill: 'rgba(244, 223, 207, 0.48)',
    surfaceClassName: 'border-stone-200/80 bg-stone-50/90',
  },
};

export function normalizeRegimeToneKey(regime: string | null | undefined): RegimeToneKey {
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

export function regimeTintedSurfaceClassName(regime: string | null | undefined) {
  return REGIME_TONE_SPECS[normalizeRegimeToneKey(regime)].surfaceClassName;
}

export function regimeChartFill(
  regime: string | null | undefined,
  emphasis: 'strong' | 'muted' = 'strong',
) {
  const spec = REGIME_TONE_SPECS[normalizeRegimeToneKey(regime)];
  return emphasis === 'strong' ? spec.strongFill : spec.mutedFill;
}
