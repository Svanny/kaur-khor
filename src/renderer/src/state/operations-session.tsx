import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { InventorySnapshot, RankingEntry } from '@shared/inventory';
import {
  buildDefaultReportRanking,
  hasRankingChanged,
} from '@/components/system/merchandising-editor';

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
  updateDraft: (
    updater: (current: OperationsSessionDraft) => OperationsSessionDraft,
  ) => OperationsSessionDraft | null;
  clearDraft: () => void;
}

const OperationsSessionContext = createContext<OperationsSessionContextValue | null>(null);

function toLocalDateTimeValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function createOperationsSessionDraft(
  snapshot: InventorySnapshot,
): OperationsSessionDraft {
  const seededReportedAt = toLocalDateTimeValue();
  return {
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
          unitsInStock: String(sku.unitsInStock),
          costPerUnit: String(sku.costPerUnit),
          productPrice: sku.productPrice == null ? '' : String(sku.productPrice),
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
          price: String(service.price),
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

export function hasMeaningfulOperationsSessionChanges(
  snapshot: InventorySnapshot,
  draft: OperationsSessionDraft,
  rankingBaseline: RankingEntry[] = buildDefaultReportRanking(snapshot),
) {
  if (draft.reportedAt !== draft.seededReportedAt) {
    return true;
  }
  if (draft.reportNotes.trim().length > 0) {
    return true;
  }
  if (draft.preset !== 'small' || draft.rowFilter !== 'all') {
    return true;
  }

  const hasSkuChanges = snapshot.skus.some((sku) => {
    const row = draft.rows[sku.skuId];
    if (!row) {
      return false;
    }

    return (
      Number(row.unitsInStock) !== sku.unitsInStock ||
      Number(row.costPerUnit) !== sku.costPerUnit ||
      (row.productPrice.trim() === '' ? null : Number(row.productPrice)) !== sku.productPrice ||
      row.restockIncluded ||
      row.retailStockout ||
      row.notes.trim().length > 0
    );
  });

  if (hasSkuChanges) {
    return true;
  }

  const hasServiceChanges = snapshot.services.some((service) => {
    const serviceDraft = draft.serviceDrafts[service.serviceId];
    if (!serviceDraft) {
      return false;
    }

    return (
      serviceDraft.stockout ||
      Number(serviceDraft.price) !== service.price ||
      serviceDraft.notes.trim().length > 0
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

  const value = useMemo<OperationsSessionContextValue>(
    () => ({
      draft,
      hasDraft: draft !== null,
      ensureDraft,
      updateDraft,
      clearDraft,
    }),
    [clearDraft, draft, ensureDraft, updateDraft],
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
