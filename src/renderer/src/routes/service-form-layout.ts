export const SERVICE_FORM_SKU_GRID_GAP = 12;

export function deriveMeasuredGridColumnCount({
  containerWidth,
  maxItemWidth,
  gap = SERVICE_FORM_SKU_GRID_GAP,
}: {
  containerWidth: number;
  maxItemWidth: number;
  gap?: number;
}) {
  if (containerWidth <= 0 || maxItemWidth <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor((containerWidth + gap) / (maxItemWidth + gap)));
}
