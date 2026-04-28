export type GridCardColorKey =
  | 'continue-work'
  | 'capture-update'
  | 'open-catalog'
  | 'open-insights'
  | 'queue'
  | 'intake'
  | 'capture'
  | 'stock-count'
  | 'customer-order'
  | 'immediate-sale'
  | 'supplier-order'
  | 'pressure'
  | 'money'
  | 'explain';

const GRID_CARD_COLOR_CLASS_NAMES: Record<GridCardColorKey, string> = {
  'continue-work': 'backdrop-blur-md saturate-[1.3] border-[#DC2626]/35 bg-[#DC2626]/12',
  'capture-update': 'backdrop-blur-md saturate-[1.3] border-[#16A34A]/35 bg-[#16A34A]/12',
  'open-catalog': 'backdrop-blur-md saturate-[1.3] border-[#D97706]/35 bg-[#D97706]/12',
  'open-insights': 'backdrop-blur-md saturate-[1.3] border-[#2563EB]/35 bg-[#2563EB]/12',
  queue: 'backdrop-blur-md saturate-[1.3] border-[#9333EA]/35 bg-[#9333EA]/12',
  intake: 'backdrop-blur-md saturate-[1.3] border-[#0891B2]/35 bg-[#0891B2]/12',
  capture: 'backdrop-blur-md saturate-[1.3] border-[#CA8A04]/35 bg-[#CA8A04]/12',
  'stock-count': 'backdrop-blur-md saturate-[1.3] border-[#DB2777]/35 bg-[#DB2777]/12',
  'customer-order': 'backdrop-blur-md saturate-[1.3] border-[#EA580C]/35 bg-[#EA580C]/12',
  'immediate-sale': 'backdrop-blur-md saturate-[1.3] border-[#0D9488]/35 bg-[#0D9488]/12',
  'supplier-order': 'backdrop-blur-md saturate-[1.3] border-[#65A30D]/35 bg-[#65A30D]/12',
  pressure: 'backdrop-blur-md saturate-[1.3] border-[#BE185D]/35 bg-[#BE185D]/12',
  money: 'backdrop-blur-md saturate-[1.3] border-[#4338CA]/35 bg-[#4338CA]/12',
  explain: 'backdrop-blur-md saturate-[1.3] border-[#059669]/35 bg-[#059669]/12',
};

export function gridCardSurfaceClassName(key: GridCardColorKey) {
  return GRID_CARD_COLOR_CLASS_NAMES[key];
}
