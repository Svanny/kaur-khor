import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { InventorySnapshot, RankingEntry, StockReport } from '@shared/inventory';
import {
  buildDefaultReportRanking,
  hasRankingChanged,
  normalizeReportRanking,
} from '@/components/system/merchandising-editor';
import { formatLocalDateTimeInputValue } from '@/lib/date-input-utils';
import { formatEditableWholeNumber, parseEditableNumberWithCommas, sanitizeWholeNumberForDisplay } from '@/lib/format';

export type OperationsSessionPreset = 'small' | 'medium' | 'big';
export type OperationsSessionStepId =
  | 'details'
  | 'observations'
  | 'services'
  | 'sales-signal'
  | 'review';
export type OperationsSessionRowFilter = 'all' | 'changed';

export interface OperationsSessionRowDraft {
  unitsInStock: string;
  costPerUnit: string;
  productPrice: string;
  restockIncluded: boolean;
  retailStockout: boolean;
  notes: string;
}

export interface OperationsSessionServiceDraft {
  price: string;
  stockout: boolean;
  notes: string;
}

export interface OperationsSessionDraft {
  editReportId: string | null;
  includedSkuIds: string[];
  seededReportedAt: string;
  reportedAt: string;
  reportNotes: string;
  preset: OperationsSessionPreset;
  rowFilter: OperationsSessionRowFilter;
  serviceFilter: OperationsSessionRowFilter;
  rows: Record<string, OperationsSessionRowDraft>;
  serviceDrafts: Record<string, OperationsSessionServiceDraft>;
  rankingDraft: RankingEntry[];
  lastStep: OperationsSessionStepId;
  viewedSteps: OperationsSessionStepId[];
}

interface OperationsSessionContextValue {
  draft: OperationsSessionDraft | null;
  hasDraft: boolean;
  ensureDraft: (snapshot: InventorySnapshot) => OperationsSessionDraft;
  replaceDraft: (nextDraft: OperationsSessionDraft) => void;
  updateDraft: (
    updater: (current: OperationsSessionDraft) => OperationsSessionDraft,
  ) => OperationsSessionDraft | null;
  clearDraft: () => void;
}

const OperationsSessionContext = createContext<OperationsSessionContextValue | null>(null);

function toLocalDateTimeValue(value?: string) {
  return formatLocalDateTimeInputValue(value);
}

function moneyDraftValue(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '' : String(value);
}

function comparableMoneyDraftValue(value: string) {
  const parsed = parseEditableNumberWithCommas(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createOperationsSessionDraft(
  snapshot: InventorySnapshot,
): OperationsSessionDraft {
  const seededReportedAt = toLocalDateTimeValue();
  return {
    editReportId: null,
    includedSkuIds: [],
    seededReportedAt,
    reportedAt: seededReportedAt,
    reportNotes: '',
    preset: 'small',
    rowFilter: 'all',
    serviceFilter: 'all',
    rows: Object.fromEntries(
      snapshot.skus.map((sku) => [
        sku.skuId,
        {
          unitsInStock: formatEditableWholeNumber(sku.unitsInStock),
          costPerUnit: moneyDraftValue(sku.costPerUnit),
          productPrice: moneyDraftValue(sku.productPrice),
          restockIncluded: false,
          retailStockout: false,
          notes: '',
        },
      ]),
    ),
    serviceDrafts: Object.fromEntries(
      snapshot.services.map((service) => [
        service.serviceId,
        {
          price: moneyDraftValue(service.price),
          stockout: false,
          notes: '',
        },
      ]),
    ),
    rankingDraft: buildDefaultReportRanking(snapshot),
    lastStep: 'observations',
    viewedSteps: ['observations'],
  };
}

export function createOperationsSessionDraftFromReport(
  snapshot: InventorySnapshot,
  report: StockReport,
): OperationsSessionDraft {
  const seededReportedAt = toLocalDateTimeValue(report.reportedAt);
  const draft = createOperationsSessionDraft(snapshot);
  const serviceSignalById = new Map(
    report.serviceSignals.map((signal) => [signal.serviceId, signal]),
  );
  const priceAdjustmentById = new Map(
    report.servicePriceAdjustments.map((adjustment) => [adjustment.serviceId, adjustment.price]),
  );
  const preferredRankingEntries = [
    ...report.topServiceRanking.map((serviceId, index) => ({
      entryType: 'service' as const,
      entryId: serviceId,
      position: index,
    })),
    ...report.topRetailRanking.map((skuId, index) => ({
      entryType: 'sku' as const,
      entryId: skuId,
      position: report.topServiceRanking.length + index,
    })),
  ];

  return {
    ...draft,
    editReportId: report.reportId,
    includedSkuIds: report.skuObservations.map((entry) => entry.skuId),
    seededReportedAt,
    reportedAt: seededReportedAt,
    reportNotes: report.notes ?? '',
    rows: Object.fromEntries(
      snapshot.skus.map((sku) => {
        const observation = report.skuObservations.find((entry) => entry.skuId === sku.skuId);
        return [
          sku.skuId,
          {
            unitsInStock: formatEditableWholeNumber(observation?.unitsInStock ?? sku.unitsInStock),
            costPerUnit: moneyDraftValue(observation?.costPerUnit ?? sku.costPerUnit),
            productPrice:
              observation?.productPrice !== undefined
                ? moneyDraftValue(observation.productPrice)
                : moneyDraftValue(sku.productPrice),
            restockIncluded: observation?.restockIncluded ?? false,
            retailStockout: observation?.retailStockout ?? false,
            notes: observation?.notes ?? '',
          },
        ];
      }),
    ),
    serviceDrafts: Object.fromEntries(
      snapshot.services.map((service) => [
        service.serviceId,
        {
          price: moneyDraftValue(priceAdjustmentById.get(service.serviceId) ?? service.price),
          stockout: serviceSignalById.get(service.serviceId)?.stockout === true,
          notes: serviceSignalById.get(service.serviceId)?.notes ?? '',
        },
      ]),
    ),
    rankingDraft:
      preferredRankingEntries.length > 0
        ? normalizeReportRanking(snapshot, preferredRankingEntries)
        : buildDefaultReportRanking(snapshot),
  };
}

export function hasMeaningfulOperationsSessionChanges(
  snapshot: InventorySnapshot,
  draft: OperationsSessionDraft,
  rankingBaseline: RankingEntry[] = buildDefaultReportRanking(snapshot),
  baselineDraft?: OperationsSessionDraft | null,
) {
  const baseline = baselineDraft ?? {
    ...createOperationsSessionDraft(snapshot),
    seededReportedAt: draft.seededReportedAt,
    reportedAt: draft.seededReportedAt,
  };

  if (draft.reportedAt !== baseline.reportedAt) {
    return true;
  }
  if (draft.reportNotes.trim() !== baseline.reportNotes.trim()) {
    return true;
  }
  if (
    draft.preset !== baseline.preset ||
    draft.rowFilter !== baseline.rowFilter ||
    draft.serviceFilter !== baseline.serviceFilter
  ) {
    return true;
  }

  const hasSkuChanges = snapshot.skus.some((sku) => {
    const row = draft.rows[sku.skuId];
    const baselineRow = baseline.rows[sku.skuId];
    if (!row) {
      return false;
    }

    return (
      parseEditableNumberWithCommas(row.unitsInStock) !==
        sanitizeWholeNumberForDisplay(
          parseEditableNumberWithCommas(baselineRow?.unitsInStock ?? formatEditableWholeNumber(sku.unitsInStock)),
        ) ||
      comparableMoneyDraftValue(row.costPerUnit) !== comparableMoneyDraftValue(baselineRow?.costPerUnit ?? moneyDraftValue(sku.costPerUnit)) ||
      comparableMoneyDraftValue(row.productPrice) !==
        (baselineRow
          ? comparableMoneyDraftValue(baselineRow.productPrice)
          : comparableMoneyDraftValue(moneyDraftValue(sku.productPrice))) ||
      row.restockIncluded !== (baselineRow?.restockIncluded ?? false) ||
      row.retailStockout !== (baselineRow?.retailStockout ?? false) ||
      row.notes.trim() !== (baselineRow?.notes.trim() ?? '')
    );
  });

  if (hasSkuChanges) {
    return true;
  }

  const hasServiceChanges = snapshot.services.some((service) => {
    const serviceDraft = draft.serviceDrafts[service.serviceId];
    const baselineServiceDraft = baseline.serviceDrafts[service.serviceId];
    if (!serviceDraft) {
      return false;
    }

    return (
      serviceDraft.stockout !== (baselineServiceDraft?.stockout ?? false) ||
      comparableMoneyDraftValue(serviceDraft.price) !== comparableMoneyDraftValue(baselineServiceDraft?.price ?? moneyDraftValue(service.price)) ||
      serviceDraft.notes.trim() !== (baselineServiceDraft?.notes.trim() ?? '')
    );
  });

  if (hasServiceChanges) {
    return true;
  }

  return hasRankingChanged(rankingBaseline, draft.rankingDraft);
}

export function OperationsSessionProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<OperationsSessionDraft | null>(null);

  const ensureDraft = useCallback((snapshot: InventorySnapshot) => {
    let nextDraft: OperationsSessionDraft | null = null;
    setDraft((current) => {
      if (current) {
        nextDraft = current;
        return current;
      }
      const seededDraft = createOperationsSessionDraft(snapshot);
      nextDraft = seededDraft;
      return seededDraft;
    });
    return nextDraft ?? createOperationsSessionDraft(snapshot);
  }, []);

  const updateDraft = useCallback(
    (updater: (current: OperationsSessionDraft) => OperationsSessionDraft) => {
      let nextDraft: OperationsSessionDraft | null = null;
      setDraft((current) => {
        if (!current) {
          nextDraft = null;
          return current;
        }
        nextDraft = updater(current);
        return nextDraft;
      });
      return nextDraft;
    },
    [],
  );

  const clearDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const replaceDraft = useCallback((nextDraft: OperationsSessionDraft) => {
    setDraft(nextDraft);
  }, []);

  const value = useMemo<OperationsSessionContextValue>(
    () => ({
      draft,
      hasDraft: draft !== null,
      ensureDraft,
      replaceDraft,
      updateDraft,
      clearDraft,
    }),
    [clearDraft, draft, ensureDraft, replaceDraft, updateDraft],
  );

  return (
    <OperationsSessionContext.Provider value={value}>
      {children}
    </OperationsSessionContext.Provider>
  );
}

export function useOperationsSession() {
  const value = useContext(OperationsSessionContext);
  if (!value) {
    throw new Error('OperationsSessionProvider is missing');
  }
  return value;
}
