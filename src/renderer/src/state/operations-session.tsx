import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { InventorySnapshot } from '@shared/inventory';

export type OperationsSessionPreset = 'small' | 'medium' | 'big';
export type OperationsSessionStepId = 'details' | 'observations' | 'services' | 'review';
export type OperationsSessionRowFilter = 'all' | 'changed';

export interface OperationsSessionRowDraft {
  unitsInStock: string;
  costPerUnit: string;
  restockIncluded: boolean;
  retailStockout: boolean;
  notes: string;
}

export interface OperationsSessionServiceDraft {
  price: string;
  stockout: boolean;
}

export interface OperationsSessionDraft {
  seededReportedAt: string;
  reportedAt: string;
  reportNotes: string;
  preset: OperationsSessionPreset;
  rowFilter: OperationsSessionRowFilter;
  rows: Record<string, OperationsSessionRowDraft>;
  serviceDrafts: Record<string, OperationsSessionServiceDraft>;
  lastStep: OperationsSessionStepId;
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
    rows: Object.fromEntries(
      snapshot.skus.map((sku) => [
        sku.skuId,
        {
          unitsInStock: String(sku.unitsInStock),
          costPerUnit: String(sku.costPerUnit),
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
        },
      ]),
    ),
    lastStep: 'details',
  };
}

export function hasMeaningfulOperationsSessionChanges(
  snapshot: InventorySnapshot,
  draft: OperationsSessionDraft,
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
      row.restockIncluded ||
      row.retailStockout ||
      row.notes.trim().length > 0
    );
  });

  if (hasSkuChanges) {
    return true;
  }

  return snapshot.services.some((service) => {
    const serviceDraft = draft.serviceDrafts[service.serviceId];
    if (!serviceDraft) {
      return false;
    }

    return serviceDraft.stockout || Number(serviceDraft.price) !== service.price;
  });
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
