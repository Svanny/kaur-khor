import type { SenaServiceDetail, SenaServiceDetailPage, SenaSkuDetail, SenaSkuDetailPage } from '@shared/sena';

export function isSkuDetailPage(value: SenaSkuDetail | SenaSkuDetailPage | null): value is SenaSkuDetailPage {
  return value != null && 'detail' in value;
}

export function isServiceDetailPage(value: SenaServiceDetail | SenaServiceDetailPage | null): value is SenaServiceDetailPage {
  return value != null && 'detail' in value;
}

export function normalizeSkuDetailPage(
  value: SenaSkuDetail | SenaSkuDetailPage | null,
  pageLimit = 20,
): SenaSkuDetailPage | null {
  if (!value) {
    return null;
  }
  if (isSkuDetailPage(value)) {
    return value;
  }
  const windowedDetail = windowSkuDetail(value, pageLimit);
  return {
    detail: windowedDetail.detail,
    pageLimit,
    hasOlder: windowedDetail.hasOlder,
    nextBeforeIntervalIndex: windowedDetail.nextBeforeIntervalIndex,
    latestIntervalIndex: value.demandPosterior.at(-1)?.intervalIndex ?? null,
  };
}

export function normalizeServiceDetailPage(
  value: SenaServiceDetail | SenaServiceDetailPage | null,
  pageLimit = 20,
): SenaServiceDetailPage | null {
  if (!value) {
    return null;
  }
  if (isServiceDetailPage(value)) {
    return value;
  }
  const intervals = value.regimeTimeline;
  const limit = Math.max(1, pageLimit);
  const hasOlder = intervals.length > limit;
  const timeline = hasOlder ? intervals.slice(-limit) : intervals;
  return {
    detail: {
      ...value,
      regimeTimeline: timeline,
    },
    pageLimit,
    hasOlder,
    nextBeforeIntervalIndex: hasOlder ? timeline[0]?.intervalIndex ?? null : null,
    latestIntervalIndex: value.regimeTimeline.at(-1)?.intervalIndex ?? null,
  };
}

function windowSkuDetail(detail: SenaSkuDetail, pageLimit: number) {
  const limit = Math.max(1, pageLimit);
  const demandPosterior = detail.demandPosterior;
  const hasOlder = demandPosterior.length > limit;
  if (!hasOlder) {
    return { detail, hasOlder: false, nextBeforeIntervalIndex: null };
  }

  const visibleDemand = demandPosterior.slice(-limit);
  const visibleIntervalIndexes = new Set(visibleDemand.map((point) => point.intervalIndex));
  const firstVisible = visibleDemand[0];
  const lastVisible = visibleDemand.at(-1);
  const startMs = Date.parse(firstVisible?.startAt ?? firstVisible?.endAt ?? '');
  const endMs = Date.parse(lastVisible?.endAt ?? lastVisible?.startAt ?? '');
  const hasTimeWindow = Number.isFinite(startMs) && Number.isFinite(endMs);

  return {
    detail: {
      ...detail,
      demandPosterior: visibleDemand,
      inventoryPosterior: hasTimeWindow
        ? detail.inventoryPosterior.filter((point) => {
          const atMs = Date.parse(point.at);
          return Number.isFinite(atMs) && atMs >= startMs && atMs <= endMs;
        })
        : detail.inventoryPosterior,
      leadTimePosterior: detail.leadTimePosterior.filter((point) => visibleIntervalIndexes.has(point.intervalIndex)),
      pipelinePosterior: detail.pipelinePosterior.filter((point) => visibleIntervalIndexes.has(point.intervalIndex)),
    },
    hasOlder,
    nextBeforeIntervalIndex: firstVisible?.intervalIndex ?? null,
  };
}
