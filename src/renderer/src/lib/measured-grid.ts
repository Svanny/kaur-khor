export const DEFAULT_MEASURED_GRID_GAP = 12;

export function deriveMeasuredGridColumnCount({
  containerWidth,
  maxItemWidth,
  gap = DEFAULT_MEASURED_GRID_GAP,
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
