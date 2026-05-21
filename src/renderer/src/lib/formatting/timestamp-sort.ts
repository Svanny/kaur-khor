export function timestampSortValue(value: string | null | undefined, invalidFallback = Number.NEGATIVE_INFINITY) {
  if (!value) {
    return invalidFallback;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : invalidFallback;
}
