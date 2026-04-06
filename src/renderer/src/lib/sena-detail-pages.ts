import type { SenaServiceDetail, SenaServiceDetailPage, SenaSkuDetail, SenaSkuDetailPage } from '@shared/sena';

export function isSkuDetailPage(value: SenaSkuDetail | SenaSkuDetailPage | null): value is SenaSkuDetailPage {
  return value != null && 'detail' in value;
}

export function isServiceDetailPage(value: SenaServiceDetail | SenaServiceDetailPage | null): value is SenaServiceDetailPage {
  return value != null && 'detail' in value;
}

export function normalizeSkuDetailPage(
  value: SenaSkuDetail | SenaSkuDetailPage | null,
  pageLimit = 10,
): SenaSkuDetailPage | null {
  if (!value) {
    return null;
  }
  if (isSkuDetailPage(value)) {
    return value;
  }
  return {
    detail: value,
    pageLimit,
    hasOlder: false,
    nextBeforeIntervalIndex: null,
    latestIntervalIndex: value.demandPosterior.at(-1)?.intervalIndex ?? null,
  };
}

export function normalizeServiceDetailPage(
  value: SenaServiceDetail | SenaServiceDetailPage | null,
  pageLimit = 10,
): SenaServiceDetailPage | null {
  if (!value) {
    return null;
  }
  if (isServiceDetailPage(value)) {
    return value;
  }
  return {
    detail: value,
    pageLimit,
    hasOlder: false,
    nextBeforeIntervalIndex: null,
    latestIntervalIndex: value.regimeTimeline.at(-1)?.intervalIndex ?? null,
  };
}
