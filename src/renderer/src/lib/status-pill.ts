export type StatusPillTone =
  | 'danger'
  | 'warning'
  | 'success'
  | 'info'
  | 'neutral'
  | 'price-up'
  | 'price-down';

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
